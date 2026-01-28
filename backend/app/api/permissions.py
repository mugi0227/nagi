from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException, status

from app.core.exceptions import ForbiddenError, NotFoundError
from app.api.deps import CurrentUser, ProjectMemberRepo, ProjectRepo
from app.models.enums import ProjectRole
from app.services.project_permissions import (
    ProjectAction,
    ProjectAccess,
    ensure_project_action,
    ensure_project_role,
    get_project_access,
)


async def require_project_member(
    user: CurrentUser,
    project_id: UUID,
    project_repo: ProjectRepo,
    member_repo: ProjectMemberRepo,
) -> ProjectAccess:
    try:
        return await get_project_access(user.id, project_id, project_repo, member_repo)
    except NotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    except ForbiddenError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc


async def require_project_role(
    user: CurrentUser,
    project_id: UUID,
    project_repo: ProjectRepo,
    member_repo: ProjectMemberRepo,
    allowed_roles: set[ProjectRole],
) -> ProjectAccess:
    access = await require_project_member(user, project_id, project_repo, member_repo)
    try:
        return ensure_project_role(access, allowed_roles)
    except ForbiddenError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc


async def require_project_action(
    user: CurrentUser,
    project_id: UUID,
    project_repo: ProjectRepo,
    member_repo: ProjectMemberRepo,
    action: ProjectAction,
) -> ProjectAccess:
    access = await require_project_member(user, project_id, project_repo, member_repo)
    try:
        return ensure_project_action(access, action)
    except ForbiddenError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc
