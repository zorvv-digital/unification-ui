import asyncio
import logging
import time
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config.settings import settings
from app.db.models import Channel
from app.db.session import AsyncSessionLocal
from app.services.ai_reply_service import AiReplyService
from app.services.base import BaseService
from app.services.channel_service import ADAPTERS, ChannelError, ChannelService, TokenError
from app.services.inbox_service import InboxService

logger = logging.getLogger("sync")


class SyncService(BaseService):
    """
    Pulls new messages for polled channels (Gmail) into the inbox.
    """

    @classmethod
    async def sync_channel(cls, db: AsyncSession, channel: Channel) -> list[uuid.UUID]:
        """
        Imports the channel's new messages. A revoked grant disconnects the channel; other channel errors are
        logged and retried on the next run.

        Args:
            db (AsyncSession): Active asynchronous database session.
            channel (Channel): A channel whose adapter has `fetch_new`.

        Returns:
            list[uuid.UUID]: Conversations that received new messages, once each, for AI replies.
        """
        started = time.time()
        try:
            inbound = await ADAPTERS[channel.adapter_type].fetch_new(channel)
        except TokenError:
            ChannelService.mark_disconnected(channel)
            await db.commit()
            return []
        except ChannelError as exc:
            logger.warning("Sync failed for channel %s: %s", channel.id, exc)
            return []
        conversation_ids = []
        for item in inbound:
            message = await InboxService.receive_message(db=db, channel=channel, inbound=item)
            if message:
                conversation_ids.append(message.conversation_id)
        channel.config = {**channel.config, "last_sync": started}
        await db.commit()
        return list(dict.fromkeys(conversation_ids))

    @classmethod
    async def run_forever(cls) -> None:
        """Syncs every connected polled channel each `GMAIL_SYNC_SECONDS`, until cancelled."""
        # ponytail: one in-process loop per server; move to a worker (or Gmail Pub/Sub push) with several processes.
        polled = [name for name, adapter in ADAPTERS.items() if hasattr(adapter, "fetch_new")]
        while True:
            await asyncio.sleep(settings.GMAIL_SYNC_SECONDS)
            try:
                async with AsyncSessionLocal() as db:
                    result = await db.execute(select(Channel).where(Channel.adapter_type.in_(polled), Channel.status == "connected"))
                    for channel in result.scalars().all():
                        for conversation_id in await cls.sync_channel(db, channel):
                            await AiReplyService.answer(conversation_id)
            except Exception:
                logger.exception("Channel sync loop failed; retrying next run")
