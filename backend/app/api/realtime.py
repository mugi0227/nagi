import asyncio
from typing import AsyncGenerator

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from app.api.deps import CurrentUser
from app.services.realtime_service import realtime_manager

router = APIRouter()


@router.get("/stream")
async def stream_realtime(
    user: CurrentUser,
    request: Request,
) -> StreamingResponse:
    queue = await realtime_manager.connect(user.id)

    async def event_generator() -> AsyncGenerator[str, None]:
        try:
            yield 'data: {"type":"connected"}\n\n'
            while True:
                if await request.is_disconnected():
                    break
                try:
                    data = await asyncio.wait_for(queue.get(), timeout=15)
                except asyncio.TimeoutError:
                    yield ": keep-alive\n\n"
                    continue
                yield f"data: {data}\n\n"
        finally:
            await realtime_manager.disconnect(user.id, queue)

    return StreamingResponse(event_generator(), media_type="text/event-stream")
