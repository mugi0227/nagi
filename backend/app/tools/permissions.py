from __future__ import annotations

from typing import Iterable
from uuid import UUID

from app.core.exceptions import ForbiddenError, NotFoundError
from app.interfaces.project_member_repository import IProjectMemberRepository
from app.interfaces.project_repository import IProjectRepository
from app.models.enums import ProjectRole
from app.services.project_permissions import (
    ProjectAccess,
    ProjectAction,
    ensure_project_action,
    ensure_project_role,
    get_project_access,
)


async def require_project_member(
    user_id: str,
    project_id: UUID,
    project_repo: IProjectRepository,
    member_repo: IProjectMemberRepository,
) -> ProjectAccess | dict:
    try:
        return await get_project_access(user_id, project_id, project_repo, member_repo)
    except (NotFoundError, ForbiddenError) as exc:
        return {"error": str(exc)}


async def require_project_role(
    user_id: str,
    project_id: UUID,
    project_repo: IProjectRepository,
    member_repo: IProjectMemberRepository,
    allowed_roles: Iterable[ProjectRole],
) -> ProjectAccess | dict:
    access = await require_project_member(user_id, project_id, project_repo, member_repo)
    if isinstance(access, dict):
        return access
    try:
        ensure_project_role(access, allowed_roles)
    except ForbiddenError as exc:
        return {"error": str(exc)}
    return access


async def require_project_action(
    user_id: str,
    project_id: UUID,
    project_repo: IProjectRepository,
    member_repo: IProjectMemberRepository,
    action: ProjectAction,
) -> ProjectAccess | dict:
    access = await require_project_member(user_id, project_id, project_repo, member_repo)
    if isinstance(access, dict):
        return access
    try:
        ensure_project_action(access, action)
    except ForbiddenError as exc:
        return {"error": str(exc)}
    return access
