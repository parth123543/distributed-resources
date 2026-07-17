FROM python:3.12-slim

# Install Docker CLI inside the worker container so it can
# spawn job containers on the host's Docker daemon
RUN apt-get update && apt-get install -y \
    docker.io \
    gcc \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["python", "agent.py"]
