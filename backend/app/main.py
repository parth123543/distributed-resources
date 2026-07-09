"""
Application entrypoint.

Uses FastAPI's lifespan context manager (introduced in FastAPI 0.95)
to manage startup and shutdown logic cleanly. This replaces the older
@app.on_event("startup") / @app.on_event("shutdown") pattern, which
is now deprecated.

On startup: launch the failure detector as a background asyncio task.
On shutdown: cancel it cleanly so we don't leave orphaned coroutines.
"""
import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.failure_detector import run_failure_detector
from app.routers import auth, machines, jobs

logger = logging.getLogger("main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- Startup ---
    logger.info("Starting background services...")
    detector_task = asyncio.create_task(run_failure_detector())

    yield  # application runs here, handling requests normally

    # --- Shutdown ---
    logger.info("Shutting down background services...")
    detector_task.cancel()
    try:
        await detector_task
    except asyncio.CancelledError:
        logger.info("Failure detector stopped cleanly.")


app = FastAPI(title="Distributed Resources API", lifespan=lifespan)

app.include_router(auth.router)
app.include_router(machines.router)
app.include_router(jobs.router)


@app.get("/health")
def health_check():
    return {"status": "ok"}