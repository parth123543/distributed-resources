"""
Worker Agent for Distributed Resources platform.

Responsibilities:
1. Register this machine with the backend (once, idempotent via state file).
2. Send periodic heartbeats so the backend knows we're alive.
3. Block on Redis queue waiting for jobs.
4. Claim, execute (in Docker), and report each job.

Two loops run conceptually in parallel here — but since Python's GIL and
our simple use case don't require true threading yet, we interleave them:
the Redis BRPOP blocks for up to 30s, then we send a heartbeat, then
block again. This means heartbeats fire every ~30s minimum, not every
HEARTBEAT_INTERVAL_SECONDS exactly — that's an acceptable tradeoff for
now. A production upgrade would run heartbeats in a background thread.
"""
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

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("worker-agent")

STATE_FILE = Path(__file__).parent / "machine_state.json"
JOBS_QUEUE_KEY = "jobs:queue"

docker_client = docker.from_env()
redis_client = redis.from_url(
    settings.redis_url,
    decode_responses=True,
    socket_timeout=35,        # must be > BRPOP timeout (30s)
    socket_connect_timeout=5, # fail fast if Redis is unreachable at startup
)


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

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
    token = response.json()["access_token"]
    logger.info("Authenticated with backend successfully.")
    return token


# ---------------------------------------------------------------------------
# Machine registration
# ---------------------------------------------------------------------------

def get_machine_specs() -> dict:
    return {
        "cpu_cores": psutil.cpu_count(logical=True),
        "ram_gb": round(psutil.virtual_memory().total / (1024 ** 3), 2),
        "gpu_info": None,
        "os": f"{platform.system()} {platform.release()}",
    }


def load_saved_machine_id() -> str | None:
    if STATE_FILE.exists():
        with open(STATE_FILE) as f:
            return json.load(f).get("machine_id")
    return None


def save_machine_id(machine_id: str) -> None:
    with open(STATE_FILE, "w") as f:
        json.dump({"machine_id": machine_id}, f)


def register_machine(token: str) -> str:
    existing_id = load_saved_machine_id()
    if existing_id:
        logger.info(f"Reusing existing machine registration: {existing_id}")
        return existing_id

    specs = get_machine_specs()
    response = requests.post(
        f"{settings.api_base_url}/machines",
        json=specs,
        headers={"Authorization": f"Bearer {token}"},
        timeout=10,
    )
    response.raise_for_status()
    machine = response.json()
    save_machine_id(machine["id"])
    logger.info(f"Registered new machine: {machine['id']}")
    return machine["id"]


# ---------------------------------------------------------------------------
# Heartbeat
# ---------------------------------------------------------------------------

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
            logger.warning(f"Heartbeat attempt {attempt}/{max_retries} failed: {e}. Retry in {wait}s.")
            time.sleep(wait)
    logger.error("All heartbeat attempts failed.")
    return False


# ---------------------------------------------------------------------------
# Job execution
# ---------------------------------------------------------------------------

def claim_job(token: str, job_id: str, machine_id: str) -> dict | None:
    """
    Tell the backend: 'I am taking this job.'
    Returns the job dict if successful, None if already claimed by someone else.
    """
    try:
        response = requests.post(
            f"{settings.api_base_url}/jobs/{job_id}/claim",
            json={"machine_id": machine_id},
            headers={"Authorization": f"Bearer {token}"},
            timeout=10,
        )
        if response.status_code == 409:
            logger.warning(f"Job {job_id} was already claimed. Skipping.")
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
    """
    Run the job command inside an isolated, resource-limited container.
    Security flags are explained inline.
    """
    try:
        output = docker_client.containers.run(
            image="python:3.12-slim",
            command=["sh", "-c", command],
            detach=False,
            remove=True,
            mem_limit="512m",
            nano_cpus=1_000_000_000,  # 1 full CPU core
            network_disabled=True,    # no outbound network access
            user="1000:1000",         # non-root inside container
            read_only=True,           # immutable filesystem
            tmpfs={"/tmp": "size=64m"},  # writable scratch space only
        )
        return output.decode("utf-8"), False
    except docker.errors.ContainerError as e:
        stderr = e.stderr.decode("utf-8") if e.stderr else str(e)
        return stderr, True
    except Exception as e:
        return str(e), True

def process_one_job(token: str, machine_id: str) -> None:
    """
    Block on Redis until a job arrives, then claim, execute, report.
    Handles TimeoutError gracefully — it just means no job arrived
    during this BRPOP cycle, which is normal during idle periods.
    """
    try:
        logger.info("Waiting for job from queue...")
        result = redis_client.brpop(JOBS_QUEUE_KEY, timeout=30)
    except redis.exceptions.TimeoutError:
        # Socket timeout fired before BRPOP timeout — perfectly normal,
        # just means the queue was empty. Loop back and wait again.
        logger.debug("BRPOP cycle timed out (queue idle). Looping back.")
        return

    if result is None:
        return

    _, job_id = result
    logger.info(f"Popped job {job_id} from queue.")

    job = claim_job(token, job_id, machine_id)
    if job is None:
        return

    logger.info(f"Executing: {job['command']}")
    output, failed = execute_job_in_docker(job["command"])
    report_job_result(token, job_id, output, failed)
    logger.info(f"Job {job_id} {'FAILED' if failed else 'completed'}.")


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------

def main():
    logger.info("Starting worker agent...")
    token = get_access_token()
    machine_id = register_machine(token)
    send_heartbeat(token, machine_id)

    logger.info("Entering main loop. Press Ctrl+C to stop.")
    last_heartbeat = time.time()

    try:
        while True:
            process_one_job(token, machine_id)

            # Send a heartbeat if enough time has passed since the last one.
            # This runs after each BRPOP cycle (which blocks up to 30s),
            # so heartbeats fire at most every ~30s rather than exactly
            # every HEARTBEAT_INTERVAL_SECONDS — acceptable for now.
            now = time.time()
            if now - last_heartbeat >= settings.heartbeat_interval_seconds:
                send_heartbeat(token, machine_id)
                last_heartbeat = now

    except KeyboardInterrupt:
        logger.info("Worker agent shutting down gracefully.")


if __name__ == "__main__":
    main()