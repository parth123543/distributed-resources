import asyncio
import json
import logging
import threading

import redis
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from jose import JWTError

from app.config import settings
from app import security

logger = logging.getLogger("metrics-ws")

router = APIRouter(prefix="/ws", tags=["metrics"])

METRICS_CHANNEL = "metrics:live"


class MetricsRelay:
    def __init__(self, websocket: WebSocket, loop: asyncio.AbstractEventLoop):
        self.websocket = websocket
        self.loop = loop
        self.queue: asyncio.Queue = asyncio.Queue()
        self.running = True
        self.redis_client = redis.from_url(
            settings.redis_url,
            decode_responses=True,
            socket_timeout=None,
        )

    def _subscribe_thread(self) -> None:
        pubsub = self.redis_client.pubsub()
        pubsub.subscribe(METRICS_CHANNEL)
        logger.info(f"Subscribed to Redis channel: {METRICS_CHANNEL}")
        for message in pubsub.listen():
            if not self.running:
                break
            if message["type"] == "message":
                asyncio.run_coroutine_threadsafe(
                    self.queue.put(message["data"]),
                    self.loop,
                )
        pubsub.unsubscribe(METRICS_CHANNEL)
        logger.info("Unsubscribed from Redis channel.")

    def start(self) -> None:
        thread = threading.Thread(target=self._subscribe_thread, daemon=True)
        thread.start()

    def stop(self) -> None:
        self.running = False

    async def relay_to_websocket(self) -> None:
        while self.running:
            try:
                data = await asyncio.wait_for(self.queue.get(), timeout=1.0)
                await self.websocket.send_text(data)
            except asyncio.TimeoutError:
                continue
            except Exception as e:
                logger.error(f"Error relaying metrics: {e}")
                break


@router.websocket("/metrics")
async def metrics_websocket(
    websocket: WebSocket,
    token: str = Query(..., description="JWT access token"),
):
    try:
        payload = security.decode_access_token(token)
        if payload.get("sub") is None:
            await websocket.close(code=4001)
            return
    except JWTError:
        await websocket.close(code=4001)
        return

    await websocket.accept()
    logger.info("WebSocket client connected for live metrics.")

    loop = asyncio.get_event_loop()
    relay = MetricsRelay(websocket, loop)
    relay.start()

    try:
        await relay.relay_to_websocket()
    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected.")
    finally:
        relay.stop()
