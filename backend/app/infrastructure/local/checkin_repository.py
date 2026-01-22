"""
SQLite implementation of check-in repository.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Optional
from uuid import UUID, uuid4

from sqlalchemy import select, and_, delete

from app.infrastructure.local.database import (
    CheckinItemORM,
    CheckinORM,
    get_session_factory,
)
from app.interfaces.checkin_repository import ICheckinRepository
from app.models.collaboration import (
    Checkin,
    CheckinAgendaItems,
    CheckinCreate,
    CheckinCreateV2,
    CheckinItemResponse,
    CheckinUpdateV2,
    CheckinV2,
)
from app.models.enums import CheckinItemCategory, CheckinItemUrgency, CheckinMood


class SqliteCheckinRepository(ICheckinRepository):
    """SQLite implementation of check-in repository."""

    def __init__(self, session_factory=None):
        self._session_factory = session_factory or get_session_factory()

    def _orm_to_model(self, orm: CheckinORM) -> Checkin:
        return Checkin(
            id=UUID(orm.id),
            user_id=orm.user_id,
            project_id=UUID(orm.project_id),
            member_user_id=orm.member_user_id,
            checkin_date=orm.checkin_date,
            checkin_type=orm.checkin_type or "weekly",
            summary_text=orm.summary_text,
            raw_text=orm.raw_text,
            created_at=orm.created_at,
        )

    async def create(
        self, user_id: str, project_id: UUID, checkin: CheckinCreate
    ) -> Checkin:
        async with self._session_factory() as session:
            orm = CheckinORM(
                id=str(uuid4()),
                user_id=user_id,
                project_id=str(project_id),
                member_user_id=checkin.member_user_id,
                checkin_date=checkin.checkin_date,
                checkin_type=checkin.checkin_type,
                summary_text=checkin.summary_text,
                raw_text=checkin.raw_text,
            )
            session.add(orm)
            await session.commit()
            await session.refresh(orm)
            return self._orm_to_model(orm)

    async def list(
        self,
        user_id: str,
        project_id: UUID,
        member_user_id: str | None = None,
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> list[Checkin]:
        """List check-ins for a project (project-based access)."""
        async with self._session_factory() as session:
            # Project-based access: filter by project_id only
            conditions = [CheckinORM.project_id == str(project_id)]
            if member_user_id:
                conditions.append(CheckinORM.member_user_id == member_user_id)
            if start_date:
                conditions.append(CheckinORM.checkin_date >= start_date)
            if end_date:
                conditions.append(CheckinORM.checkin_date <= end_date)

            result = await session.execute(
                select(CheckinORM).where(and_(*conditions)).order_by(CheckinORM.checkin_date.desc())
            )
            return [self._orm_to_model(orm) for orm in result.scalars().all()]

    # ==========================================================================
    # V2 Methods (Structured check-ins)
    # ==========================================================================

    def _orm_to_model_v2(
        self, orm: CheckinORM, items: list[CheckinItemORM]
    ) -> CheckinV2:
        """Convert ORM to V2 model with items."""
        item_responses = [
            CheckinItemResponse(
                id=UUID(item.id),
                category=CheckinItemCategory(item.category),
                content=item.content,
                related_task_id=item.related_task_id,
                urgency=CheckinItemUrgency(item.urgency) if item.urgency else CheckinItemUrgency.MEDIUM,
                related_task_title=None,  # Populated by API layer if needed
            )
            for item in items
        ]
        return CheckinV2(
            id=UUID(orm.id),
            user_id=orm.user_id,
            project_id=UUID(orm.project_id),
            member_user_id=orm.member_user_id,
            checkin_date=orm.checkin_date,
            items=item_responses,
            mood=CheckinMood(orm.mood) if orm.mood else None,
            must_discuss_in_next_meeting=orm.must_discuss_in_next_meeting,
            free_comment=orm.free_comment,
            checkin_type=orm.checkin_type,
            summary_text=orm.summary_text,
            raw_text=orm.raw_text,
            created_at=orm.created_at,
        )

    async def create_v2(
        self, user_id: str, project_id: UUID, checkin: CheckinCreateV2
    ) -> CheckinV2:
        """Create a structured check-in (V2)."""
        async with self._session_factory() as session:
            checkin_id = str(uuid4())

            # Build raw_text from structured data for backward compatibility
            raw_text = checkin.raw_text
            if not raw_text:
                # Always build raw_text if there's any structured data
                raw_text = self._build_raw_text(checkin)
            # Ensure raw_text is never None (DB constraint)
            if not raw_text:
                raw_text = ""

            orm = CheckinORM(
                id=checkin_id,
                user_id=user_id,
                project_id=str(project_id),
                member_user_id=checkin.member_user_id,
                checkin_date=checkin.checkin_date,
                checkin_type=checkin.checkin_type.value if checkin.checkin_type else None,
                summary_text=None,
                raw_text=raw_text,
                mood=checkin.mood.value if checkin.mood else None,
                must_discuss_in_next_meeting=checkin.must_discuss_in_next_meeting,
                free_comment=checkin.free_comment,
            )
            session.add(orm)

            # Create items
            item_orms = []
            for idx, item in enumerate(checkin.items):
                item_orm = CheckinItemORM(
                    id=str(uuid4()),
                    checkin_id=checkin_id,
                    user_id=user_id,
                    category=item.category.value,
                    content=item.content,
                    related_task_id=item.related_task_id,
                    urgency=item.urgency.value,
                    order_index=idx,
                    created_at=datetime.utcnow(),
                )
                session.add(item_orm)
                item_orms.append(item_orm)

            await session.commit()
            await session.refresh(orm)
            return self._orm_to_model_v2(orm, item_orms)

    def _build_raw_text(self, checkin: CheckinCreateV2) -> str:
        """Build raw_text from structured items for backward compatibility."""
        parts = []

        # Add mood at the top
        if checkin.mood:
            mood_labels = {
                CheckinMood.GOOD: "😊 順調",
                CheckinMood.OKAY: "😐 まあまあ",
                CheckinMood.STRUGGLING: "😰 厳しい",
            }
            mood_label = mood_labels.get(checkin.mood, checkin.mood.value)
            parts.append(f"【調子】{mood_label}")

        for item in checkin.items:
            category_labels = {
                CheckinItemCategory.BLOCKER: "【ブロッカー】",
                CheckinItemCategory.DISCUSSION: "【相談】",
                CheckinItemCategory.UPDATE: "【進捗】",
                CheckinItemCategory.REQUEST: "【依頼】",
            }
            label = category_labels.get(item.category, "")
            parts.append(f"{label}{item.content}")

        if checkin.must_discuss_in_next_meeting:
            parts.append(f"【次回必須】{checkin.must_discuss_in_next_meeting}")

        if checkin.free_comment:
            parts.append(f"【その他】{checkin.free_comment}")

        return "\n".join(parts)

    async def list_v2(
        self,
        user_id: str,
        project_id: UUID,
        member_user_id: Optional[str] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        category: Optional[CheckinItemCategory] = None,
    ) -> list[CheckinV2]:
        """List structured check-ins (V2)."""
        async with self._session_factory() as session:
            # Build conditions
            conditions = [CheckinORM.project_id == str(project_id)]
            if member_user_id:
                conditions.append(CheckinORM.member_user_id == member_user_id)
            if start_date:
                conditions.append(CheckinORM.checkin_date >= start_date)
            if end_date:
                conditions.append(CheckinORM.checkin_date <= end_date)

            # Get checkins
            result = await session.execute(
                select(CheckinORM)
                .where(and_(*conditions))
                .order_by(CheckinORM.checkin_date.desc())
            )
            checkins = result.scalars().all()

            if not checkins:
                return []

            # Get all items for these checkins
            checkin_ids = [c.id for c in checkins]
            item_conditions = [CheckinItemORM.checkin_id.in_(checkin_ids)]
            if category:
                item_conditions.append(CheckinItemORM.category == category.value)

            items_result = await session.execute(
                select(CheckinItemORM)
                .where(and_(*item_conditions))
                .order_by(CheckinItemORM.order_index)
            )
            all_items = items_result.scalars().all()

            # Group items by checkin_id
            items_by_checkin: dict[str, list[CheckinItemORM]] = {}
            for item in all_items:
                if item.checkin_id not in items_by_checkin:
                    items_by_checkin[item.checkin_id] = []
                items_by_checkin[item.checkin_id].append(item)

            # Build V2 models
            return [
                self._orm_to_model_v2(c, items_by_checkin.get(c.id, []))
                for c in checkins
            ]

    async def get_v2(
        self,
        checkin_id: UUID,
    ) -> Optional[CheckinV2]:
        """Get a single check-in by ID."""
        async with self._session_factory() as session:
            result = await session.execute(
                select(CheckinORM).where(CheckinORM.id == str(checkin_id))
            )
            orm = result.scalar_one_or_none()
            if not orm:
                return None

            # Get items
            items_result = await session.execute(
                select(CheckinItemORM)
                .where(CheckinItemORM.checkin_id == str(checkin_id))
                .order_by(CheckinItemORM.order_index)
            )
            items = items_result.scalars().all()
            return self._orm_to_model_v2(orm, items)

    async def update_v2(
        self,
        checkin_id: UUID,
        checkin: CheckinUpdateV2,
    ) -> Optional[CheckinV2]:
        """Update a structured check-in (V2)."""
        async with self._session_factory() as session:
            result = await session.execute(
                select(CheckinORM).where(CheckinORM.id == str(checkin_id))
            )
            orm = result.scalar_one_or_none()
            if not orm:
                return None

            # Update fields if provided
            if checkin.mood is not None:
                orm.mood = checkin.mood.value
            if checkin.must_discuss_in_next_meeting is not None:
                orm.must_discuss_in_next_meeting = checkin.must_discuss_in_next_meeting
            if checkin.free_comment is not None:
                orm.free_comment = checkin.free_comment

            # Update items if provided
            item_orms = []
            if checkin.items is not None:
                # Delete existing items
                await session.execute(
                    delete(CheckinItemORM).where(
                        CheckinItemORM.checkin_id == str(checkin_id)
                    )
                )

                # Create new items
                for idx, item in enumerate(checkin.items):
                    item_orm = CheckinItemORM(
                        id=str(uuid4()),
                        checkin_id=str(checkin_id),
                        user_id=orm.user_id,
                        category=item.category.value,
                        content=item.content,
                        related_task_id=item.related_task_id,
                        urgency=item.urgency.value,
                        order_index=idx,
                        created_at=datetime.utcnow(),
                    )
                    session.add(item_orm)
                    item_orms.append(item_orm)

                # Rebuild raw_text from updated data
                from app.models.collaboration import CheckinCreateV2 as CreateModel
                temp_create = CreateModel(
                    member_user_id=orm.member_user_id,
                    checkin_date=orm.checkin_date,
                    items=checkin.items,
                    mood=CheckinMood(orm.mood) if orm.mood else checkin.mood,
                    must_discuss_in_next_meeting=orm.must_discuss_in_next_meeting,
                    free_comment=orm.free_comment,
                )
                orm.raw_text = self._build_raw_text(temp_create)
            else:
                # Get existing items
                items_result = await session.execute(
                    select(CheckinItemORM)
                    .where(CheckinItemORM.checkin_id == str(checkin_id))
                    .order_by(CheckinItemORM.order_index)
                )
                item_orms = list(items_result.scalars().all())

            await session.commit()
            await session.refresh(orm)
            return self._orm_to_model_v2(orm, item_orms)

    async def delete_v2(
        self,
        checkin_id: UUID,
    ) -> bool:
        """Delete a check-in. Returns True if deleted, False if not found."""
        async with self._session_factory() as session:
            result = await session.execute(
                select(CheckinORM).where(CheckinORM.id == str(checkin_id))
            )
            orm = result.scalar_one_or_none()
            if not orm:
                return False

            # Delete items first
            await session.execute(
                delete(CheckinItemORM).where(
                    CheckinItemORM.checkin_id == str(checkin_id)
                )
            )

            # Delete checkin
            await session.delete(orm)
            await session.commit()
            return True

    async def get_agenda_items(
        self,
        user_id: str,
        project_id: UUID,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
    ) -> CheckinAgendaItems:
        """Get check-in items grouped by category for agenda generation."""
        checkins = await self.list_v2(
            user_id=user_id,
            project_id=project_id,
            start_date=start_date,
            end_date=end_date,
        )

        blockers = []
        discussions = []
        requests = []
        updates = []
        member_moods: dict[str, CheckinMood] = {}
        must_discuss_items = []

        for checkin in checkins:
            # Track mood (latest per member)
            if checkin.mood and checkin.member_user_id not in member_moods:
                member_moods[checkin.member_user_id] = checkin.mood

            # Track must_discuss items
            if checkin.must_discuss_in_next_meeting:
                must_discuss_items.append({
                    "member": checkin.member_user_id,
                    "content": checkin.must_discuss_in_next_meeting,
                    "date": checkin.checkin_date.isoformat(),
                })

            # Group items by category
            for item in checkin.items:
                item_data = {
                    "member": checkin.member_user_id,
                    "content": item.content,
                    "urgency": item.urgency.value,
                    "related_task_id": item.related_task_id,
                    "date": checkin.checkin_date.isoformat(),
                }
                if item.category == CheckinItemCategory.BLOCKER:
                    blockers.append(item_data)
                elif item.category == CheckinItemCategory.DISCUSSION:
                    discussions.append(item_data)
                elif item.category == CheckinItemCategory.REQUEST:
                    requests.append(item_data)
                elif item.category == CheckinItemCategory.UPDATE:
                    updates.append(item_data)

        return CheckinAgendaItems(
            project_id=project_id,
            start_date=start_date,
            end_date=end_date,
            blockers=blockers,
            discussions=discussions,
            requests=requests,
            updates=updates,
            member_moods=member_moods,
            must_discuss_items=must_discuss_items,
        )
