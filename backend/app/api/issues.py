"""
Issues API endpoints.

Endpoints for managing feature requests, bug reports, and improvements.
Issues are shared across all users as a public feedback board.
"""

import json
from typing import AsyncGenerator, Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.api.deps import CurrentUser, IssueRepo, IssueCommentRepo, NotificationRepo, LLMProvider
from app.core.config import get_settings
from app.core.exceptions import NotFoundError, ForbiddenError
from app.models.issue import (
    Issue,
    IssueCreate,
    IssueUpdate,
    IssueStatusUpdate,
    IssueListResponse,
)
from app.models.issue_comment import (
    IssueComment,
    IssueCommentCreate,
    IssueCommentListResponse,
)
from app.models.enums import IssueCategory, IssueStatus
from app.services.issue_chat_service import IssueChatService
from app.services import notification_service as notify

router = APIRouter()

STATUS_LABELS: dict[str, str] = {
    "OPEN": "投稿済み",
    "UNDER_REVIEW": "検討中",
    "PLANNED": "対応予定",
    "IN_PROGRESS": "対応中",
    "COMPLETED": "完了",
    "WONT_FIX": "対応なし",
}


def _is_developer(email: str | None) -> bool:
    """Check if the user is a developer account by email."""
    if not email:
        return False
    settings = get_settings()
    return email.lower() in settings.developer_emails


# ============================================
# Issue Chat API
# ============================================


class IssueChatRequest(BaseModel):
    """Request for issue chat."""
    message: str
    session_id: Optional[str] = None


@router.post("/chat/stream")
async def issue_chat_stream(
    request: IssueChatRequest,
    user: CurrentUser,
    llm_provider: LLMProvider,
    issue_repo: IssueRepo,
):
    """
    Chat with the Issue Partner agent (streaming).

    This endpoint helps users articulate and submit feature requests,
    bug reports, and improvements through conversation.
    """
    service = IssueChatService(
        llm_provider=llm_provider,
        issue_repo=issue_repo,
    )

    async def event_generator() -> AsyncGenerator[str, None]:
        """Generate Server-Sent Events for streaming response."""
        try:
            async for chunk in service.process_chat_stream(
                user_id=user.id,
                message=request.message,
                session_id=request.session_id,
            ):
                yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"
        except Exception as e:
            error_chunk = {
                "chunk_type": "error",
                "content": str(e),
            }
            yield f"data: {json.dumps(error_chunk, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ============================================
# Issue CRUD API
# ============================================


@router.post("", response_model=Issue, status_code=status.HTTP_201_CREATED)
async def create_issue(
    issue: IssueCreate,
    user: CurrentUser,
    repo: IssueRepo,
    notification_repo: NotificationRepo,
):
    """Create a new issue."""
    result = await repo.create(user.id, issue)
    await notify.notify_issue_new(
        notification_repo, result.id, result.title, user.id,
    )
    return result


@router.get("", response_model=IssueListResponse)
async def list_issues(
    user: CurrentUser,
    repo: IssueRepo,
    category: Optional[IssueCategory] = Query(None, description="Filter by category"),
    issue_status: Optional[IssueStatus] = Query(
        None, alias="status", description="Filter by status"
    ),
    sort_by: str = Query("created_at", description="Sort field (created_at, like_count)"),
    sort_order: str = Query("desc", description="Sort order (asc, desc)"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """List all issues (shared across all users)."""
    items, total = await repo.list_all(
        current_user_id=user.id,
        category=category,
        status=issue_status,
        sort_by=sort_by,
        sort_order=sort_order,
        limit=limit,
        offset=offset,
    )
    return IssueListResponse(items=items, total=total)


@router.get("/search", response_model=list[Issue])
async def search_issues(
    user: CurrentUser,
    repo: IssueRepo,
    query: str = Query(..., min_length=1, description="Search query"),
    limit: int = Query(10, ge=1, le=50),
):
    """Search issues by title and content."""
    return await repo.search(query, current_user_id=user.id, limit=limit)


@router.get("/{issue_id}", response_model=Issue)
async def get_issue(
    issue_id: UUID,
    user: CurrentUser,
    repo: IssueRepo,
):
    """Get an issue by ID."""
    issue = await repo.get(issue_id, current_user_id=user.id)
    if not issue:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Issue {issue_id} not found",
        )
    return issue


@router.patch("/{issue_id}", response_model=Issue)
async def update_issue(
    issue_id: UUID,
    update: IssueUpdate,
    user: CurrentUser,
    repo: IssueRepo,
    notification_repo: NotificationRepo,
):
    """Update an existing issue (by author only)."""
    try:
        result = await repo.update(issue_id, user.id, update)
        await notify.notify_issue_edited(
            notification_repo, result.id, result.title, user.id,
        )
        return result
    except NotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )
    except ForbiddenError as e:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(e),
        )


@router.patch("/{issue_id}/status", response_model=Issue)
async def update_issue_status(
    issue_id: UUID,
    update: IssueStatusUpdate,
    user: CurrentUser,
    repo: IssueRepo,
    notification_repo: NotificationRepo,
):
    """Update issue status (developer accounts only)."""
    if not _is_developer(user.email):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only developer accounts can change issue status",
        )
    try:
        # Get issue first to know the poster
        issue = await repo.get(issue_id)
        if not issue:
            raise NotFoundError(f"Issue {issue_id} not found")

        result = await repo.update_status(issue_id, update)
        status_label = STATUS_LABELS.get(update.status.value, update.status.value)
        await notify.notify_issue_status_changed(
            notification_repo, result.id, result.title,
            issue.user_id, user.id, status_label,
        )
        return result
    except NotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )


@router.delete("/{issue_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_issue(
    issue_id: UUID,
    user: CurrentUser,
    repo: IssueRepo,
):
    """Delete an issue (by author only)."""
    try:
        deleted = await repo.delete(issue_id, user.id)
        if not deleted:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Issue {issue_id} not found",
            )
    except ForbiddenError as e:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(e),
        )


@router.post("/{issue_id}/like", response_model=Issue)
async def like_issue(
    issue_id: UUID,
    user: CurrentUser,
    repo: IssueRepo,
    notification_repo: NotificationRepo,
):
    """Add a like to an issue."""
    try:
        # Get issue before like to check prior state
        issue = await repo.get(issue_id, current_user_id=user.id)
        if not issue:
            raise NotFoundError(f"Issue {issue_id} not found")

        was_liked = issue.liked_by_me
        result = await repo.like(issue_id, user.id)

        # Only notify if this is a new like (not already liked)
        if not was_liked:
            await notify.notify_issue_liked(
                notification_repo, result.id, result.title,
                issue.user_id, user.id, user.display_name or "",
            )
        return result
    except NotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )


@router.delete("/{issue_id}/like", response_model=Issue)
async def unlike_issue(
    issue_id: UUID,
    user: CurrentUser,
    repo: IssueRepo,
):
    """Remove a like from an issue."""
    try:
        return await repo.unlike(issue_id, user.id)
    except NotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )


# ============================================
# Issue Comment API
# ============================================


@router.post(
    "/{issue_id}/comments",
    response_model=IssueComment,
    status_code=status.HTTP_201_CREATED,
)
async def create_comment(
    issue_id: UUID,
    comment: IssueCommentCreate,
    user: CurrentUser,
    issue_repo: IssueRepo,
    comment_repo: IssueCommentRepo,
    notification_repo: NotificationRepo,
):
    """Create a comment on an issue."""
    issue = await issue_repo.get(issue_id)
    if not issue:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Issue {issue_id} not found",
        )

    result = await comment_repo.create(issue_id, user.id, comment)
    await notify.notify_issue_commented(
        notification_repo, issue_id, issue.title,
        issue.user_id, user.id, user.display_name or "",
    )
    return result


@router.get("/{issue_id}/comments", response_model=IssueCommentListResponse)
async def list_comments(
    issue_id: UUID,
    user: CurrentUser,
    comment_repo: IssueCommentRepo,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """List comments for an issue."""
    comments, total = await comment_repo.list_by_issue(
        issue_id, limit=limit, offset=offset,
    )
    return IssueCommentListResponse(comments=comments, total=total)

@router.delete(
    "/{issue_id}/comments/{comment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_comment(
    issue_id: UUID,
    comment_id: UUID,
    user: CurrentUser,
    comment_repo: IssueCommentRepo,
):
    """Delete a comment (author only)."""
    try:
        deleted = await comment_repo.delete(comment_id, user.id)
        if not deleted:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Comment {comment_id} not found",
            )
    except ForbiddenError as e:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(e),
        )
