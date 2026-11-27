"""Lightweight in-memory async pub/sub broker for Server-Sent Events (SSE)."""

import asyncio
from datetime import datetime, timezone
import json
from typing import Any


class EventStreamBroker:
    """Broadcasts inventory, replay, and feed-health updates to connected SSE clients."""

    def __init__(self) -> None:
        self._subscribers: set[asyncio.Queue[str]] = set()

    @property
    def subscriber_count(self) -> int:
        """Return the number of active SSE subscribers."""
        return len(self._subscribers)

    def subscribe(self) -> asyncio.Queue[str]:
        """Register a new subscriber queue."""
        queue: asyncio.Queue[str] = asyncio.Queue(maxsize=100)
        self._subscribers.add(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue[str]) -> None:
        """Remove a subscriber queue on disconnect."""
        self._subscribers.discard(queue)

    def publish(self, event_name: str, data: dict[str, Any]) -> None:
        """Publish an SSE-formatted message to all connected subscribers without blocking."""
        envelope = {
            "event": event_name,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "data": data,
        }
        formatted = f"event: {event_name}\ndata: {json.dumps(envelope, default=str)}\n\n"
        for queue in list(self._subscribers):
            if queue.full():
                try:
                    queue.get_nowait()
                except asyncio.QueueEmpty:
                    pass
            try:
                queue.put_nowait(formatted)
            except asyncio.QueueFull:
                pass


event_stream_broker = EventStreamBroker()
