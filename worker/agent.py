import json
import logging
import platform
import time
from pathlib import Path

import docker
import psutil
import redis
import requests

from config import settings
from metrics import publish_metrics

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("worker-agent")

STATE_FILE = Path(__file__).parent / "machine_state.json"
JOBS_QUEUE_KEY = "jobs:queue"
METRICS_INTERVAL_SECONDS = 5

docker_client = docker.from_env()
redis_client = redis.from_url(
    settings.redis_url,
    decode_responses=True,
    socket_timeout=35,
    socket_connect_timeout=5,
)


def get_access_token() -> str:
    response = requests.post(
        f"{settings.api_base_url}/auth/login",
        data={
            "username": settings.worker_email,
            "password": settings.worker_password,
        },
        timeout=10,
    )
    response.raise_for_status()
    logger.info("Authenticated with backend successfully.")
    return response.json()["access_token"]


def get_machine_specs() -> dict:
    return {
        "cpu_cores": psutil.cpu_count(logical=True),
        "ram_gb": round(psutil.virtual_memory().total / (1024 ** 3), 2),
        "gpu_info": None,
        "os": f"{platform.system()} {platform.release()}",
    }


def load_machine_state() -> dict | None:
    if STATE_FILE.exists():
        with open(STATE_FILE) as f:
            return json.load(f)
    return None


def save_machine_state(machine_id: str, specs: dict) -> None:
    with open(STATE_FILE, "w") as f:
        json.dump({"machine_id": machine_id, "specs": specs}, f)


def register_machine(token: str) -> tuple[str, dict]:
    state = load_machine_state()
    if state and "machine_id" in state and "specs" in state:
        logger.info(f"Reusing existing machine registration: {state['machine_id']}")
        return state["machine_id"], state["specs"]

    specs = get_machine_specs()
    response = requests.post(
        f"{settings.api_base_url}/machines",
        json=specs,
        headers={"Authorization": f"Bearer {token}"},
        timeout=10,
    )
    response.raise_for_status()
    machine = response.json()
    save_machine_state(machine["id"], specs)
    logger.info(f"Registered new machine: {machine['id']}")
    return machine["id"], specs


def send_heartbeat(token: str, machine_id: str, max_retries: int = 3) -> bool:
    for attempt in range(1, max_retries + 1):
        try:
            requests.post(
                f"{settings.api_base_url}/machines/{machine_id}/heartbeat",
                headers={"Authorization": f"Bearer {token}"},
                timeout=10,
            ).raise_for_status()
            logger.info("Heartbeat sent.")
            return True
        except requests.RequestException as e:
            wait = 2 ** attempt
            logger.warning(
                f"Heartbeat attempt {attempt}/{max_retries} failed: {e}. "
                f"Retry in {wait}s."
            )
            time.sleep(wait)
    logger.error("All heartbeat attempts failed.")
    return False


def fetch_job_requirements(token: str, job_id: str) -> dict | None:
    try:
        response = requests.get(
            f"{settings.api_base_url}/jobs/{job_id}/requirements",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10,
        )
        if response.status_code == 404:
            logger.info(f"Job {job_id} no longer exists. Skipping.")
            return None
        response.raise_for_status()
        return response.json()
    except requests.RequestException as e:
        logger.error(f"Failed to fetch requirements for job {job_id}: {e}")
        return None


def can_handle_job(machine_specs: dict, job: dict) -> bool:
    has_cpu = machine_specs["cpu_cores"] >= job["required_cpu"]
    has_ram = machine_specs["ram_gb"] >= job["required_ram"]
    has_gpu = True
    if job.get("required_gpu"):
        has_gpu = machine_specs.get("gpu_info") is not None
    return has_cpu and has_ram and has_gpu


def claim_job(token: str, job_id: str, machine_id: str) -> dict | None:
    try:
        response = requests.post(
            f"{settings.api_base_url}/jobs/{job_id}/claim",
            json={"machine_id": machine_id},
            headers={"Authorization": f"Bearer {token}"},
            timeout=10,
        )
        if response.status_code == 409:
            logger.warning(f"Job {job_id} already claimed. Skipping.")
            return None
        response.raise_for_status()
        return response.json()
    except requests.RequestException as e:
        logger.error(f"Failed to claim job {job_id}: {e}")
        return None


def report_job_result(token: str, job_id: str, output: str, failed: bool) -> None:
    try:
        requests.post(
            f"{settings.api_base_url}/jobs/{job_id}/complete",
            json={"result_output": output, "failed": failed},
            headers={"Authorization": f"Bearer {token}"},
            timeout=10,
        ).raise_for_status()
    except requests.RequestException as e:
        logger.error(f"Failed to report result for job {job_id}: {e}")


def execute_job_in_docker(command: str) -> tuple[str, bool]:
    try:
        output = docker_client.containers.run(
            image="python:3.12-slim",
            command=["sh", "-c", command],
            detach=False,
            remove=True,
            mem_limit="512m",
            nano_cpus=1_000_000_000,
            network_disabled=True,
            user="1000:1000",
            read_only=True,
            tmpfs={"/tmp": "size=64m"},
        )
        return output.decode("utf-8"), False
    except docker.errors.ContainerError as e:
        stderr = e.stderr.decode("utf-8") if e.stderr else str(e)
        return stderr, True
    except Exception as e:
        return str(e), True


def process_one_job(token: str, machine_id: str, machine_specs: dict) -> None:
    try:
        logger.info("Waiting for job from queue...")
        result = redis_client.brpop(JOBS_QUEUE_KEY, timeout=30)
    except redis.exceptions.TimeoutError:
        logger.debug("BRPOP cycle timed out (queue idle). Looping back.")
        return

    if result is None:
        return

    _, job_id = result
    logger.info(f"Popped job {job_id} from queue.")

    job = fetch_job_requirements(token, job_id)
    if job is None:
        return

    if job["status"] != "pending":
        logger.info(f"Job {job_id} status={job['status']}. Skipping.")
        return

    if not can_handle_job(machine_specs, job):
        logger.warning(
            f"Job {job_id} requires {job['required_cpu']} cores / "
            f"{job['required_ram']}GB RAM — this machine has "
            f"{machine_specs['cpu_cores']} cores / "
            f"{machine_specs['ram_gb']}GB RAM. Pushing back."
        )
        redis_client.rpush(JOBS_QUEUE_KEY, job_id)
        time.sleep(5)
        return

    claimed = claim_job(token, job_id, machine_id)
    if claimed is None:
        return

    logger.info(f"Executing: {claimed['command']}")
    output, failed = execute_job_in_docker(claimed["command"])
    reportob_result(token, job_id, output, failed)
    logger.info(f"Job {job_id} {'FAILED' if failed else 'completed'}.")


def main():
    logger.info("Starting worker agent...")
    token = get_access_token()
    machine_id, machine_specs = register_machine(token)

    logger.info(
        f"This machine: {machine_specs['cpu_cores']} cores, "
        f"{machine_specs['ram_gb']}GB RAM, "
        f"GPU: {machine_specs.get('gpu_info') or 'none'}"
    )

    send_heartbeat(token, machine_id)

    logger.info("Entering main loop. Press Ctrl+C to stop.")
    last_heartbeat = time.time()
    last_metrics = time.time()

    try:
        while True:
            process_one_job(token, machine_id, machine_specs)

            now = time.time()

            if now - last_metrics >= METRICS_INTERVAL_SECONDS:
                publish_metrics(machine_id)
                last_metrics = now

            if now - last_heartbeat >= settings.heartbeat_interval_seconds:
                send_heartbeat(token, machine_id)
                last_heartbeat = now

    except KeyboardInterrupt:
        logger.info("Worker agent shutting down gracefully.")


if __name__ == "__main__":
    main()
