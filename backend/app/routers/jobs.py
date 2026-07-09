import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import crud, models, schemas, deps
from app.database import get_db
from app.queue import push_job

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.post("", response_model=schemas.JobOut, status_code=status.HTTP_201_CREATED)
def submit_job(
    job_in: schemas.JobCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_user),
):
    """
    Create job in DB first, then push to Redis.
    Order matters: if we pushed to Redis first and then the DB write
    failed, a worker would try to claim a non-existent job. DB first
    ensures the record always exists before any worker can see it.
    """
    job = crud.create_job(db, job_in, submitted_by=current_user.id)
    push_job(str(job.id))
    return job


@router.get("", response_model=list[schemas.JobOut])
def list_my_jobs(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_user),
):
    return crud.list_jobs_for_user(db, current_user.id)


@router.get("/{job_id}", response_model=schemas.JobOut)
def get_job(
    job_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_user),
):
    job = crud.get_job_by_id(db, job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found.")
    if job.submitted_by != current_user.id and current_user.role != models.UserRole.admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your job.")
    return job


@router.delete("/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_job(
    job_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_user),
):
    job = crud.get_job_by_id(db, job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found.")
    if job.submitted_by != current_user.id and current_user.role != models.UserRole.admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your job.")
    db.delete(job)
    db.commit()



@router.get("/{job_id}/requirements", response_model=schemas.JobRequirements)
def get_job_requirements(
    job_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_user),
):
    """
    Lets a worker inspect a job's resource requirements before deciding
    whether to claim it. This is the key to resource-aware scheduling:
    pop from queue → inspect → claim if capable, push back if not.
    """
    job = crud.get_job_by_id(db, job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found.")
    return job


@router.post("/{job_id}/claim", response_model=schemas.JobOut)
def claim_job(
    job_id: uuid.UUID,
    claim: schemas.JobClaim,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_user),
):
    """
    Called by a worker immediately after popping a job_id from Redis.
    Verifies the machine belongs to this user, then atomically marks
    the job as running and assigns it to that machine.
    """
    job = crud.get_job_by_id(db, job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found.")

    machine = crud.get_machine_by_id(db, claim.machine_id)
    if machine is None or machine.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Machine not found or not yours.",
        )
    
    claimed = crud.claim_job(db, job, claim.machine_id)
    if claimed is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Job was already claimed by another worker.",
        )
    return claimed


@router.post("/{job_id}/complete", response_model=schemas.JobOut)
def complete_job(
    job_id: uuid.UUID,
    result: schemas.JobComplete,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_user),
):
    job = crud.get_job_by_id(db, job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found.")
    if job.assigned_machine_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Job has no assigned machine.")
    machine = crud.get_machine_by_id(db, job.assigned_machine_id)
    if machine is None or machine.owner_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your machine's job.")
    return crud.complete_job(db, job, result.result_output, failed=result.failed)