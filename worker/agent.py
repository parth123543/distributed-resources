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

def load_machine_state() -> dict | None:
    if STATE_FILE.exists():
        with open(STATE_FILE) as f:
            return json.load(f)
    return None


def save_machine_state(machine_id: str, specs: dict) -> None:
    with open(STATE_FILE, "w") as f:
        json.dump({"machine_id": machine_id, "specs": specs}, f)

def fetch_job_requirements(token: str, job_id: str) -> dict | None:
    """
    Inspect a job's requirements before deciding to claim it.
    Returns None if the job is no longer available (already claimed,
    deleted, etc.) — worker should skip and move on.
    """
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
    """
    Check if this machine meets the job's minimum resource requirements.

    Why we check here and not just rely on the claim endpoint:
    Claiming is a write operation — it marks the job as 'running' in
    the DB. If we claim a job we can't run, we've locked it to a machine
    that will fail, and failure detection has to clean it up. Better to
    never claim it in the first place.
    """
    has_cpu = machine_specs["cpu_cores"] >= job["required_cpu"]
    has_ram = machine_specs["ram_gb"] >= job["required_ram"]

    # GPU check: if job requires a specific GPU, machine must have one.
    # If job has no GPU requirement, any machine qualifies.
    has_gpu = True
    if job.get("required_gpu"):
        has_gpu = machine_specs.get("gpu_info") is not None

    return has_cpu and has_ram and has_gpu

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

def process_one_job(token: str, machine_id: str, machine_specs: dict) -> None:
    """
    Full resource-aware job processing cycle:
    1. Block on Redis queue (BRPOP)
    2. Inspect job requirements
    3. If this machine can handle it → claim and execute
    4. If not → push back to queue, back off briefly, continue

    The backoff on step 4 is important: without it, a worker that can't
    handle any available jobs would spin in a tight loop, burning CPU
    and hammering Redis — exactly what we want to avoid.
    """
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

    # Step 1: inspect requirements before claiming
    job = fetch_job_requirements(token, job_id)
    if job is None:
        # Job disappeared (deleted, already completed) — discard and move on
        return

    if job["status"] != "pending":
        logger.info(f"Job {job_id} is no longer pending (status={job['status']}). Skipping.")
        return

    # Step 2: check if this machine can handle the job
    if not can_handle_job(machine_specs, job):
        logger.warning(
            f"Job {job_id} requires {job['required_cpu']} cores / "
            f"{job['required_ram']}GB RAM — this machine has "
            f"{machine_specs['cpu_cores']} cores / {machine_specs['ram_gb']}GB RAM. "
            f"Pushing back to queue."
        )
        # Push back to the END of the queue (RPUSH = right push) so other
        # workers get a chance before we see this job again.
        redis_client.rpush(JOBS_QUEUE_KEY, job_id)

        # Back off briefly to avoid a tight loop if we're the only worker
        # and can't handle any jobs currently in the queue.
        import time
        time.sleep(5)
        return

    # Step 3: claim the job
    claimed = claim_job(token, job_id, machine_id)
    if claimed is None:
        return  # someone else claimed it first — move on

    # Step 4: execute and report
    logger.info(f"Executing: {claimed['command']}")
    output, failed = execute_job_in_docker(claimed["command"])
    report_job_result(token, job_id, output, failed)
    logger.info(f"Job {job_id} {'FAILED' if failed else 'completed'}.")


def register_machine(token: str) -> tuple[str, dict]:
    """
    Returns (machine_id, specs) tuple.
    Specs are saved locally so the worker can check job compatibility
    without an extra API call on every queue cycle.
    """
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
    logger.info(f"Specs: {specs['cpu_cores']} cores, {specs['ram_gb']}GB RAM, OS: {specs['os']}")
    return machine["id"], specs


def fetch_job_requirements(token: str, job_id: str) -> dict | None:
    """
    Inspect a job's requirements before deciding to claim it.
    Returns None if the job is no longer available (already claimed,
    deleted, etc.) — worker should skip and move on.
    """
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
    """
    Check if this machine meets the job's minimum resource requirements.

    Why we check here and not just rely on the claim endpoint:
    Claiming is a write operation — it marks the job as 'running' in
    the DB. If we claim a job we can't run, we've locked it to a machine
    that will fail, and failure detection has to clean it up. Better to
    never claim it in the first place.
    """
    has_cpu = machine_specs["cpu_cores"] >= job["required_cpu"]
    has_ram = machine_specs["ram_gb"] >= job["required_ram"]

    # GPU check: if job requires a specific GPU, machine must have one.
    # If job has no GPU requirement, any machine qualifies.
    has_gpu = True
    if job.get("required_gpu"):
        has_gpu = machine_specs.get("gpu_info") is not None

    return has_cpu and has_ram and has_gpu


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------

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

    try:
        while True:
            process_one_job(token, machine_id, machine_specs)

            now = time.time()
            if now - last_heartbeat >= settings.heartbeat_interval_seconds:
                send_heartbeat(token, machine_id)
                last_heartbeat = now

    except KeyboardInterrupt:
        logger.info("Worker agent shutting down gracefully.")


if __name__ == "__main__":
    main()