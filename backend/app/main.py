import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from prometheus_fastapi_instrumentator import Instrumentator

from app.database import engine, Base
from app.failure_detector import run_failure_detector
from app.routers import auth, machines, jobs, metrics

logger = logging.getLogger("main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create all tables directly — no alembic needed in production
    logger.info("Creating database tables...")
    Base.metadata.create_all(bind=engine)
    logger.info("Database tables ready.")

    logger.info("Starting background services...")
    detector_task = asyncio.create_task(run_failure_detector())
    yield

    logger.info("Shutting down background services...")
    detector_task.cancel()
    try:
        await detector_task
    except asyncio.CancelledError:
        logger.info("Failure detector stopped cleanly.")


app = FastAPI(title="Distributed Resources API", lifespan=lifespan)

Instrumentator().instrument(app).expose(app)

app.include_router(auth.router)
app.include_router(machines.router)
app.include_router(jobs.router)
app.include_router(metrics.router)


@app.get("/health")
def health_check():
    return {"status": "ok"}
