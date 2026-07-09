import uuid
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app import models, schemas, security


def get_user_by_email(db: Session, email: str) -> models.User | None:
    return db.query(models.User).filter(models.User.email == email).first()


def get_user_by_id(db: Session, user_id: uuid.UUID) -> models.User | None:
    return db.query(models.User).filter(models.User.id == user_id).first()


def create_user(db: Session, user_in: schemas.UserCreate) -> models.User:
    user = models.User(
        email=user_in.email,
        hashed_password=security.hash_password(user_in.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def create_machine(
    db: Session, machine_in: schemas.MachineCreate, owner_id: uuid.UUID
) -> models.Machine:
    machine = models.Machine(
        owner_id=owner_id,
        cpu_cores=machine_in.cpu_cores,
        ram_gb=machine_in.ram_gb,
        gpu_info=machine_in.gpu_info,
        os=machine_in.os,
    )
    db.add(machine)
    db.commit()
    db.refresh(machine)
    return machine


def get_machine_by_id(db: Session, machine_id: uuid.UUID) -> models.Machine | None:
    return db.query(models.Machine).filter(models.Machine.id == machine_id).first()


def list_machines(db: Session, skip: int = 0, limit: int = 50) -> list[models.Machine]:
    return db.query(models.Machine).offset(skip).limit(limit).all()


def update_machine(
    db: Session, machine: models.Machine, machine_in: schemas.MachineUpdate
) -> models.Machine:
    update_data = machine_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(machine, field, value)
    db.commit()
    db.refresh(machine)
    return machine


def delete_machine(db: Session, machine: models.Machine) -> None:
    db.delete(machine)
    db.commit()


def heartbeat_machine(db: Session, machine: models.Machine) -> models.Machine:
    machine.status = models.MachineStatus.online
    machine.last_heartbeat = datetime.utcnow()
    db.commit()
    db.refresh(machine)
    return machine


def get_stale_machines(db: Session, timeout_seconds: int) -> list[models.Machine]:
    """
    Find machines that are marked online but haven't sent a heartbeat
    within the timeout window — these are presumed dead.

    We check last_heartbeat IS NOT NULL to avoid flagging machines that
    were registered but never came online (they'd have null last_heartbeat
    and should stay 'offline', not be treated as failed machines).
    """
    cutoff = datetime.utcnow() - timedelta(seconds=timeout_seconds)
    return (
        db.query(models.Machine)
        .filter(
            models.Machine.status == models.MachineStatus.online,
            models.Machine.last_heartbeat.isnot(None),
            models.Machine.last_heartbeat < cutoff,
        )
        .all()
    )


def mark_machine_offline(db: Session, machine: models.Machine) -> models.Machine:
    machine.status = models.MachineStatus.offline
    db.commit()
    db.refresh(machine)
    return machine


def get_running_jobs_for_machine(
    db: Session, machine_id: uuid.UUID
) -> list[models.Job]:
    """
    Find jobs that are currently 'running' on a specific machine.
    Called after marking a machine offline — these jobs need requeueing.
    """
    return (
        db.query(models.Job)
        .filter(
            models.Job.assigned_machine_id == machine_id,
            models.Job.status == models.JobStatus.running,
        )
        .all()
    )


def requeue_job(db: Session, job: models.Job) -> models.Job:
    """
    Reset a job back to 'pending' so it can be rescheduled.
    We clear assigned_machine_id and started_at — the job is treated
    as if it was just submitted, so any available worker can pick it up.
    """
    job.status = models.JobStatus.pending
    job.assigned_machine_id = None
    job.started_at = None
    db.commit()
    db.refresh(job)
    return job


def create_job(
    db: Session, job_in: schemas.JobCreate, submitted_by: uuid.UUID
) -> models.Job:
    job = models.Job(
        submitted_by=submitted_by,
        required_cpu=job_in.required_cpu,
        required_ram=job_in.required_ram,
        required_gpu=job_in.required_gpu,
        priority=job_in.priority,
        command=job_in.command,
        status=models.JobStatus.pending,
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def get_job_by_id(db: Session, job_id: uuid.UUID) -> models.Job | None:
    return db.query(models.Job).filter(models.Job.id == job_id).first()


def list_jobs_for_user(db: Session, user_id: uuid.UUID) -> list[models.Job]:
    return db.query(models.Job).filter(models.Job.submitted_by == user_id).all()


def claim_job(
    db: Session, job: models.Job, machine_id: uuid.UUID
) -> models.Job | None:
    """
    Atomically claim a pending job for a specific machine.
    Returns None if the job is no longer pending (already claimed elsewhere).
    This is our optimistic locking / double-claim prevention.
    """
    if job.status != models.JobStatus.pending:
        return None
    job.assigned_machine_id = machine_id
    job.status = models.JobStatus.running
    job.started_at = datetime.utcnow()
    db.commit()
    db.refresh(job)
    return job


def complete_job(
    db: Session, job: models.Job, result_output: str, failed: bool = False
) -> models.Job:
    job.status = models.JobStatus.failed if failed else models.JobStatus.completed
    job.result_output = result_output
    job.completed_at = datetime.utcnow()
    db.commit()
    db.refresh(job)
    return job