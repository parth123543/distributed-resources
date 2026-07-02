import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import crud, models, schemas, deps
from app.database import get_db

router = APIRouter(prefix="/machines", tags=["machines"])


@router.post("", response_model=schemas.MachineOut, status_code=status.HTTP_201_CREATED)
def register_machine(
    machine_in: schemas.MachineCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_user),
):
    return crud.create_machine(db, machine_in, owner_id=current_user.id)


@router.get("", response_model=list[schemas.MachineOut])
def list_machines(
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_user),
):
    return crud.list_machines(db, skip=skip, limit=limit)


def _get_owned_machine_or_403(
    db: Session, machine_id: uuid.UUID, current_user: models.User
) -> models.Machine:
    machine = crud.get_machine_by_id(db, machine_id)
    if machine is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Machine not found."
        )
    is_owner = machine.owner_id == current_user.id
    is_admin = current_user.role == models.UserRole.admin
    if not (is_owner or is_admin):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to modify this machine.",
        )
    return machine


@router.put("/{machine_id}", response_model=schemas.MachineOut)
def update_machine(
    machine_id: uuid.UUID,
    machine_in: schemas.MachineUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_user),
):
    machine = _get_owned_machine_or_403(db, machine_id, current_user)
    return crud.update_machine(db, machine, machine_in)


@router.delete("/{machine_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_machine(
    machine_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_user),
):
    machine = _get_owned_machine_or_403(db, machine_id, current_user)
    crud.delete_machine(db, machine)

@router.post("/{machine_id}/heartbeat", response_model=schemas.MachineOut)
def heartbeat(
    machine_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_user),
):
    machine = _get_owned_machine_or_403(db, machine_id, current_user)
    return crud.heartbeat_machine(db, machine)