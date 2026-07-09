import uuid
from datetime import datetime
from pydantic import BaseModel, EmailStr, ConfigDict, Field
from app.models import JobStatus
from app.models import UserRole

class UserCreate(BaseModel):
    email: EmailStr
    password: str

class JobClaim(BaseModel):
    machine_id: uuid.UUID


class UserOut(BaseModel):
    id: uuid.UUID
    email: EmailStr
    role: UserRole
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"

class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=64)

from typing import Optional
from app.models import MachineStatus


class MachineCreate(BaseModel):
    cpu_cores: int = Field(gt=0)
    ram_gb: float = Field(gt=0)
    gpu_info: Optional[str] = None
    os: str = Field(min_length=1)


class MachineUpdate(BaseModel):
    cpu_cores: Optional[int] = Field(default=None, gt=0)
    ram_gb: Optional[float] = Field(default=None, gt=0)
    gpu_info: Optional[str] = None
    os: Optional[str] = None
    status: Optional[MachineStatus] = None


class MachineOut(BaseModel):
    id: uuid.UUID
    owner_id: uuid.UUID
    cpu_cores: int
    ram_gb: float
    gpu_info: Optional[str]
    os: str
    status: MachineStatus
    last_heartbeat: Optional[datetime]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class JobCreate(BaseModel):
    required_cpu: int = Field(gt=0)
    required_ram: float = Field(gt=0)
    required_gpu: Optional[str] = None
    priority: int = Field(default=0, ge=0)
    command: str = Field(min_length=1)  # the shell command to run inside the container


class JobOut(BaseModel):
    id: uuid.UUID
    submitted_by: uuid.UUID
    assigned_machine_id: Optional[uuid.UUID]
    status: JobStatus
    required_cpu: int
    required_ram: float
    required_gpu: Optional[str]
    priority: int
    command: str
    result_output: Optional[str] = None
    created_at: datetime
    started_at: Optional[datetime]
    completed_at: Optional[datetime]

    model_config = ConfigDict(from_attributes=True)

class JobRequirements(BaseModel):
    id: uuid.UUID
    required_cpu: int
    required_ram: float
    required_gpu: Optional[str]
    priority: int
    status: JobStatus

    model_config = ConfigDict(from_attributes=True)

class JobComplete(BaseModel):
    result_output: str
    failed: bool = False