import asyncio
import logging

from app.config import settings
from app.database import SessionLocal
from app import crud
from app.queue import push_job

logger = logging.getLogger("failure-detector")


async def detect_and_recover() -> None:
    db = SessionLocal()
    try:
        stale_machines = crud.get_stale_machines(
            db, timeout_seconds=settings.heartbeat_timeout_seconds
        )

        if not stale_machines:
            return

        for machine in stale_machines:
            logger.warning(
                f"Machine {machine.id} has missed heartbeats — marking offline."
            )
            crud.mark_machine_offline(db, machine)

            running_jobs = crud.get_running_jobs_for_machine(db, machine.id)
            for job in running_jobs:
                logger.warning(
                    f"Requeueing job {job.id} (was running on dead machine {machine.id})."
                )
                crud.requeue_job(db, job)
                push_job(str(job.id))
                logger.info(f"Job {job.id} pushed back to Redis queue.")

    except Exception as e:
        logger.error(f"Failure detector cycle error: {e}", exc_info=True)
    finally:
        db.close()


async def run_failure_detector() -> None:
    logger.info(
        f"Failure detector started. "
        f"Checking every {settings.failure_check_interval_seconds}s, "
        f"timeout threshold: {settings.heartbeat_timeout_seconds}s."
    )
    while True:
        await asyncio.sleep(settings.failure_check_interval_seconds)
        await detect_and_recover()
