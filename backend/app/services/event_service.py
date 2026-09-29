import asyncio
import json
from collections import defaultdict
from typing import AsyncIterator, Hashable

from pydantic import BaseModel

from app.services.base import BaseService

KEEPALIVE_SECONDS = 15


class EventService(BaseService):
    """
    In-process publish/subscribe for live inbox events, streamed to browsers as server-sent events.
    """

    # ponytail: in-process queues, single server process only; move to Redis pub/sub when running multiple workers.
    # Keyed by workspace id for staff; website visitors use ("visitor", visitor_id).
    _subscribers: dict[Hashable, set[asyncio.Queue]] = defaultdict(set)

    @classmethod
    def publish(cls, workspace_id: Hashable, event: str, data: BaseModel) -> None:
        """
        Sends an event to every client connected for the workspace.

        Args:
            workspace_id (Hashable): Workspace (or visitor key) whose clients receive the event.
            event (str): Event name, e.g. `message.created`.
            data (BaseModel): Response schema serialized as the event payload.
        """
        payload = json.dumps(data.model_dump(mode="json"))
        for queue in cls._subscribers[workspace_id]:
            queue.put_nowait((event, payload))

    @classmethod
    async def stream(cls, workspace_id: Hashable) -> AsyncIterator[str]:
        """
        Yields server-sent event frames for one client until it disconnects.

        Args:
            workspace_id (Hashable): Workspace (or visitor key) to subscribe to.

        Yields:
            str: SSE frames, plus a keepalive comment when idle.
        """
        queue: asyncio.Queue = asyncio.Queue()
        cls._subscribers[workspace_id].add(queue)
        try:
            while True:
                try:
                    event, payload = await asyncio.wait_for(queue.get(), KEEPALIVE_SECONDS)
                    yield f"event: {event}\ndata: {payload}\n\n"
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
        finally:
            cls._subscribers[workspace_id].discard(queue)
