"""
Notifications API endpoints.

Endpoints for managing user notifications.
"""

from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.api.deps import CurrentUser, NotificationRepo
from app.models.notification import Notification

router = APIRouter()


# ===========================================
# Response Models
# ===========================================


class NotificationResponse(BaseModel):
    """Notification response model."""

    id: str
    user_id: str
    type: str
    title: str
    message: str
    link_type: Optional[str]
    link_id: Optional[str]
    project_id: Optional[str]
    project_name: Optional[str]
    is_read: bool
    read_at: Optional[datetime]
    created_at: datetime

    @classmethod
    def from_model(cls, notification: Notification) -> "NotificationResponse":
        return cls(
            id=str(notification.id),
            user_id=notification.user_id,
            type=notification.type.value,
            title=notification.title,
            message=notification.message,
            link_type=notification.link_type,
            link_id=notification.link_id,
            project_id=str(notification.project_id) if notification.project_id else None,
            project_name=notification.project_name,
            is_read=notification.is_read,
            read_at=notification.read_at,
            created_at=notification.created_at,
        )


class NotificationListResponse(BaseModel):
    """Response for listing notifications."""

    notifications: list[NotificationResponse]
    unread_count: int
    total: int


class UnreadCountResponse(BaseModel):
    """Response for unread count."""

    count: int


# ===========================================
# Endpoints
# ===========================================


@router.get("", response_model=NotificationListResponse)
async def list_notifications(
    user: CurrentUser,
    notification_repo: NotificationRepo,
    unread_only: bool = Query(False, description="Only return unread notifications"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """
    List notifications for the current user.
    """
    notifications = await notification_repo.list(
        user_id=user.id,
        unread_only=unread_only,
        limit=limit,
        offset=offset,
    )
    unread_count = await notification_repo.get_unread_count(user.id)

    return NotificationListResponse(
        notifications=[NotificationResponse.from_model(n) for n in notifications],
        unread_count=unread_count,
        total=len(notifications),
    )


@router.get("/unread-count", response_model=UnreadCountResponse)
async def get_unread_count(
    user: CurrentUser,
    notification_repo: NotificationRepo,
):
    """
    Get the count of unread notifications.
    """
    count = await notification_repo.get_unread_count(user.id)
    return UnreadCountResponse(count=count)


@router.get("/{notification_id}", response_model=NotificationResponse)
async def get_notification(
    notification_id: UUID,
    user: CurrentUser,
    notification_repo: NotificationRepo,
):
    """
    Get a specific notification.
    """
    notification = await notification_repo.get(user.id, notification_id)
    if not notification:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Notification {notification_id} not found",
        )
    return NotificationResponse.from_model(notification)


@router.post("/{notification_id}/read", response_model=NotificationResponse)
async def mark_as_read(
    notification_id: UUID,
    user: CurrentUser,
    notification_repo: NotificationRepo,
):
    """
    Mark a notification as read.
    """
    notification = await notification_repo.mark_as_read(user.id, notification_id)
    if not notification:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Notification {notification_id} not found",
        )
    return NotificationResponse.from_model(notification)


@router.post("/read-all", response_model=dict)
async def mark_all_as_read(
    user: CurrentUser,
    notification_repo: NotificationRepo,
):
    """
    Mark all notifications as read.
    """
    count = await notification_repo.mark_all_as_read(user.id)
    return {"updated_count": count}


@router.delete("/{notification_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_notification(
    notification_id: UUID,
    user: CurrentUser,
    notification_repo: NotificationRepo,
):
    """
    Delete a notification.
    """
    deleted = await notification_repo.delete(user.id, notification_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Notification {notification_id} not found",
        )
