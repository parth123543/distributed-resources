<div align="center">

# Distributed Resources

**A campus-scale distributed computing platform.**
Students submit compute jobs; idle campus machines run them inside sandboxed Docker containers.

[![CI](https://github.com/parth123543/distributed-resources/actions/workflows/ci.yml/badge.svg)](https://github.com/parth123543/distributed-resources/actions)
![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=next.js&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?logo=postgresql&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-7-DC382D?logo=redis&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)

[Overview](#overview) · [Architecture](#architecture) · [Getting started](#getting-started) · [API](#api-overview) · [Design decisions](#design-decisions) · [Limitations](#known-limitations--roadmap)

</div>

---

## Overview

Students who need compute for ML training, simulations or data processing are limited by their own hardware, while lab and personal machines across campus sit idle overnight and on weekends.

Distributed Resources connects the two. A machine owner runs a small **worker agent**; a student submits a **job** (a command plus CPU/RAM requirements) through the web dashboard. The platform queues the job, a capable worker claims it, runs it in an isolated container, and the result comes back to the dashboard. Nothing runs directly on the donor's host.

It is a small-scale take on the ideas behind BOINC, Kubernetes scheduling and managed batch-compute services, built for a trusted campus network.

## Features

**Distributed core**
- Redis-backed job queue; workers block on `BRPOP`, so idle workers cost no CPU and each job id is delivered to exactly one worker
- Resource-aware matching: a worker inspects a job's CPU/RAM/GPU requirements before claiming it and pushes it back if it cannot run it
- Status-guarded claiming in PostgreSQL as a second line of defence against double execution
- Heartbeat-based failure detection: machines that stop heartbeating are marked offline and their running jobs are requeued automatically

**Security**
- JWT authentication, bcrypt password hashing, role-based access (`student`, `admin`)
- Object-level authorization: users can only read, modify or delete their own machines and jobs (admins excepted)
- Every job runs in a locked-down container: memory and CPU caps, no network, non-root user, read-only filesystem, auto-removed on exit

**Real-time and observability**
- Worker metrics (CPU, RAM, disk) flow through Redis pub/sub and a WebSocket relay to a live monitoring page
- Prometheus `/metrics` endpoint on the API and a pre-provisioned Grafana dashboard (request rate, p50/p95/p99 latency, error rate, per-endpoint latency)

**Frontend**
- Next.js (App Router) dashboard with job submission, machine registration, live charts, and a protected-route layout

## Architecture

```mermaid
flowchart LR
    subgraph Client
        B["Browser<br/>Next.js dashboard"]
    end

    subgraph CP["Control plane"]
        API["FastAPI backend<br/>JWT auth · REST · WebSocket relay"]
        FD["Failure detector<br/>asyncio background task"]
        PG[("PostgreSQL<br/>users · machines · jobs · job_logs")]
        RQ[("Redis<br/>job queue + metrics pub/sub")]
    end

    subgraph DM["Donor machines"]
        W1["Worker agent"] --> D1["Docker sandbox"]
        W2["Worker agent"] --> D2["Docker sandbox"]
    end

    subgraph OBS["Observability"]
        P["Prometheus"] --> G["Grafana"]
    end

    B -->|"REST / WebSocket"| API
    API --> PG
    API -->|"LPUSH job id"| RQ
    FD --> PG
    FD -->|"requeue"| RQ
    RQ -->|"BRPOP"| W1
    RQ -->|"BRPOP"| W2
    W1 -->|"claim / complete"| API
    W2 -->|"claim / complete"| API
    W1 -.->|"publish metrics"| RQ
    RQ -.->|"subscribe"| API
    P -->|"scrape /metrics"| API
```

### Job lifecycle

```mermaid
sequenceDiagram
    participant S as Student
    participant A as FastAPI
    participant P as PostgreSQL
    participant R as Redis
    participant W as Worker
    participant D as Docker

    S->>A: POST /jobs
    A->>P: insert job (pending)
    A->>R: LPUSH jobs:queue job_id
    A-->>S: 201 Created

    W->>R: BRPOP jobs:queue
    R-->>W: job_id
    W->>A: GET /jobs/:id/requirements

    alt machine meets requirements
        W->>A: POST /jobs/:id/claim
        A->>P: pending to running, assign machine
        A-->>W: 200 OK
        W->>D: run command in sandbox
        D-->>W: output and exit status
        W->>A: POST /jobs/:id/complete
        A->>P: store result (completed or failed)
    else insufficient resources
        W->>R: RPUSH jobs:queue job_id (back off 5s)
    end
```

### Failure recovery

1. Workers heartbeat to `POST /machines/:id/heartbeat`, which sets the machine `online` and updates `last_heartbeat`.
2. A background task in the API process runs every `FAILURE_CHECK_INTERVAL_SECONDS` (default 30).
3. Machines that are `online` but whose last heartbeat is older than `HEARTBEAT_TIMEOUT_SECONDS` (default 60) are marked `offline`.
4. Jobs still `running` on those machines are reset to `pending` and pushed back onto the Redis queue for another worker.

## Tech stack

| Area | Technology |
|---|---|
| API | Python 3.12, FastAPI, Pydantic v2, SQLAlchemy 2, Alembic |
| Data | PostgreSQL 16 |
| Queue and pub/sub | Redis 7 (`LPUSH` / `BRPOP`, pub/sub) |
| Worker | Python, Docker SDK, psutil |
| Auth | JWT (python-jose), bcrypt |
| Frontend | Next.js 16, TypeScript, Tailwind CSS, shadcn/ui, Framer Motion, Recharts |
| Observability | Prometheus, Grafana, `prometheus-fastapi-instrumentator` |
| Delivery | Docker, Docker Compose, GitHub Actions |

## Getting started

### Prerequisites

Docker Desktop, Python 3.12+, Node.js 20+.

### Option A: local development (recommended)

Infrastructure runs in Docker; the backend, worker and frontend run natively for fast iteration.

```bash
git clone https://github.com/parth123543/distributed-resources.git
cd distributed-resources

# 1. Postgres, Redis, Prometheus, Grafana
cd infra
docker compose -f docker-compose.dev.yml up -d
cd ..
```

**2. Backend** (create `backend/.env` first, see [Configuration](#configuration))

```bash
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

**3. Create an account**, then use its credentials for the worker. Either sign up in the UI at `http://localhost:3000/signup` once the frontend is running, or:

```bash
curl -X POST http://localhost:8000/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email": "you@example.com", "password": "a-strong-password"}'
```

**4. Worker** (create `worker/.env` first)

```bash
cd worker
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python agent.py
```

On first start the worker authenticates, registers the host as a machine (saved to `machine_state.json`, so restarts reuse it), then heartbeats and waits for jobs. Docker must be running on the worker host.

**5. Frontend** (create `frontend/.env.local` first)

```bash
cd frontend
npm install
npm run dev
```

| Service | URL |
|---|---|
| Dashboard | http://localhost:3000 |
| API docs (Swagger) | http://localhost:8000/docs |
| Prometheus | http://localhost:9090 |
| Grafana | http://localhost:3001 (`admin` / `drplatform2024`, development default; change it) |

### Option B: full stack in Docker

Create `backend/.env.production` and `worker/.env.production` using the Docker service hostnames (`postgres`, `redis`, `backend`), then:

```bash
cd infra
docker compose -f docker-compose.yml up --build
```

This starts Postgres, Redis, backend, worker, frontend, Prometheus and Grafana. The worker container logs in at startup, so the account in `worker/.env.production` must exist first: sign up through the UI or API, then `docker compose restart worker`. The worker mounts the host Docker socket to launch job containers (Docker-out-of-Docker).

### Try a job

Submit from the dashboard (Jobs, Submit Job) or the API:

```bash
TOKEN=$(curl -s -X POST http://localhost:8000/auth/login \
  -d "username=you@example.com&password=a-strong-password" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

curl -X POST http://localhost:8000/jobs \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"required_cpu": 1, "required_ram": 0.5, "command": "python3 -c \"print(sum(i*i for i in range(10**6)))\""}'
```

### Running workers on other machines

Workers pull work, so donor machines need no inbound ports. On each donor machine: install Docker and Python, clone the repo, set up `worker/` as above, and point `worker/.env` at the host running the backend and Redis (`API_BASE_URL=http://<host-ip>:8000`, `REDIS_URL=redis://<host-ip>:6379/0`). Start the backend with `--host 0.0.0.0`. Use a trusted network or VPN only; see the Redis note under [Known limitations](#known-limitations--roadmap).

## Configuration

**`backend/.env`**

| Variable | Example / default | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgresql://dr_user:dr_password@localhost:5432/distributed_resources` | PostgreSQL connection |
| `REDIS_URL` | `redis://localhost:6379/0` | Queue and pub/sub |
| `JWT_SECRET` | output of `python3 -c "import secrets; print(secrets.token_hex(32))"` | Token signing key |
| `JWT_ALGORITHM` | `HS256` | |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `60` | Token lifetime |
| `HEARTBEAT_TIMEOUT_SECONDS` | `60` | Silence before a machine is declared offline |
| `FAILURE_CHECK_INTERVAL_SECONDS` | `30` | Failure detector period |

**`worker/.env`**

| Variable | Example / default | Purpose |
|---|---|---|
| `API_BASE_URL` | `http://localhost:8000` | Backend URL |
| `WORKER_EMAIL` / `WORKER_PASSWORD` | | Account the worker authenticates as |
| `REDIS_URL` | `redis://localhost:6379/0` | Queue and metrics channel |
| `HEARTBEAT_INTERVAL_SECONDS` | `10` | Minimum gap between heartbeats |

**`frontend/.env.local`**

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000
```

Never commit `.env` files. Rotate any secret that has ever been pasted into a public place.

## API overview

Interactive docs are served at `/docs`. All endpoints except signup, login, health and metrics require `Authorization: Bearer <token>`. Login is the OAuth2 password flow (form-encoded, `username` is the email).

| Area | Method and path | Description |
|---|---|---|
| Auth | `POST /auth/signup` | Create an account |
| | `POST /auth/login` | Exchange credentials for a JWT |
| | `GET /auth/me` | Current user |
| Machines | `POST /machines` | Register a machine |
| | `GET /machines` | List machines (paginated) |
| | `PUT /machines/:id` | Update a machine (owner or admin) |
| | `DELETE /machines/:id` | Remove a machine (owner or admin) |
| | `POST /machines/:id/heartbeat` | Worker keep-alive (owner or admin) |
| Jobs | `POST /jobs` | Submit a job |
| | `GET /jobs` | List your jobs |
| | `GET /jobs/:id` | Job detail and output (owner or admin) |
| | `DELETE /jobs/:id` | Delete a job (owner or admin) |
| | `GET /jobs/:id/requirements` | Resource requirements (used by workers) |
| | `POST /jobs/:id/claim` | Worker claims a pending job |
| | `POST /jobs/:id/complete` | Worker reports output and status |
| Realtime | `WS /ws/metrics?token=<jwt>` | Live worker metrics stream |
| Ops | `GET /metrics` | Prometheus metrics |
| | `GET /health` | Liveness check |

## Project structure

```
distributed-resources/
├── backend/
│   ├── app/
│   │   ├── routers/            # auth.py, machines.py, jobs.py, metrics.py (WebSocket)
│   │   ├── models.py           # User, Machine, Job, JobLog (UUID primary keys)
│   │   ├── schemas.py          # Pydantic request/response models
│   │   ├── crud.py             # database operations
│   │   ├── deps.py             # get_current_user, require_role
│   │   ├── security.py         # bcrypt hashing, JWT create/verify
│   │   ├── queue.py            # Redis queue helpers
│   │   ├── failure_detector.py # heartbeat monitor + job requeue
│   │   ├── config.py           # typed settings (pydantic-settings)
│   │   ├── database.py         # engine, session dependency
│   │   └── main.py             # app, lifespan, Prometheus instrumentation
│   ├── alembic/                # migrations
│   ├── tests/
│   └── Dockerfile
├── worker/
│   ├── agent.py                # auth, registration, heartbeat, queue loop, Docker execution
│   ├── metrics.py              # psutil metrics published to Redis
│   ├── config.py
│   └── Dockerfile
├── frontend/
│   ├── app/
│   │   ├── page.tsx            # landing page
│   │   ├── (auth)/             # login, signup
│   │   └── (protected)/        # layout (auth guard), dashboard, jobs, machines, monitor
│   ├── components/ui/          # shadcn/ui primitives
│   ├── lib/                    # api.ts (typed API client), auth.ts
│   └── Dockerfile
├── infra/
│   ├── docker-compose.yml      # full stack (7 services)
│   ├── docker-compose.dev.yml  # Postgres, Redis, Prometheus, Grafana
│   ├── prometheus/             # scrape configuration
│   └── grafana/                # provisioning and dashboard JSON
└── .github/workflows/ci.yml
```

## Security model

Each job is executed with these constraints (see `execute_job_in_docker` in `worker/agent.py`):

```python
docker_client.containers.run(
    image="python:3.12-slim",
    command=["sh", "-c", job_command],
    mem_limit="512m",             # memory cap
    nano_cpus=1_000_000_000,      # one CPU core
    network_disabled=True,        # no network access
    user="1000:1000",             # non-root inside the container
    read_only=True,               # immutable root filesystem
    tmpfs={"/tmp": "size=64m"},   # small writable scratch space
    remove=True,                  # deleted when the job exits
)
```

Access control is enforced server-side: JWT validation on every protected route, role checks through `require_role`, and ownership checks on every machine and job mutation. Workers can only claim jobs for machines they own. Login failures return one generic message so email existence is not leaked.

## Testing and CI

```bash
cd backend && source venv/bin/activate
pytest tests/ -v
```

GitHub Actions (`.github/workflows/ci.yml`) runs on every push and pull request: the backend job installs dependencies, applies migrations and runs pytest against live PostgreSQL and Redis service containers; the frontend job runs `npm ci` and a production `next build`.

## Design decisions

- **Redis list with `BRPOP` rather than Pub/Sub or Streams.** Pub/Sub drops messages when no consumer is listening; Streams add consumer groups and acknowledgements but more machinery than this scale needs. A list gives durable, single-consumer delivery with no idle polling. Streams are the natural upgrade for acknowledgement and replay.
- **Pull-based workers.** Workers dial out to the backend and Redis, so donor machines need no open inbound ports and can sit behind NAT or lab firewalls.
- **Dead-man's-switch failure detection.** There is no goodbye message when a laptop dies, so liveness is inferred from missing heartbeats, with the timeout set to two missed beats.
- **UUID primary keys.** Safe to generate independently across services without coordination.
- **Single backend process for auth, API and failure detection.** Simplest to run and reason about; the failure detector is isolated in its own module and can be extracted into a separate controller.
- **Docker-out-of-Docker for the containerised worker.** The worker shares the host Docker socket to start sibling job containers; stronger isolation (gVisor, Firecracker) would be the production step.

## Known limitations & roadmap

Current boundaries, stated plainly:

- **Worker session lifetime.** The worker logs in once at startup and reuses that JWT, so long-running workers need token refresh or API-key authentication after `ACCESS_TOKEN_EXPIRE_MINUTES`.
- **Loop cadence.** Heartbeats and metrics share the worker loop with `BRPOP` (up to 30s per cycle when idle) and with job execution. Moving them to a background thread is planned.
- **Claim guard is check-then-set.** Redis delivery is the primary exclusivity guarantee; a conditional `UPDATE` or `SELECT ... FOR UPDATE` would make the database layer strictly atomic.
- **Pop-before-claim gap.** If a worker dies after popping a job id but before claiming it, the job stays `pending` with no queue entry. A reconciler for stale pending jobs, or a reliable-queue pattern, is planned.
- **Fixed execution environment.** Jobs run in `python:3.12-slim` with 512 MB, one CPU and no network, regardless of the requested resources, which are used for scheduling only. Configurable images, enforced per-job limits and GPU detection are planned. Today's jobs are best suited to self-contained scripts.
- **Scheduling policy.** The queue is FIFO; the stored `priority` field is not yet used for ordering.
- **Results** are stored as text in PostgreSQL; object storage for artifacts and logs is planned.
- **Hardening.** The JWT is held in a client-readable cookie (httpOnly via a Next.js route handler is planned), the WebSocket authenticates with a query-string token, and the development Redis has no password. Use a trusted network or VPN, and enable `requirepass`/TLS before exposing anything.
- **Deployment.** Designed for a campus LAN or VPN with Docker Compose; managed cloud deployment is not included.
- **Admin experience.** Admin role exists in the model and access checks; an admin UI is not built.

## Author

Built by **Parth Parashar** ([@parth123543](https://github.com/parth123543)).

<!--
Add screenshots once captured, for example:
![Dashboard](docs/screenshots/dashboard.png)
![Live monitor](docs/screenshots/monitor.png)
![Grafana](docs/screenshots/grafana.png)
-->
