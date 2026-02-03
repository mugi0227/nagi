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

from app.api.deps import CurrentUser, IssueRepo, LLMProvider
from app.core.config import get_settings
from app.core.exceptions import NotFoundError, ForbiddenError
from app.models.issue import (
    Issue,
    IssueCreate,
    IssueUpdate,
    IssueStatusUpdate,
    IssueListResponse,
    IssueComment,
    IssueCommentCreate,
)
from app.models.enums import IssueCategory, IssueStatus
from app.services.issue_chat_service import IssueChatService

router = APIRouter()


def _is_developer(user_id: str) -> bool:
    """Check if the user is a developer account."""
    settings = get_settings()
    return user_id in settings.developer_user_ids


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
):
    """Create a new issue."""
    return await repo.create(user.id, issue)


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
):
    """Update an existing issue (by author only)."""
    try:
        return await repo.update(issue_id, user.id, update)
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
):
    """Update issue status (developer accounts only)."""
    if not _is_developer(user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only developer accounts can change issue status",
        )
    try:
        return await repo.update_status(issue_id, update)
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
):
    """Add a like to an issue."""
    try:
        return await repo.like(issue_id, user.id)
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


@router.get("/{issue_id}/comments", response_model=list[IssueComment])
async def list_issue_comments(
    issue_id: UUID,
    user: CurrentUser,
    repo: IssueRepo,
):
    """List comments for an issue."""
    return await repo.list_comments(issue_id)


@router.post(
    "/{issue_id}/comments",
    response_model=IssueComment,
    status_code=status.HTTP_201_CREATED,
)
async def create_issue_comment(
    issue_id: UUID,
    comment: IssueCommentCreate,
    user: CurrentUser,
    repo: IssueRepo,
):
    """Create a comment on an issue (any user)."""
    try:
        return await repo.create_comment(issue_id, user.id, comment)
    except NotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )


@router.delete(
    "/{issue_id}/comments/{comment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_issue_comment(
    issue_id: UUID,
    comment_id: UUID,
    user: CurrentUser,
    repo: IssueRepo,
):
    """Delete a comment (by author only)."""
    try:
        deleted = await repo.delete_comment(comment_id, user.id)
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
