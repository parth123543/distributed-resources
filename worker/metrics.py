import json
import logging
from datetime import datetime

import psutil
import redis

from config import settings

logger = logging.getLogger("metrics")

redis_client = redis.from_url(
    settings.redis_url,
    decode_responses=True,
    socket_timeout=5,
    socket_connect_timeout=5,
)

METRICS_CHANNEL = "metrics:live"


def collect_metrics(machine_id: str) -> dict:
    cpu_percent = psutil.cpu_percent(interval=1)
    memory = psutil.virtual_memory()
    disk = psutil.disk_usage("/")

    return {
        "machine_id": machine_id,
        "timestamp": datetime.utcnow().isoformat(),
        "cpu_percent": cpu_percent,
        "ram_percent": memory.percent,
        "ram_used_gb": round(memory.used / (1024 ** 3), 2),
        "ram_total_gb": round(memory.total / (1024 ** 3), 2),
        "disk_percent": disk.percent,
        "disk_used_gb": round(disk.used / (1024 ** 3), 2),
        "disk_total_gb": round(disk.total / (1024 ** 3), 2),
    }


def publish_metrics(machine_id: str) -> None:
    try:
        metrics = collect_metrics(machine_id)
        redis_client.publish(METRICS_CHANNEL, json.dumps(metrics))
        logger.debug(
            f"Metrics published — CPU: {metrics['cpu_percent']}%, "
            f"RAM: {metrics['ram_percent']}%"
        )
    except Exception as e:
        logger.warning(f"Failed to publish metrics: {e}")
