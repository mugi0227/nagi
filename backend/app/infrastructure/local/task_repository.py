"""
SQLite implementation of Task repository.
"""

from __future__ import annotations

from datetime import datetime
from difflib import SequenceMatcher
from typing import Optional
from uuid import UUID, uuid4

from sqlalchemy import and_, func, or_, select
from sqlalchemy import delete as sa_delete

from app.core.exceptions import NotFoundError
from app.infrastructure.local.database import TaskORM, get_session_factory
from app.interfaces.task_repository import ITaskRepository
from app.models.enums import TaskStatus
from app.models.task import SimilarTask, Task, TaskCreate, TaskUpdate
from app.utils.datetime_utils import now_utc


class SqliteTaskRepository(ITaskRepository):
    """SQLite implementation of task repository."""

    def __init__(self, session_factory=None):
        """
        Initialize repository.

        Args:
            session_factory: Optional session factory (for testing)
        """
        self._session_factory = session_factory or get_session_factory()

    def _orm_to_model(self, orm: TaskORM) -> Task:
        """Convert ORM object to Pydantic model."""
        return Task(
            id=UUID(orm.id),
            user_id=orm.user_id,
            project_id=UUID(orm.project_id) if orm.project_id else None,
            phase_id=UUID(orm.phase_id) if orm.phase_id else None,
            title=orm.title,
            description=orm.description,
            purpose=orm.purpose if hasattr(orm, 'purpose') else None,
            status=TaskStatus(orm.status),
            importance=orm.importance,
            urgency=orm.urgency,
            energy_level=orm.energy_level,
            estimated_minutes=orm.estimated_minutes,
            due_date=orm.due_date,
            start_not_before=orm.start_not_before,
            parent_id=UUID(orm.parent_id) if orm.parent_id else None,
            order_in_parent=orm.order_in_parent,
            dependency_ids=[UUID(dep_id) for dep_id in (orm.dependency_ids or [])],
            same_day_allowed=(
                bool(orm.same_day_allowed)
                if hasattr(orm, 'same_day_allowed') and orm.same_day_allowed is not None
                else True
            ),
            min_gap_days=orm.min_gap_days if hasattr(orm, 'min_gap_days') and orm.min_gap_days is not None else 0,
            progress=orm.progress if hasattr(orm, 'progress') and orm.progress is not None else 0,
            source_capture_id=UUID(orm.source_capture_id) if orm.source_capture_id else None,
            created_by=orm.created_by,
            created_at=orm.created_at,
            updated_at=orm.updated_at,
            start_time=orm.start_time,
            end_time=orm.end_time,
            is_fixed_time=bool(orm.is_fixed_time),
            is_all_day=bool(orm.is_all_day) if hasattr(orm, 'is_all_day') and orm.is_all_day is not None else False,
            location=orm.location,
            attendees=orm.attendees or [],
            meeting_notes=orm.meeting_notes,
            recurring_meeting_id=UUID(orm.recurring_meeting_id) if orm.recurring_meeting_id else None,
            recurring_task_id=UUID(orm.recurring_task_id) if hasattr(orm, 'recurring_task_id') and orm.recurring_task_id else None,
            milestone_id=UUID(orm.milestone_id) if orm.milestone_id else None,
            touchpoint_count=orm.touchpoint_count if hasattr(orm, 'touchpoint_count') else None,
            touchpoint_minutes=orm.touchpoint_minutes if hasattr(orm, 'touchpoint_minutes') else None,
            touchpoint_gap_days=orm.touchpoint_gap_days if hasattr(orm, 'touchpoint_gap_days') and orm.touchpoint_gap_days is not None else 0,
            touchpoint_steps=orm.touchpoint_steps or [],
            completion_note=orm.completion_note if hasattr(orm, 'completion_note') else None,
            completed_at=orm.completed_at if hasattr(orm, 'completed_at') else None,
            completed_by=orm.completed_by if hasattr(orm, 'completed_by') else None,
            guide=orm.guide if hasattr(orm, 'guide') else None,
            requires_all_completion=bool(orm.requires_all_completion) if hasattr(orm, 'requires_all_completion') and orm.requires_all_completion is not None else False,
        )

    async def create(self, user_id: str, task: TaskCreate) -> Task:
        """Create a new task."""
        async with self._session_factory() as session:
            orm = TaskORM(
                id=str(uuid4()),
                user_id=user_id,
                project_id=str(task.project_id) if task.project_id else None,
                phase_id=str(task.phase_id) if task.phase_id else None,
                title=task.title,
                description=task.description,
                purpose=task.purpose,
                importance=task.importance.value,
                urgency=task.urgency.value,
                energy_level=task.energy_level.value,
                estimated_minutes=task.estimated_minutes,
                due_date=task.due_date,
                start_not_before=task.start_not_before,
                parent_id=str(task.parent_id) if task.parent_id else None,
                order_in_parent=task.order_in_parent,
                dependency_ids=[str(dep_id) for dep_id in task.dependency_ids],
                same_day_allowed=task.same_day_allowed,
                min_gap_days=task.min_gap_days,
                progress=task.progress,
                source_capture_id=str(task.source_capture_id) if task.source_capture_id else None,
                created_by=task.created_by.value,
                start_time=task.start_time,
                end_time=task.end_time,
                is_fixed_time=task.is_fixed_time,
                is_all_day=task.is_all_day,
                location=task.location,
                attendees=task.attendees,
                meeting_notes=task.meeting_notes,
                recurring_task_id=str(task.recurring_task_id) if hasattr(task, 'recurring_task_id') and task.recurring_task_id else None,
                milestone_id=str(task.milestone_id) if task.milestone_id else None,
                touchpoint_count=task.touchpoint_count,
                touchpoint_minutes=task.touchpoint_minutes,
                touchpoint_gap_days=task.touchpoint_gap_days,
                touchpoint_steps=[step.model_dump(mode="json") for step in task.touchpoint_steps],
                completion_note=task.completion_note if hasattr(task, 'completion_note') else None,
                guide=task.guide if hasattr(task, 'guide') else None,
                requires_all_completion=task.requires_all_completion,
            )
            session.add(orm)
            await session.commit()
            await session.refresh(orm)
            return self._orm_to_model(orm)

    async def get(self, user_id: str, task_id: UUID, project_id: Optional[UUID] = None) -> Optional[Task]:
        """Get a task by ID. If project_id is given, uses project-based access (no user_id check)."""
        async with self._session_factory() as session:
            if project_id:
                # Project-based access: filter by project_id only
                result = await session.execute(
                    select(TaskORM).where(
                        and_(TaskORM.id == str(task_id), TaskORM.project_id == str(project_id))
                    )
                )
            else:
                # Personal access: require user_id match
                result = await session.execute(
                    select(TaskORM).where(
                        and_(TaskORM.id == str(task_id), TaskORM.user_id == user_id)
                    )
                )
            orm = result.scalar_one_or_none()
            return self._orm_to_model(orm) if orm else None

    async def get_by_id(self, user_id: str, task_id: UUID) -> Optional[Task]:
        """Get a task by ID. First tries user_id match, then any task by ID."""
        async with self._session_factory() as session:
            # First try personal access (user_id match)
            result = await session.execute(
                select(TaskORM).where(
                    and_(TaskORM.id == str(task_id), TaskORM.user_id == user_id)
                )
            )
            orm = result.scalar_one_or_none()
            if orm:
                return self._orm_to_model(orm)

            # Fallback: find by task_id only (for project tasks where user_id differs)
            result = await session.execute(
                select(TaskORM).where(TaskORM.id == str(task_id))
            )
            orm = result.scalar_one_or_none()
            return self._orm_to_model(orm) if orm else None

    async def list(
        self,
        user_id: str,
        project_id: Optional[UUID] = None,
        status: Optional[str] = None,
        parent_id: Optional[UUID] = None,
        include_done: bool = False,
        limit: int = 100,
        offset: int = 0,
    ) -> list[Task]:
        """List tasks. If project_id specified, uses project-based access (no user_id filter)."""
        async with self._session_factory() as session:
            if project_id is not None:
                # Project-based access: filter by project_id only
                query = select(TaskORM).where(TaskORM.project_id == str(project_id))
            else:
                # Personal access (Inbox/schedule): filter by user_id
                query = select(TaskORM).where(TaskORM.user_id == user_id)

            if status:
                query = query.where(TaskORM.status == status)
            elif not include_done:
                query = query.where(TaskORM.status != TaskStatus.DONE.value)

            if parent_id is not None:
                query = query.where(TaskORM.parent_id == str(parent_id))

            query = query.order_by(TaskORM.created_at.desc())
            query = query.limit(limit).offset(offset)

            result = await session.execute(query)
            return [self._orm_to_model(orm) for orm in result.scalars().all()]

    async def update(self, user_id: str, task_id: UUID, update: TaskUpdate, project_id: Optional[UUID] = None) -> Task:
        """Update an existing task. If project_id given, uses project-based access."""
        async with self._session_factory() as session:
            if project_id:
                result = await session.execute(
                    select(TaskORM).where(
                        and_(TaskORM.id == str(task_id), TaskORM.project_id == str(project_id))
                    )
                )
            else:
                result = await session.execute(
                    select(TaskORM).where(
                        and_(TaskORM.id == str(task_id), TaskORM.user_id == user_id)
                    )
                )
            orm = result.scalar_one_or_none()

            if not orm:
                raise NotFoundError(f"Task {task_id} not found")

            # Check if parent task is DONE - if so, force this subtask to stay DONE
            if orm.parent_id:
                parent_result = await session.execute(
                    select(TaskORM).where(TaskORM.id == orm.parent_id)
                )
                parent_task = parent_result.scalar_one_or_none()
                if parent_task and parent_task.status == TaskStatus.DONE.value:
                    # Parent is completed, force subtask to be DONE
                    update.status = TaskStatus.DONE

            update_data = update.model_dump(exclude_unset=True)
            status_value = None
            for field, value in update_data.items():
                if value is not None:
                    if field in ("project_id", "parent_id", "phase_id", "milestone_id"):
                        value = str(value) if value else None
                    elif field == "dependency_ids":
                        value = [str(dep_id) for dep_id in value]
                    elif field == "touchpoint_steps":
                        value = [
                            step.model_dump(mode="json") if hasattr(step, "model_dump") else step
                            for step in value
                        ]
                    elif hasattr(value, "value"):  # Enum
                        value = value.value
                    if field == "status":
                        status_value = value
                    setattr(orm, field, value)

            orm.updated_at = now_utc()

            # Auto-set completed_at/completed_by when status changes to DONE
            if status_value == TaskStatus.DONE.value and orm.completed_at is None:
                orm.completed_at = now_utc()
                orm.completed_by = user_id
            elif status_value is not None and status_value != TaskStatus.DONE.value:
                # Clear completed_at/completed_by if status changes from DONE to something else
                orm.completed_at = None
                orm.completed_by = None

            # Cascade status to subtasks
            if status_value is not None:
                if orm.project_id:
                    subtask_result = await session.execute(
                        select(TaskORM).where(
                            and_(TaskORM.parent_id == str(task_id), TaskORM.project_id == orm.project_id)
                        )
                    )
                else:
                    subtask_result = await session.execute(
                        select(TaskORM).where(
                            and_(TaskORM.parent_id == str(task_id), TaskORM.user_id == user_id)
                        )
                    )
                for subtask in subtask_result.scalars().all():
                    subtask.status = status_value
                    subtask.updated_at = now_utc()
                    # Auto-set completed_at/completed_by for subtasks as well
                    if status_value == TaskStatus.DONE.value and subtask.completed_at is None:
                        subtask.completed_at = now_utc()
                        subtask.completed_by = user_id
                    elif status_value != TaskStatus.DONE.value:
                        subtask.completed_at = None
                        subtask.completed_by = None

            await session.commit()
            await session.refresh(orm)
            return self._orm_to_model(orm)

    async def delete(self, user_id: str, task_id: UUID, project_id: Optional[UUID] = None) -> bool:
        """Delete a task. If project_id given, uses project-based access."""
        async with self._session_factory() as session:
            if project_id:
                result = await session.execute(
                    select(TaskORM).where(
                        and_(TaskORM.id == str(task_id), TaskORM.project_id == str(project_id))
                    )
                )
            else:
                result = await session.execute(
                    select(TaskORM).where(
                        and_(TaskORM.id == str(task_id), TaskORM.user_id == user_id)
                    )
                )
            orm = result.scalar_one_or_none()

            if not orm:
                return False

            await session.delete(orm)
            await session.commit()
            return True

    async def find_similar(
        self,
        user_id: str,
        title: str,
        project_id: UUID | None = None,
        threshold: float = 0.8,
        limit: int = 5,
    ) -> list[SimilarTask]:
        """Find similar tasks using simple string matching within the same project."""
        async with self._session_factory() as session:
            if project_id is not None:
                # Project-based access
                conditions = [TaskORM.project_id == str(project_id)]
            else:
                # Personal Inbox access
                conditions = [TaskORM.user_id == user_id, TaskORM.project_id.is_(None)]

            result = await session.execute(
                select(TaskORM).where(and_(*conditions))
            )
            tasks = result.scalars().all()

            similar = []
            for orm in tasks:
                score = SequenceMatcher(None, title.lower(), orm.title.lower()).ratio()
                if score >= threshold:
                    similar.append(SimilarTask(
                        task=self._orm_to_model(orm),
                        similarity_score=score,
                    ))

            similar.sort(key=lambda x: x.similarity_score, reverse=True)
            return similar[:limit]

    async def get_by_capture_id(self, user_id: str, capture_id: UUID) -> list[Task]:
        """Get tasks created from a specific capture."""
        async with self._session_factory() as session:
            result = await session.execute(
                select(TaskORM).where(
                    and_(
                        TaskORM.user_id == user_id,
                        TaskORM.source_capture_id == str(capture_id),
                    )
                )
            )
            return [self._orm_to_model(orm) for orm in result.scalars().all()]

    async def get_subtasks(self, user_id: str, parent_id: UUID, project_id: Optional[UUID] = None) -> list[Task]:
        """Get all subtasks of a parent task."""
        return await self.list(user_id, project_id=project_id, parent_id=parent_id, include_done=True)

    async def get_many(self, task_ids: list[UUID]) -> list[Task]:
        """Get multiple tasks by ID."""
        if not task_ids:
            return []
        async with self._session_factory() as session:
            result = await session.execute(
                select(TaskORM).where(TaskORM.id.in_([str(tid) for tid in task_ids]))
            )
            return [self._orm_to_model(orm) for orm in result.scalars().all()]

    async def list_personal_tasks(
        self,
        user_id: str,
        status: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[Task]:
        """List personal tasks (Inbox/Memo) - excluding project tasks."""
        async with self._session_factory() as session:
            query = select(TaskORM).where(
                and_(
                    TaskORM.user_id == user_id,
                    TaskORM.project_id.is_(None)
                )
            )

            if status:
                query = query.where(TaskORM.status == status)
            else:
                # Default behavior: exclude DONE unless specified?
                # Replicating list() default behavior logic or just basic filtering?
                # list() implementation: if not include_done: query = query.where(status != DONE)
                # But here we stick to the args. If status is None, we return all statuses unless caller filters.
                # Actually, list() has include_done.
                # Let's add include_done to signature to match list().
                pass

            query = query.order_by(TaskORM.created_at.desc())
            query = query.limit(limit).offset(offset)

            result = await session.execute(query)
            return [self._orm_to_model(orm) for orm in result.scalars().all()]

    async def count(
        self,
        user_id: str,
        project_id: Optional[UUID] = None,
        status: Optional[str] = None,
    ) -> int:
        """Count tasks matching filters."""
        async with self._session_factory() as session:
            if project_id is not None:
                query = select(func.count(TaskORM.id)).where(TaskORM.project_id == str(project_id))
            else:
                query = select(func.count(TaskORM.id)).where(TaskORM.user_id == user_id)

            if status:
                query = query.where(TaskORM.status == status)

            result = await session.execute(query)
            return result.scalar() or 0

    async def list_by_recurring_meeting(
        self,
        user_id: str,
        recurring_meeting_id: UUID,
        start_after: Optional[datetime] = None,
        end_before: Optional[datetime] = None,
    ) -> list["Task"]:
        """List tasks generated from a recurring meeting."""
        async with self._session_factory() as session:
            query = select(TaskORM).where(
                and_(
                    TaskORM.user_id == user_id,
                    TaskORM.recurring_meeting_id == str(recurring_meeting_id),
                )
            )

            if start_after:
                query = query.where(TaskORM.start_time >= start_after)
            if end_before:
                query = query.where(TaskORM.start_time < end_before)

            query = query.order_by(TaskORM.start_time.asc())

            result = await session.execute(query)
            return [self._orm_to_model(orm) for orm in result.scalars().all()]

    async def list_by_recurring_task(
        self,
        user_id: str,
        recurring_task_id: UUID,
        start_after: Optional[datetime] = None,
        end_before: Optional[datetime] = None,
    ) -> list["Task"]:
        """List tasks generated from a recurring task definition."""
        async with self._session_factory() as session:
            query = select(TaskORM).where(
                and_(
                    TaskORM.user_id == user_id,
                    TaskORM.recurring_task_id == str(recurring_task_id),
                )
            )

            if start_after:
                query = query.where(TaskORM.due_date >= start_after)
            if end_before:
                query = query.where(TaskORM.due_date < end_before)

            query = query.order_by(TaskORM.due_date.asc())

            result = await session.execute(query)
            return [self._orm_to_model(orm) for orm in result.scalars().all()]

    async def delete_by_recurring_task(
        self,
        user_id: str,
        recurring_task_id: UUID,
    ) -> int:
        """Delete all tasks generated from a recurring task definition."""
        async with self._session_factory() as session:
            stmt = sa_delete(TaskORM).where(
                and_(
                    TaskORM.user_id == user_id,
                    TaskORM.recurring_task_id == str(recurring_task_id),
                )
            )
            result = await session.execute(stmt)
            await session.commit()
            return result.rowcount

    async def list_completed_in_period(
        self,
        user_id: str,
        period_start: datetime,
        period_end: datetime,
        project_id: Optional[UUID] = None,
    ) -> list[Task]:
        """
        List tasks completed within a specific period.

        Uses completed_at if available, falls back to updated_at for older data.

        Args:
            user_id: User ID
            period_start: Period start datetime (inclusive)
            period_end: Period end datetime (exclusive)
            project_id: Optional project ID filter

        Returns:
            List of completed tasks in the period
        """
        async with self._session_factory() as session:
            # Filter by user and DONE status
            conditions = [
                TaskORM.user_id == user_id,
                TaskORM.status == TaskStatus.DONE.value,
            ]

            if project_id is not None:
                conditions.append(TaskORM.project_id == str(project_id))

            # Use completed_at if available, otherwise fall back to updated_at
            # This handles both new tasks (with completed_at) and legacy tasks
            conditions.append(
                or_(
                    and_(
                        TaskORM.completed_at.isnot(None),
                        TaskORM.completed_at >= period_start,
                        TaskORM.completed_at < period_end,
                    ),
                    and_(
                        TaskORM.completed_at.is_(None),
                        TaskORM.updated_at >= period_start,
                        TaskORM.updated_at < period_end,
                    ),
                )
            )

            query = select(TaskORM).where(and_(*conditions))
            query = query.order_by(TaskORM.completed_at.desc().nullslast(), TaskORM.updated_at.desc())

            result = await session.execute(query)
            return [self._orm_to_model(orm) for orm in result.scalars().all()]
