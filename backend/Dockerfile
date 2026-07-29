FROM python:3.12-slim

RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY alembic.ini .
COPY alembic/ ./alembic/
COPY app/ ./app/

EXPOSE 8000

CMD ["sh", "-c", "set -x && alembic -c /app/alembic.ini upgrade head && echo 'Migration complete' && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
