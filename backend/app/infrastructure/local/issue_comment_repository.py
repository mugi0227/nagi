"""
SQLite implementation of Issue Comment repository.
"""

from __future__ import annotations

from uuid import UUID, uuid4

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ForbiddenError
from app.interfaces.issue_comment_repository import IIssueCommentRepository
from app.models.issue_comment import IssueComment, IssueCommentCreate
from app.infrastructure.local.database import (
    IssueCommentORM,
    UserORM,
    get_session_factory,
)


class SqliteIssueCommentRepository(IIssueCommentRepository):
    """SQLite implementation of issue comment repository."""

    def __init__(self, session_factory=None):
        self._session_factory = session_factory or get_session_factory()

    async def _orm_to_model(
        self, session: AsyncSession, orm: IssueCommentORM
    ) -> IssueComment:
        """Convert ORM object to Pydantic model."""
        display_name = None
        user_result = await session.execute(
            select(UserORM.display_name).where(UserORM.id == orm.user_id)
        )
        user_row = user_result.first()
        if user_row:
            display_name = user_row[0]

        return IssueComment(
            id=UUID(orm.id),
            issue_id=UUID(orm.issue_id),
            user_id=orm.user_id,
            display_name=display_name,
            content=orm.content,
            created_at=orm.created_at,
            updated_at=orm.updated_at,
        )

    async def create(
        self, issue_id: UUID, user_id: str, comment: IssueCommentCreate
    ) -> IssueComment:
        """Create a new comment on an issue."""
        async with self._session_factory() as session:
            orm = IssueCommentORM(
                id=str(uuid4()),
                issue_id=str(issue_id),
                user_id=user_id,
                content=comment.content,
            )
            session.add(orm)
            await session.commit()
            await session.refresh(orm)
            return await self._orm_to_model(session, orm)

    async def list_by_issue(
        self, issue_id: UUID, limit: int = 50, offset: int = 0
    ) -> tuple[list[IssueComment], int]:
        """List comments for an issue, ordered by created_at ASC."""
        async with self._session_factory() as session:
            # Count
            count_result = await session.execute(
                select(func.count()).select_from(IssueCommentORM).where(
                    IssueCommentORM.issue_id == str(issue_id)
                )
            )
            total = count_result.scalar() or 0

            # Fetch
            result = await session.execute(
                select(IssueCommentORM)
                .where(IssueCommentORM.issue_id == str(issue_id))
                .order_by(IssueCommentORM.created_at.asc())
                .limit(limit)
                .offset(offset)
            )
            orms = result.scalars().all()
            comments = [await self._orm_to_model(session, orm) for orm in orms]
            return comments, total

    async def delete(self, comment_id: UUID, user_id: str) -> bool:
        """Delete a comment (author only)."""
        async with self._session_factory() as session:
            result = await session.execute(
                select(IssueCommentORM).where(
                    IssueCommentORM.id == str(comment_id)
                )
            )
            orm = result.scalar_one_or_none()
            if not orm:
                return False
            if orm.user_id != user_id:
                raise ForbiddenError("Only the author can delete this comment")
            await session.delete(orm)
            await session.commit()
            return True

    async def delete_by_issue(self, issue_id: UUID) -> int:
        """Delete all comments for an issue."""
        async with self._session_factory() as session:
            result = await session.execute(
                select(IssueCommentORM).where(
                    IssueCommentORM.issue_id == str(issue_id)
                )
            )
            orms = result.scalars().all()
            count = len(orms)
            for orm in orms:
                await session.delete(orm)
            if count > 0:
                await session.commit()
            return count
