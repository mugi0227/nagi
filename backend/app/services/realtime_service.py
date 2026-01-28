import asyncio
import json
from typing import Any


class RealtimeManager:
    def __init__(self) -> None:
        self._connections: dict[str, set[asyncio.Queue[str]]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, user_id: str) -> asyncio.Queue[str]:
        queue: asyncio.Queue[str] = asyncio.Queue()
        async with self._lock:
            self._connections.setdefault(user_id, set()).add(queue)
        return queue

    async def disconnect(self, user_id: str, queue: asyncio.Queue[str]) -> None:
        async with self._lock:
            queues = self._connections.get(user_id)
            if not queues:
                return
            queues.discard(queue)
            if not queues:
                self._connections.pop(user_id, None)

    async def publish(self, user_id: str, payload: dict[str, Any]) -> None:
        message = json.dumps(payload, separators=(",", ":"))
        async with self._lock:
            queues = list(self._connections.get(user_id, set()))
        for queue in queues:
            queue.put_nowait(message)

    async def publish_many(self, user_ids: set[str], payload: dict[str, Any]) -> None:
        if not user_ids:
            return
        message = json.dumps(payload, separators=(",", ":"))
        async with self._lock:
            queues = [list(self._connections.get(user_id, set())) for user_id in user_ids]
        for queue_list in queues:
            for queue in queue_list:
                queue.put_nowait(message)


realtime_manager = RealtimeManager()
