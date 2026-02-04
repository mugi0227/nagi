"""
SQLite implementation of Issue repository.
"""

from __future__ import annotations

from typing import Optional
from uuid import UUID, uuid4

from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ForbiddenError
from app.interfaces.issue_repository import IIssueRepository
from app.models.issue import Issue, IssueCreate, IssueUpdate, IssueStatusUpdate, IssueComment, IssueCommentCreate
from app.models.enums import IssueCategory, IssueStatus
from app.infrastructure.local.database import (
    IssueORM,
    IssueLikeORM,
    IssueCommentORM,
    UserORM,
    get_session_factory,
)


class SqliteIssueRepository(IIssueRepository):
    """SQLite implementation of issue repository."""

    def __init__(self, session_factory=None):
        self._session_factory = session_factory or get_session_factory()

    async def _orm_to_model(
        self,
        session: AsyncSession,
        orm: IssueORM,
        current_user_id: Optional[str] = None,
    ) -> Issue:
        """Convert ORM object to Pydantic model."""
        # Get display name
        display_name = None
        user_result = await session.execute(
            select(UserORM.display_name).where(UserORM.id == orm.user_id)
        )
        user_row = user_result.first()
        if user_row:
            display_name = user_row[0]

        # Check if current user liked
        liked_by_me = False
        if current_user_id:
            like_result = await session.execute(
                select(IssueLikeORM).where(
                    and_(
                        IssueLikeORM.issue_id == orm.id,
                        IssueLikeORM.user_id == current_user_id,
                    )
                )
            )
            liked_by_me = like_result.scalar_one_or_none() is not None

        return Issue(
            id=UUID(orm.id),
            user_id=orm.user_id,
            display_name=display_name,
            title=orm.title,
            content=orm.content,
            category=IssueCategory(orm.category),
            status=IssueStatus(orm.status),
            like_count=orm.like_count,
            liked_by_me=liked_by_me,
            admin_response=orm.admin_response,
            created_at=orm.created_at,
            updated_at=orm.updated_at,
        )

    async def create(self, user_id: str, issue: IssueCreate) -> Issue:
        """Create a new issue."""
        async with self._session_factory() as session:
            orm = IssueORM(
                id=str(uuid4()),
                user_id=user_id,
                title=issue.title,
                content=issue.content,
                category=issue.category.value,
                status=IssueStatus.OPEN.value,
                like_count=0,
            )
            session.add(orm)
            await session.commit()
            await session.refresh(orm)
            return await self._orm_to_model(session, orm, user_id)

    async def get(
        self, issue_id: UUID, current_user_id: Optional[str] = None
    ) -> Optional[Issue]:
        """Get an issue by ID."""
        async with self._session_factory() as session:
            result = await session.execute(
                select(IssueORM).where(IssueORM.id == str(issue_id))
            )
            orm = result.scalar_one_or_none()
            if not orm:
                return None
            return await self._orm_to_model(session, orm, current_user_id)

    async def list_all(
        self,
        current_user_id: Optional[str] = None,
        category: Optional[IssueCategory] = None,
        status: Optional[IssueStatus] = None,
        sort_by: str = "created_at",
        sort_order: str = "desc",
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[Issue], int]:
        """List all issues (shared across all users)."""
        async with self._session_factory() as session:
            # Base query
            query = select(IssueORM)
            count_query = select(func.count(IssueORM.id))

            # Apply filters
            if category:
                query = query.where(IssueORM.category == category.value)
                count_query = count_query.where(IssueORM.category == category.value)
            if status:
                query = query.where(IssueORM.status == status.value)
                count_query = count_query.where(IssueORM.status == status.value)

            # Get total count
            count_result = await session.execute(count_query)
            total = count_result.scalar() or 0

            # Apply sorting
            sort_column = getattr(IssueORM, sort_by, IssueORM.created_at)
            if sort_order == "desc":
                query = query.order_by(sort_column.desc())
            else:
                query = query.order_by(sort_column.asc())

            # Apply pagination
            query = query.limit(limit).offset(offset)

            result = await session.execute(query)
            issues = []
            for orm in result.scalars().all():
                issue = await self._orm_to_model(session, orm, current_user_id)
                issues.append(issue)

            return issues, total

    async def update(
        self, issue_id: UUID, user_id: str, update: IssueUpdate
    ) -> Issue:
        """Update an existing issue (by author only)."""
        async with self._session_factory() as session:
            result = await session.execute(
                select(IssueORM).where(IssueORM.id == str(issue_id))
            )
            orm = result.scalar_one_or_none()
            if not orm:
                raise NotFoundError(f"Issue {issue_id} not found")
            if orm.user_id != user_id:
                raise ForbiddenError("Only the author can update this issue")

            if update.title is not None:
                orm.title = update.title
            if update.content is not None:
                orm.content = update.content
            if update.category is not None:
                orm.category = update.category.value

            await session.commit()
            await session.refresh(orm)
            return await self._orm_to_model(session, orm, user_id)

    async def update_status(
        self, issue_id: UUID, update: IssueStatusUpdate
    ) -> Issue:
        """Update issue status (admin only)."""
        async with self._session_factory() as session:
            result = await session.execute(
                select(IssueORM).where(IssueORM.id == str(issue_id))
            )
            orm = result.scalar_one_or_none()
            if not orm:
                raise NotFoundError(f"Issue {issue_id} not found")

            orm.status = update.status.value
            if update.admin_response is not None:
                orm.admin_response = update.admin_response

            await session.commit()
            await session.refresh(orm)
            return await self._orm_to_model(session, orm)

    async def delete(self, issue_id: UUID, user_id: str) -> bool:
        """Delete an issue (by author only)."""
        async with self._session_factory() as session:
            result = await session.execute(
                select(IssueORM).where(IssueORM.id == str(issue_id))
            )
            orm = result.scalar_one_or_none()
            if not orm:
                return False
            if orm.user_id != user_id:
                raise ForbiddenError("Only the author can delete this issue")

            # Delete comments first
            comments_result = await session.execute(
                select(IssueCommentORM).where(IssueCommentORM.issue_id == str(issue_id))
            )
            for comment in comments_result.scalars().all():
                await session.delete(comment)

            # Delete likes
            likes_result = await session.execute(
                select(IssueLikeORM).where(IssueLikeORM.issue_id == str(issue_id))
            )
            for like in likes_result.scalars().all():
                await session.delete(like)

            await session.delete(orm)
            await session.commit()
            return True

    async def like(self, issue_id: UUID, user_id: str) -> Issue:
        """Add a like to an issue."""
        async with self._session_factory() as session:
            # Check issue exists
            result = await session.execute(
                select(IssueORM).where(IssueORM.id == str(issue_id))
            )
            orm = result.scalar_one_or_none()
            if not orm:
                raise NotFoundError(f"Issue {issue_id} not found")

            # Check if already liked
            like_result = await session.execute(
                select(IssueLikeORM).where(
                    and_(
                        IssueLikeORM.issue_id == str(issue_id),
                        IssueLikeORM.user_id == user_id,
                    )
                )
            )
            existing_like = like_result.scalar_one_or_none()
            if existing_like:
                # Already liked, return current state
                return await self._orm_to_model(session, orm, user_id)

            # Create like
            like_orm = IssueLikeORM(
                id=str(uuid4()),
                issue_id=str(issue_id),
                user_id=user_id,
            )
            session.add(like_orm)

            # Update count
            orm.like_count += 1

            await session.commit()
            await session.refresh(orm)
            return await self._orm_to_model(session, orm, user_id)

    async def unlike(self, issue_id: UUID, user_id: str) -> Issue:
        """Remove a like from an issue."""
        async with self._session_factory() as session:
            # Check issue exists
            result = await session.execute(
                select(IssueORM).where(IssueORM.id == str(issue_id))
            )
            orm = result.scalar_one_or_none()
            if not orm:
                raise NotFoundError(f"Issue {issue_id} not found")

            # Check if liked
            like_result = await session.execute(
                select(IssueLikeORM).where(
                    and_(
                        IssueLikeORM.issue_id == str(issue_id),
                        IssueLikeORM.user_id == user_id,
                    )
                )
            )
            existing_like = like_result.scalar_one_or_none()
            if not existing_like:
                # Not liked, return current state
                return await self._orm_to_model(session, orm, user_id)

            # Delete like
            await session.delete(existing_like)

            # Update count
            orm.like_count = max(0, orm.like_count - 1)

            await session.commit()
            await session.refresh(orm)
            return await self._orm_to_model(session, orm, user_id)

    async def search(
        self,
        query: str,
        current_user_id: Optional[str] = None,
        limit: int = 10,
    ) -> list[Issue]:
        """Search issues by title and content."""
        async with self._session_factory() as session:
            # Simple LIKE search
            search_pattern = f"%{query}%"
            result = await session.execute(
                select(IssueORM)
                .where(
                    (IssueORM.title.ilike(search_pattern))
                    | (IssueORM.content.ilike(search_pattern))
                )
                .order_by(IssueORM.like_count.desc())
                .limit(limit)
            )
            issues = []
            for orm in result.scalars().all():
                issue = await self._orm_to_model(session, orm, current_user_id)
                issues.append(issue)
            return issues

    async def _comment_orm_to_model(
        self, session: AsyncSession, orm: IssueCommentORM
    ) -> IssueComment:
        """Convert comment ORM to Pydantic model."""
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

    async def create_comment(
        self, issue_id: UUID, user_id: str, comment: IssueCommentCreate
    ) -> IssueComment:
        """Create a new comment on an issue."""
        async with self._session_factory() as session:
            # Check issue exists
            result = await session.execute(
                select(IssueORM).where(IssueORM.id == str(issue_id))
            )
            if not result.scalar_one_or_none():
                raise NotFoundError(f"Issue {issue_id} not found")

            orm = IssueCommentORM(
                id=str(uuid4()),
                issue_id=str(issue_id),
                user_id=user_id,
                content=comment.content,
            )
            session.add(orm)
            await session.commit()
            await session.refresh(orm)
            return await self._comment_orm_to_model(session, orm)

    async def list_comments(self, issue_id: UUID) -> list[IssueComment]:
        """List all comments for an issue."""
        async with self._session_factory() as session:
            result = await session.execute(
                select(IssueCommentORM)
                .where(IssueCommentORM.issue_id == str(issue_id))
                .order_by(IssueCommentORM.created_at.asc())
            )
            comments = []
            for orm in result.scalars().all():
                comment = await self._comment_orm_to_model(session, orm)
                comments.append(comment)
            return comments

    async def delete_comment(self, comment_id: UUID, user_id: str) -> bool:
        """Delete a comment (by author only)."""
        async with self._session_factory() as session:
            result = await session.execute(
                select(IssueCommentORM).where(IssueCommentORM.id == str(comment_id))
            )
            orm = result.scalar_one_or_none()
            if not orm:
                return False
            if orm.user_id != user_id:
                raise ForbiddenError("Only the author can delete this comment")
            await session.delete(orm)
            await session.commit()
            return True
