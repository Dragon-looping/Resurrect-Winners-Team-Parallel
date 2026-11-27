"""Server-Sent Events (SSE) live update stream route."""

import asyncio
from collections.abc import AsyncGenerator

from fastapi import APIRouter, Query, Request
from fastapi.responses import StreamingResponse

from app.core.events_bus import event_stream_broker

router = APIRouter(tags=["Live Stream"])


async def _sse_event_generator(
    request: Request,
    *,
    max_events: int | None = None,
) -> AsyncGenerator[str, None]:
    """Yield SSE events to a connected client without holding any DB session."""
    queue = event_stream_broker.subscribe()
    sent = 0
    try:
        yield "event: connected\ndata: {\"status\": \"connected\"}\n\n"
        sent += 1
        if max_events is not None and sent >= max_events:
            return

        while True:
            if await request.is_disconnected():
                break
            try:
                message = await asyncio.wait_for(queue.get(), timeout=15.0)
                yield message
                sent += 1
                if max_events is not None and sent >= max_events:
                    break
            except asyncio.TimeoutError:
                yield ": keep-alive\n\n"
    except asyncio.CancelledError:
        pass
    finally:
        event_stream_broker.unsubscribe(queue)


@router.get(
    "/stream",
    summary="Live inventory event stream (SSE)",
    description="Streams real-time inventory, replay, and feed-health updates via Server-Sent Events.",
)
async def stream_inventory_events(
    request: Request,
    max_events: int | None = Query(
        default=None,
        ge=1,
        description="Optional maximum number of events to stream before closing.",
    ),
) -> StreamingResponse:
    """Stream live inventory updates over Server-Sent Events."""
    return StreamingResponse(
        _sse_event_generator(request, max_events=max_events),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
