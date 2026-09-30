import asyncio
import logging
import uuid
from typing import Sequence

from fastapi import HTTPException, status
from sqlalchemy import delete, func, select

from sqlalchemy.ext.asyncio import AsyncSession

from app.config.settings import settings
from app.db.models import Contact, ContactProduct, Conversation, Message, Product, utcnow
from app.db.session import AsyncSessionLocal
from app.models.schemas import ProductCreate, ProductResponse, ProductUpdate
from app.providers import decision
from app.services.base import BaseService
from app.services.crm_service import ContactService

logger = logging.getLogger("products")

PALETTE = ["#f59e0b", "#10b981", "#6366f1", "#ec4899", "#0ea5e9", "#ef4444", "#8b5cf6", "#14b8a6"]
CONTEXT_MESSAGES = 20
CONTEXT_CHARS = 3000


def _not_found(what: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{what} not found")


class ProductService(BaseService):
    """
    Service layer for product tags and each contact's product interest, decided from their chats by the decision model.
    """

    # ponytail: in-process background tasks, single server process only; move to a job queue with several workers.
    _running: set[uuid.UUID] = set()
    _again: set[uuid.UUID] = set()
    _tasks: set[asyncio.Task] = set()

    # ---------- products ----------

    @classmethod
    async def list(cls, db: AsyncSession, workspace_id: uuid.UUID) -> list[ProductResponse]:
        """
        Lists the workspace's products by name with their interested contact counts.

        Args:
            db (AsyncSession): Active asynchronous database session.
            workspace_id (uuid.UUID): Caller's workspace.

        Returns:
            list[ProductResponse]: Products.
        """
        products = (await db.execute(select(Product).where(Product.workspace_id == workspace_id).order_by(func.lower(Product.name)))).scalars().all()
        counts = dict((await db.execute(
            select(ContactProduct.product_id, func.count()).where(
                ContactProduct.product_id.in_([p.id for p in products]), ContactProduct.dismissed.is_(False)
            ).group_by(ContactProduct.product_id)
        )).all())
        return [ProductResponse.model_validate(p).model_copy(update={"interested_count": counts.get(p.id, 0)}) for p in products]

    @classmethod
    async def get(cls, db: AsyncSession, workspace_id: uuid.UUID, product_id: uuid.UUID) -> Product:
        """
        Fetches one workspace product.

        Raises:
            HTTPException: 404 when missing or owned by another workspace.
        """
        result = await db.execute(select(Product).where(Product.id == product_id, Product.workspace_id == workspace_id))
        product = result.scalars().first()
        if not product:
            raise _not_found("Product")
        return product

    @classmethod
    async def response(cls, db: AsyncSession, product: Product) -> ProductResponse:
        """The product with its interested contact count."""
        count = await db.execute(select(func.count()).where(ContactProduct.product_id == product.id, ContactProduct.dismissed.is_(False)))
        return ProductResponse.model_validate(product).model_copy(update={"interested_count": count.scalar_one()})

    @classmethod
    async def create(cls, db: AsyncSession, workspace_id: uuid.UUID, data: ProductCreate) -> Product:
        """
        Creates a product; the color comes from a palette when not given.

        Raises:
            HTTPException: 409 when the name is taken (ignoring case).
        """
        name = data.name.strip()
        await cls._check_unique(db, workspace_id, name)
        taken = (await db.execute(select(func.count()).where(Product.workspace_id == workspace_id))).scalar_one()
        product = Product(
            workspace_id=workspace_id, name=name, name_key=name.lower(), description=(data.description or "").strip() or None,
            keywords=data.keywords, color=data.color or PALETTE[taken % len(PALETTE)],
        )
        db.add(product)
        await db.commit()
        return product

    @classmethod
    async def update(cls, db: AsyncSession, workspace_id: uuid.UUID, product_id: uuid.UUID, data: ProductUpdate) -> Product:
        """
        Renames a product or changes its description, keywords, or color.

        Raises:
            HTTPException: 404 for an unknown product, 409 when the new name is taken.
        """
        product = await cls.get(db, workspace_id, product_id)
        changes = data.model_dump(exclude_unset=True)
        if changes.get("name") and changes["name"].strip().lower() != product.name_key:
            await cls._check_unique(db, workspace_id, changes["name"].strip())
        if changes.get("name"):
            product.name, product.name_key = changes["name"].strip(), changes["name"].strip().lower()
        if "description" in changes:
            product.description = (changes["description"] or "").strip() or None
        if changes.get("keywords") is not None:
            product.keywords = changes["keywords"]
        if changes.get("color"):
            product.color = changes["color"]
        await db.commit()
        return product

    @classmethod
    async def delete(cls, db: AsyncSession, workspace_id: uuid.UUID, product_id: uuid.UUID) -> None:
        """
        Deletes a product and removes it from every contact.

        Raises:
            HTTPException: 404 for an unknown product.
        """
        product = await cls.get(db, workspace_id, product_id)
        affected = (await db.execute(select(ContactProduct.contact_id).where(ContactProduct.product_id == product.id))).scalars().all()
        await db.execute(delete(ContactProduct).where(ContactProduct.product_id == product.id))
        await db.delete(product)
        await db.commit()
        for contact_id in affected:
            contact = await db.get(Contact, contact_id, populate_existing=True)
            if contact:
                await ContactService.publish(db, contact)

    @staticmethod
    async def _check_unique(db: AsyncSession, workspace_id: uuid.UUID, name: str) -> None:
        existing = await db.execute(select(Product.id).where(Product.workspace_id == workspace_id, Product.name_key == name.lower()))
        if existing.first():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"A product named '{name}' already exists")

    # ---------- a contact's interests ----------

    @classmethod
    async def classify_contact(cls, db: AsyncSession, contact: Contact) -> Contact:
        """
        Decides which products the contact is interested in from their recent messages across all conversations.
        Interests at or above the threshold are added (earlier ones stay); staff-added interests are kept and
        staff-removed ones are never added back. Without products or customer messages the contact stays as it is.

        Args:
            db (AsyncSession): Active asynchronous database session.
            contact (Contact): Contact to analyse.

        Returns:
            Contact: The updated contact.

        Raises:
            DecisionError: When the decision model cannot answer (nothing is changed).
        """
        products = (await db.execute(select(Product).where(Product.workspace_id == contact.workspace_id))).scalars().all()
        rows = await db.execute(
            select(Message.content).join(Conversation, Message.conversation_id == Conversation.id)
            .where(Conversation.contact_id == contact.id, Message.direction == "inbound")
            .order_by(Message.created_at.desc()).limit(CONTEXT_MESSAGES)
        )
        lines = [f"Customer: {text}" for text in reversed(rows.scalars().all())]
        if not products or not lines:
            return contact
        text = "\n".join(lines)[-CONTEXT_CHARS:]
        options = [decision.ProductOption(str(p.id), p.name, p.description, list(p.keywords or [])) for p in products]
        scores = await decision.product_interest(text, options)

        now = utcnow()
        links = {link.product_id: link for link in contact.product_links}
        for product in products:
            score = scores.get(str(product.id), 0.0)
            if score < settings.DECISION_THRESHOLD:
                continue
            link = links.get(product.id)
            if link is None:
                contact.product_links.append(ContactProduct(product_id=product.id, product=product, source="ai", confidence=score, last_detected_at=now))
            elif not link.dismissed and link.source == "ai":
                link.confidence, link.last_detected_at = score, now
        contact.product_classified_at = now
        await db.commit()
        await ContactService.publish(db, contact)
        return contact

    @classmethod
    async def classify(cls, db: AsyncSession, workspace_id: uuid.UUID, contact_id: uuid.UUID) -> Contact:
        """
        Re-analyses one contact now (staff "re-detect").

        Raises:
            HTTPException: 404 for an unknown contact, 502 when the decision model is unavailable.
        """
        contact = await ContactService.get(db, workspace_id, contact_id)
        try:
            return await cls.classify_contact(db, contact)
        except decision.DecisionError as exc:
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Decision model unavailable: {exc}")

    @classmethod
    async def set_interest(cls, db: AsyncSession, workspace_id: uuid.UUID, contact_id: uuid.UUID, product_id: uuid.UUID, on: bool) -> Contact:
        """
        Staff adds (`on`) or removes a product interest. A removal is remembered so the model never adds it back.

        Raises:
            HTTPException: 404 for a contact or product outside the workspace.
        """
        contact = await ContactService.get(db, workspace_id, contact_id)
        product = await cls.get(db, workspace_id, product_id)
        link = next((l for l in contact.product_links if l.product_id == product.id), None)
        if on:
            if link is None:
                contact.product_links.append(ContactProduct(product_id=product.id, product=product, source="staff", last_detected_at=utcnow()))
            elif link.dismissed or link.source != "staff":
                link.source, link.confidence, link.dismissed, link.last_detected_at = "staff", None, False, utcnow()
        elif link is None:
            contact.product_links.append(ContactProduct(product_id=product.id, product=product, source="staff", dismissed=True, last_detected_at=utcnow()))
        else:
            link.dismissed = True
        await db.commit()
        await ContactService.publish(db, contact)
        return contact

    @staticmethod
    def merge_links(target: Contact, source: Contact) -> None:
        """Copies the source contact's product links the target lacks (dismissals included), for a contact merge."""
        have = {link.product_id for link in target.product_links}
        for link in source.product_links:
            if link.product_id not in have:
                target.product_links.append(ContactProduct(
                    product_id=link.product_id, product=link.product, source=link.source, confidence=link.confidence,
                    dismissed=link.dismissed, last_detected_at=link.last_detected_at,
                ))
        if source.product_classified_at and (not target.product_classified_at or source.product_classified_at > target.product_classified_at):
            target.product_classified_at = source.product_classified_at

    # ---------- background ----------

    @classmethod
    def schedule_contact(cls, contact_id: uuid.UUID) -> None:
        """
        Re-analyses a contact in the background (after a customer message). One run per contact at a time; a
        request during a run triggers one more run afterwards.
        """
        if contact_id in cls._running:
            cls._again.add(contact_id)
            return
        cls._running.add(contact_id)
        cls._keep(asyncio.create_task(cls._run(contact_id)))

    @classmethod
    def schedule_workspace(cls, workspace_id: uuid.UUID) -> None:
        """Re-analyses, in the background, every workspace contact with customer messages (after a product change)."""
        cls._keep(asyncio.create_task(cls._run_workspace(workspace_id)))

    @classmethod
    def _keep(cls, task: asyncio.Task) -> None:
        cls._tasks.add(task)  # keep a reference so the task is not garbage collected
        task.add_done_callback(cls._tasks.discard)

    @classmethod
    async def _run(cls, contact_id: uuid.UUID) -> None:
        try:
            while True:
                cls._again.discard(contact_id)
                async with AsyncSessionLocal() as db:
                    contact = await db.get(Contact, contact_id)
                    if contact:
                        try:
                            await cls.classify_contact(db, contact)
                        except decision.DecisionError as exc:
                            logger.warning("Product interest failed for contact %s: %s", contact_id, exc)
                        except Exception:  # a background task must never die silently
                            logger.exception("Product interest crashed for contact %s", contact_id)
                if contact_id not in cls._again:
                    return
        finally:
            cls._running.discard(contact_id)

    @classmethod
    async def _run_workspace(cls, workspace_id: uuid.UUID) -> None:
        async with AsyncSessionLocal() as db:
            ids: Sequence[uuid.UUID] = (await db.execute(
                select(Conversation.contact_id).join(Message, Message.conversation_id == Conversation.id)
                .where(Conversation.workspace_id == workspace_id, Message.direction == "inbound").distinct()
            )).scalars().all()
        for contact_id in ids:
            if contact_id in cls._running:
                cls._again.add(contact_id)
                continue
            cls._running.add(contact_id)
            await cls._run(contact_id)
