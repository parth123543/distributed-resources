import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, Float, ForeignKey, DateTime, Enum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import enum

from app.database import Base


class UserRole(str, enum.Enum):
    student = "student"
    admin = "admin"


class MachineStatus(str, enum.Enum):
    online = "online"
    offline = "offline"
    busy = "busy"


class JobStatus(str, enum.Enum):
    pending = "pending"
    scheduled = "scheduled"
    running = "running"
    completed = "completed"
    failed = "failed"


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String, unique=True, nullable=False, index=True)
    hashed_password = Column(String, nullable=False)
    role = Column(Enum(UserRole), default=UserRole.student, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    machines = relationship("Machine", back_populates="owner")
    jobs = relationship("Job", back_populates="submitted_by_user")


class Machine(Base):
    __tablename__ = "machines"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    cpu_cores = Column(Integer, nullable=False)
    ram_gb = Column(Float, nullable=False)
    gpu_info = Column(String, nullable=True)
    os = Column(String, nullable=False)
    status = Column(Enum(MachineStatus), default=MachineStatus.offline, nullable=False)
    last_heartbeat = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    owner = relationship("User", back_populates="machines")
    jobs = relationship("Job", back_populates="assigned_machine")


class Job(Base):
    __tablename__ = "jobs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    submitted_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    assigned_machine_id = Column(UUID(as_uuid=True), ForeignKey("machines.id"), nullable=True)
    status = Column(Enum(JobStatus), default=JobStatus.pending, nullable=False)
    required_cpu = Column(Integer, nullable=False)
    required_ram = Column(Float, nullable=False)
    required_gpu = Column(String, nullable=True)
    priority = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)

    submitted_by_user = relationship("User", back_populates="jobs")
    assigned_machine = relationship("Machine", back_populates="jobs")
    logs = relationship("JobLog", back_populates="job")
    command = Column(String, nullable=False)
    result_output = Column(String, nullable=True)


class JobLog(Base):
    __tablename__ = "job_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    job_id = Column(UUID(as_uuid=True), ForeignKey("jobs.id"), nullable=False)
    event_type = Column(String, nullable=False)
    message = Column(String, nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow)

    job = relationship("Job", back_populates="logs")