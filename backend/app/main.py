from fastapi import FastAPI
from app.routers import auth, machines, jobs

app = FastAPI(title="Distributed Resources API")

app.include_router(auth.router)
app.include_router(machines.router)


@app.get("/health")
def health_check():
    return {"status": "ok"}

app.include_router(jobs.router)