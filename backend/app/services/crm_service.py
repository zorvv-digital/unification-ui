import csv
import io
import re
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Optional, Sequence

from fastapi import HTTPException, status
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Contact, Conversation, Segment, Tag, contact_tags
from app.models.schemas import (
    EMAIL_PATTERN,
    ContactImport,
    ContactListItem,
    ContactResponse,
    ContactUpdate,
    ConversationResponse,
    ImportResult,
    ImportSkip,
    SegmentCreate,
    SegmentMembers,
    SegmentResponse,
    SegmentRules,
    SegmentUpdate,
    TagCreate,
    TagUpdate,
)
from app.services.base import BaseService
from app.services.event_service import EventService

MERGE_FIELDS = ("phone", "email", "username", "avatar", "birthday", "anniversary", "notes")
IMPORT_COLUMNS = {"name", "phone", "email", "birthday", "anniversary", "tags"}


def _not_found(what: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{what} not found")


def _key(name: str) -> str:
    return name.strip().lower()


def _digits(phone: Optional[str]) -> str:
    return re.sub(r"\D", "", phone or "")


class ContactService(BaseService):
    """
    Service layer for CRM contacts: profiles, consent, tags on contacts, search, merge, and CSV import.
    """

    @classmethod
    async def get(cls, db: AsyncSession, workspace_id: uuid.UUID, contact_id: uuid.UUID) -> Contact:
        """
        Fetches one workspace contact.

        Raises:
            HTTPException: 404 when missing or owned by another workspace.
        """
        result = await db.execute(select(Contact).where(Contact.id == contact_id, Contact.workspace_id == workspace_id))
        contact = result.scalars().first()
        if not contact:
            raise _not_found("Contact")
        return contact

    @classmethod
    async def list_items(
        cls, db: AsyncSession, workspace_id: uuid.UUID, q: Optional[str] = None, tag_ids: Sequence[uuid.UUID] = ()
    ) -> list[ContactListItem]:
        """
        Lists workspace contacts with their channels and last activity, most recently active first.

        Args:
            db (AsyncSession): Active asynchronous database session.
            workspace_id (uuid.UUID): Caller's workspace.
            q (Optional[str]): Text matched against name, phone, and email, ignoring case.
            tag_ids (Sequence[uuid.UUID]): Keep contacts having any of these tags.

        Returns:
            list[ContactListItem]: Matching contacts.
        """
        # ponytail: filters in Python over all workspace contacts; move to SQL when workspaces reach tens of thousands.
        contacts = (await db.execute(select(Contact).where(Contact.workspace_id == workspace_id))).scalars().all()
        rows = await db.execute(
            select(Conversation.contact_id, Conversation.platform, Conversation.last_message_at)
            .where(Conversation.workspace_id == workspace_id)
        )
        platforms: dict[uuid.UUID, set[str]] = {}
        activity: dict[uuid.UUID, datetime] = {}
        for contact_id, platform, last in rows.all():
            platforms.setdefault(contact_id, set()).add(platform)
            if last:
                last = last if last.tzinfo else last.replace(tzinfo=timezone.utc)  # SQLite returns naive UTC
                activity[contact_id] = max(activity.get(contact_id, last), last)

        needle = (q or "").strip().lower()
        wanted = set(tag_ids)
        items = []
        for contact in contacts:
            if needle and not any(needle in (value or "").lower() for value in (contact.name, contact.phone, contact.email)):
                continue
            if wanted and not wanted & {t.id for t in contact.tags}:
                continue
            items.append(ContactListItem(
                **ContactResponse.model_validate(contact).model_dump(),
                platforms=sorted(platforms.get(contact.id, set())),
                last_activity_at=activity.get(contact.id),
            ))
        epoch = datetime.min.replace(tzinfo=timezone.utc)
        items.sort(key=lambda i: (i.last_activity_at or epoch, i.name.lower()), reverse=True)
        return items

    @classmethod
    async def update(cls, db: AsyncSession, workspace_id: uuid.UUID, contact_id: uuid.UUID, data: ContactUpdate) -> Contact:
        """
        Updates profile fields. Changing `consent` records when it changed.

        Raises:
            HTTPException: 404 when the contact is not in the workspace.
        """
        contact = await cls.get(db, workspace_id, contact_id)
        changes = data.model_dump(exclude_unset=True)
        for field in ("name", "consent"):  # required fields: `null` means "leave as is"
            if changes.get(field) is None:
                changes.pop(field, None)
        if "consent" in changes and changes["consent"] != contact.consent:
            contact.consent_changed_at = datetime.now(timezone.utc)
        for field, value in changes.items():
            setattr(contact, field, value.strip() if isinstance(value, str) else value)
        await db.commit()
        await cls.publish(db, contact)
        return contact

    @classmethod
    async def set_tag(cls, db: AsyncSession, workspace_id: uuid.UUID, contact_id: uuid.UUID, tag_id: uuid.UUID, on: bool) -> Contact:
        """
        Assigns (`on`) or removes a tag on a contact; repeating either is harmless.

        Raises:
            HTTPException: 404 for a contact or tag outside the workspace.
        """
        contact = await cls.get(db, workspace_id, contact_id)
        tag = await TagService.get(db, workspace_id, tag_id)
        has = tag in contact.tags
        if on and not has:
            contact.tags.append(tag)
        elif not on and has:
            contact.tags.remove(tag)
        await db.commit()
        await cls.publish(db, contact)
        return contact

    @classmethod
    async def merge(cls, db: AsyncSession, workspace_id: uuid.UUID, target_id: uuid.UUID, source_id: uuid.UUID) -> Contact:
        """
        Merges the source contact into the target: conversations and tags move over, the target's empty profile
        fields are filled from the source (consent too while the target's is `unknown`), and the source is deleted.

        Raises:
            HTTPException: 400 when merging a contact into itself, 404 for contacts outside the workspace.
        """
        if target_id == source_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Choose a different contact to merge")
        target = await cls.get(db, workspace_id, target_id)
        source = await cls.get(db, workspace_id, source_id)
        await db.execute(update(Conversation).where(Conversation.contact_id == source.id).values(contact_id=target.id))
        for tag in source.tags:
            if tag not in target.tags:
                target.tags.append(tag)
        for field in MERGE_FIELDS:
            if not getattr(target, field) and getattr(source, field):
                setattr(target, field, getattr(source, field))
        if target.consent == "unknown" and source.consent != "unknown":
            target.consent, target.consent_changed_at = source.consent, source.consent_changed_at
        await db.delete(source)  # its contact_tags rows go with it (secondary relationship)
        await db.commit()
        await cls.publish(db, target)
        return target

    @classmethod
    async def import_csv(cls, db: AsyncSession, workspace_id: uuid.UUID, data: ContactImport) -> ImportResult:
        """
        Imports contacts from CSV. Rows matching an existing contact by phone (digits) or email (ignoring case)
        update it; others create contacts; unknown tags are created. Invalid rows are skipped with their row number
        (the header is row 1).

        Raises:
            HTTPException: 422 when the header has none of the known columns.
        """
        reader = csv.DictReader(io.StringIO(data.csv.lstrip("﻿")))
        columns = {(c or "").strip().lower(): c for c in reader.fieldnames or []}
        if not IMPORT_COLUMNS & set(columns) or not {"name", "phone", "email"} & set(columns):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                                detail=f"The CSV needs a header row with some of: {', '.join(sorted(IMPORT_COLUMNS))}")

        contacts = list((await db.execute(select(Contact).where(Contact.workspace_id == workspace_id))).scalars().all())
        tags = {t.name_key: t for t in (await db.execute(select(Tag).where(Tag.workspace_id == workspace_id))).scalars().all()}
        created = updated = 0
        skipped = []
        for row_number, raw in enumerate(reader, start=2):
            row = {name: (raw.get(original) or "").strip() for name, original in columns.items() if name in IMPORT_COLUMNS}
            try:
                values = cls._import_row(row)
            except ValueError as exc:
                skipped.append(ImportSkip(row=row_number, reason=str(exc)))
                continue
            phone, email = _digits(values.get("phone")), (values.get("email") or "").lower()
            contact = next((c for c in contacts if (phone and _digits(c.phone) == phone) or (email and (c.email or "").lower() == email)), None)
            if contact:
                updated += 1
            else:
                contact = Contact(workspace_id=workspace_id, name=values.get("name") or values.get("phone") or values["email"])
                db.add(contact)
                contacts.append(contact)
                created += 1
            for field in ("name", "phone", "email", "birthday", "anniversary"):
                if values.get(field):
                    setattr(contact, field, values[field])
            for tag_name in values["tags"]:
                tag = tags.get(_key(tag_name))
                if not tag:
                    tag = tags[_key(tag_name)] = Tag(workspace_id=workspace_id, name=tag_name, name_key=_key(tag_name))
                    db.add(tag)
                if tag not in contact.tags:
                    contact.tags.append(tag)
        await db.commit()
        return ImportResult(created=created, updated=updated, skipped=skipped)

    @staticmethod
    def _import_row(row: dict[str, str]) -> dict:
        if not any(row.values()):
            raise ValueError("Empty row")
        values: dict = {k: row.get(k) or None for k in ("name", "phone", "email")}
        if not (values["name"] or values["phone"] or values["email"]):
            raise ValueError("Needs a name, phone, or email")
        if values["email"] and not re.match(EMAIL_PATTERN, values["email"]):
            raise ValueError(f"Invalid email '{values['email']}'")
        for field in ("birthday", "anniversary"):
            if row.get(field):
                try:
                    values[field] = date.fromisoformat(row[field])
                except ValueError:
                    raise ValueError(f"Invalid {field} '{row[field]}' (use YYYY-MM-DD)")
        values["tags"] = [t.strip()[:50] for t in (row.get("tags") or "").split(";") if t.strip()]
        return values

    @staticmethod
    async def publish(db: AsyncSession, contact: Contact) -> None:
        """Sends `conversation.updated` for each of the contact's conversations so open inboxes show the change."""
        result = await db.execute(
            select(Conversation).where(Conversation.contact_id == contact.id).execution_options(populate_existing=True)
        )
        for conversation in result.scalars().all():
            EventService.publish(contact.workspace_id, "conversation.updated", ConversationResponse.model_validate(conversation))


class TagService(BaseService):
    """
    Service layer for workspace tags.
    """

    @classmethod
    async def list(cls, db: AsyncSession, workspace_id: uuid.UUID) -> Sequence[Tag]:
        """Lists the workspace's tags by name."""
        result = await db.execute(select(Tag).where(Tag.workspace_id == workspace_id).order_by(Tag.name_key))
        return result.scalars().all()

    @classmethod
    async def get(cls, db: AsyncSession, workspace_id: uuid.UUID, tag_id: uuid.UUID) -> Tag:
        """
        Fetches one workspace tag.

        Raises:
            HTTPException: 404 when missing or owned by another workspace.
        """
        result = await db.execute(select(Tag).where(Tag.id == tag_id, Tag.workspace_id == workspace_id))
        tag = result.scalars().first()
        if not tag:
            raise _not_found("Tag")
        return tag

    @classmethod
    async def create(cls, db: AsyncSession, workspace_id: uuid.UUID, data: TagCreate) -> Tag:
        """
        Creates a tag.

        Raises:
            HTTPException: 409 when a tag with the same name (ignoring case) exists.
        """
        await cls._check_unique(db, workspace_id, data.name)
        tag = Tag(workspace_id=workspace_id, name=data.name.strip(), name_key=_key(data.name), color=data.color)
        db.add(tag)
        await db.commit()
        return tag

    @classmethod
    async def update(cls, db: AsyncSession, workspace_id: uuid.UUID, tag_id: uuid.UUID, data: TagUpdate) -> Tag:
        """
        Renames or recolors a tag.

        Raises:
            HTTPException: 404 for an unknown tag, 409 when the new name is taken (ignoring case).
        """
        tag = await cls.get(db, workspace_id, tag_id)
        if data.name and _key(data.name) != tag.name_key:
            await cls._check_unique(db, workspace_id, data.name)
            tag.name, tag.name_key = data.name.strip(), _key(data.name)
        elif data.name:
            tag.name = data.name.strip()
        if data.color:
            tag.color = data.color
        await db.commit()
        return tag

    @classmethod
    async def delete(cls, db: AsyncSession, workspace_id: uuid.UUID, tag_id: uuid.UUID) -> None:
        """
        Deletes a tag and removes it from every contact.

        Raises:
            HTTPException: 404 for an unknown tag.
        """
        tag = await cls.get(db, workspace_id, tag_id)
        await db.execute(delete(contact_tags).where(contact_tags.c.tag_id == tag.id))
        await db.delete(tag)
        await db.commit()

    @staticmethod
    async def _check_unique(db: AsyncSession, workspace_id: uuid.UUID, name: str) -> None:
        existing = await db.execute(select(Tag.id).where(Tag.workspace_id == workspace_id, Tag.name_key == _key(name)))
        if existing.first():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"A tag named '{name.strip()}' already exists")


class SegmentService(BaseService):
    """
    Service layer for saved segments. Membership is evaluated from the rules every time it is used.
    """

    @classmethod
    async def members(cls, db: AsyncSession, workspace_id: uuid.UUID, rules: SegmentRules) -> list[ContactListItem]:
        """
        The contacts currently matching the rules, most recently active first (also used by campaigns).

        Args:
            db (AsyncSession): Active asynchronous database session.
            workspace_id (uuid.UUID): Caller's workspace.
            rules (SegmentRules): Segment rules; an empty set matches everyone.

        Returns:
            list[ContactListItem]: Matching contacts.
        """
        now = datetime.now(timezone.utc)
        return [c for c in await ContactService.list_items(db, workspace_id) if cls._matches(c, rules, now)]

    @classmethod
    async def page(cls, db: AsyncSession, workspace_id: uuid.UUID, rules: SegmentRules, limit: int, offset: int) -> SegmentMembers:
        """The member count and one page of members."""
        members = await cls.members(db, workspace_id, rules)
        return SegmentMembers(count=len(members), members=members[offset: offset + limit])

    @classmethod
    async def list(cls, db: AsyncSession, workspace_id: uuid.UUID) -> list[SegmentResponse]:
        """Lists saved segments with their current member counts."""
        result = await db.execute(select(Segment).where(Segment.workspace_id == workspace_id).order_by(Segment.name_key))
        return [await cls.response(db, s) for s in result.scalars().all()]

    @classmethod
    async def get(cls, db: AsyncSession, workspace_id: uuid.UUID, segment_id: uuid.UUID) -> Segment:
        """
        Fetches one saved segment.

        Raises:
            HTTPException: 404 when missing or owned by another workspace.
        """
        result = await db.execute(select(Segment).where(Segment.id == segment_id, Segment.workspace_id == workspace_id))
        segment = result.scalars().first()
        if not segment:
            raise _not_found("Segment")
        return segment

    @classmethod
    async def create(cls, db: AsyncSession, workspace_id: uuid.UUID, data: SegmentCreate) -> Segment:
        """
        Saves a segment.

        Raises:
            HTTPException: 409 when the name is taken (ignoring case).
        """
        await cls._check_unique(db, workspace_id, data.name)
        segment = Segment(workspace_id=workspace_id, name=data.name.strip(), name_key=_key(data.name),
                          rules=data.rules.model_dump(mode="json"))
        db.add(segment)
        await db.commit()
        return segment

    @classmethod
    async def update(cls, db: AsyncSession, workspace_id: uuid.UUID, segment_id: uuid.UUID, data: SegmentUpdate) -> Segment:
        """
        Renames a segment or replaces its rules.

        Raises:
            HTTPException: 404 for an unknown segment, 409 when the new name is taken.
        """
        segment = await cls.get(db, workspace_id, segment_id)
        if data.name and _key(data.name) != segment.name_key:
            await cls._check_unique(db, workspace_id, data.name)
            segment.name_key = _key(data.name)
        if data.name:
            segment.name = data.name.strip()
        if data.rules:
            segment.rules = data.rules.model_dump(mode="json")
        await db.commit()
        return segment

    @classmethod
    async def delete(cls, db: AsyncSession, workspace_id: uuid.UUID, segment_id: uuid.UUID) -> None:
        """Deletes a saved segment (404 when unknown)."""
        await db.delete(await cls.get(db, workspace_id, segment_id))
        await db.commit()

    @classmethod
    async def response(cls, db: AsyncSession, segment: Segment) -> SegmentResponse:
        rules = SegmentRules.model_validate(segment.rules)
        count = len(await cls.members(db, segment.workspace_id, rules))
        return SegmentResponse(id=segment.id, name=segment.name, rules=rules, count=count)

    @staticmethod
    def _matches(contact: ContactListItem, rules: SegmentRules, now: datetime) -> bool:
        tag_ids = {t.id for t in contact.tags}
        if rules.tags:
            wanted = set(rules.tags)
            if not (wanted <= tag_ids if rules.tags_match == "all" else wanted & tag_ids):
                return False
        if set(rules.exclude_tags) & tag_ids:
            return False
        if rules.platforms and not set(rules.platforms) & set(contact.platforms):
            return False
        if rules.active_within_days and (not contact.last_activity_at or contact.last_activity_at < now - timedelta(days=rules.active_within_days)):
            return False
        if rules.consent and contact.consent not in rules.consent:
            return False
        if rules.birthday_within_days is not None:
            # ponytail: server's local date; use a per-workspace timezone once workspaces have one.
            if not contact.birthday or _days_until(contact.birthday, date.today()) > rules.birthday_within_days:
                return False
        return True

    @staticmethod
    async def _check_unique(db: AsyncSession, workspace_id: uuid.UUID, name: str) -> None:
        existing = await db.execute(select(Segment.id).where(Segment.workspace_id == workspace_id, Segment.name_key == _key(name)))
        if existing.first():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"A segment named '{name.strip()}' already exists")


def _days_until(anniversary: date, today: date) -> int:
    """Days until the next yearly occurrence of a date (29 February falls on 1 March in other years)."""
    def on(year: int) -> date:
        try:
            return anniversary.replace(year=year)
        except ValueError:
            return date(year, 3, 1)
    upcoming = on(today.year)
    if upcoming < today:
        upcoming = on(today.year + 1)
    return (upcoming - today).days
