"""
Meeting agenda related agent tools.

Tools for managing meeting agendas.
"""

from __future__ import annotations

from typing import Optional
from uuid import UUID
from datetime import date

from google.adk.tools import FunctionTool
from pydantic import BaseModel, Field

from app.interfaces.meeting_agenda_repository import IMeetingAgendaRepository
from app.interfaces.project_member_repository import IProjectMemberRepository
from app.interfaces.project_repository import IProjectRepository
from app.interfaces.proposal_repository import IProposalRepository
from app.interfaces.recurring_meeting_repository import IRecurringMeetingRepository
from app.interfaces.task_repository import ITaskRepository
from app.models.meeting_agenda import MeetingAgendaItemCreate, MeetingAgendaItemUpdate
from app.services.project_permissions import ProjectAction
from app.tools.approval_tools import create_tool_action_proposal
from app.tools.permissions import require_project_action


class AddAgendaItemInput(BaseModel):
    """Input for add_agenda_item tool."""

    meeting_id: Optional[str] = Field(None, description="会議ID（RecurringMeetingのUUID、meeting_idかtask_idどちらか必須）")
    task_id: Optional[str] = Field(None, description="単発会議タスクID（meeting_idかtask_idどちらか必須）")
    title: str = Field(..., description="議題タイトル")
    description: Optional[str] = Field(None, description="議題の詳細説明")
    duration_minutes: Optional[int] = Field(None, description="割り当て時間（分）")
    order_index: int = Field(0, description="表示順序（デフォルト: 0）")
    event_date: Optional[date] = Field(None, description="開催日 (YYYY-MM-DD)")


class UpdateAgendaItemInput(BaseModel):
    """Input for update_agenda_item tool."""

    agenda_item_id: str = Field(..., description="アジェンダ項目ID（UUID）")
    title: Optional[str] = Field(None, description="議題タイトル")
    description: Optional[str] = Field(None, description="議題の詳細説明")
    duration_minutes: Optional[int] = Field(None, description="割り当て時間（分）")
    order_index: Optional[int] = Field(None, description="表示順序")
    is_completed: Optional[bool] = Field(None, description="完了フラグ")
    event_date: Optional[date] = Field(None, description="開催日 (YYYY-MM-DD)")


class DeleteAgendaItemInput(BaseModel):
    """Input for delete_agenda_item tool."""

    agenda_item_id: str = Field(..., description="アジェンダ項目ID（UUID）")


class ListAgendaItemsInput(BaseModel):
    """Input for list_agenda_items tool."""

    meeting_id: Optional[str] = Field(None, description="会議ID（RecurringMeetingのUUID、meeting_idかtask_idどちらか必須）")
    task_id: Optional[str] = Field(None, description="単発会議タスクID（meeting_idかtask_idどちらか必須）")
    event_date: Optional[date] = Field(None, description="開催日 (YYYY-MM-DD) 指定しない場合は全て")


class ReorderAgendaItemsInput(BaseModel):
    """Input for reorder_agenda_items tool."""

    meeting_id: Optional[str] = Field(None, description="会議ID（RecurringMeetingのUUID、meeting_idかtask_idどちらか必須）")
    task_id: Optional[str] = Field(None, description="単発会議タスクID（meeting_idかtask_idどちらか必須）")
    ordered_ids: list[str] = Field(..., description="並び替え後のアジェンダ項目ID一覧（順序通り）")


async def _resolve_owner_id(
    user_id: str,
    meeting_id: Optional[UUID],
    task_id: Optional[UUID],
    project_repo: Optional[IProjectRepository] = None,
    member_repo: Optional[IProjectMemberRepository] = None,
    recurring_meeting_repo: Optional[IRecurringMeetingRepository] = None,
    task_repo: Optional[ITaskRepository] = None,
) -> tuple[Optional[str], Optional[str]]:
    if meeting_id:
        if not project_repo or not recurring_meeting_repo or not member_repo:
            return user_id, None
        meeting = await recurring_meeting_repo.get(user_id, meeting_id)
        if meeting:
            if meeting.project_id:
                access = await require_project_action(
                    user_id,
                    meeting.project_id,
                    project_repo,
                    member_repo,
                    ProjectAction.MEETING_AGENDA_MANAGE,
                )
                if isinstance(access, dict):
                    return None, access["error"]
                return access.owner_id, None
            return user_id, None

        projects = await project_repo.list(user_id, limit=1000)
        for project in projects:
            meeting = await recurring_meeting_repo.get(user_id, meeting_id, project_id=project.id)
            if meeting:
                access = await require_project_action(
                    user_id,
                    project.id,
                    project_repo,
                    member_repo,
                    ProjectAction.MEETING_AGENDA_MANAGE,
                )
                if isinstance(access, dict):
                    return None, access["error"]
                return access.owner_id, None
        return None, "Meeting not found"

    if task_id:
        if not project_repo or not task_repo or not member_repo:
            return user_id, None
        task = await task_repo.get(user_id, task_id)
        if task:
            if task.project_id:
                access = await require_project_action(
                    user_id,
                    task.project_id,
                    project_repo,
                    member_repo,
                    ProjectAction.MEETING_AGENDA_MANAGE,
                )
                if isinstance(access, dict):
                    return None, access["error"]
                return access.owner_id, None
            return user_id, None

        projects = await project_repo.list(user_id, limit=1000)
        for project in projects:
            task = await task_repo.get(user_id, task_id, project_id=project.id)
            if task:
                access = await require_project_action(
                    user_id,
                    project.id,
                    project_repo,
                    member_repo,
                    ProjectAction.MEETING_AGENDA_MANAGE,
                )
                if isinstance(access, dict):
                    return None, access["error"]
                return access.owner_id, None
        return None, "Task not found"

    return user_id, None


async def add_agenda_item(
    user_id: str,
    repo: IMeetingAgendaRepository,
    input_data: AddAgendaItemInput,
    project_repo: Optional[IProjectRepository] = None,
    member_repo: Optional[IProjectMemberRepository] = None,
    recurring_meeting_repo: Optional[IRecurringMeetingRepository] = None,
    task_repo: Optional[ITaskRepository] = None,
) -> dict:
    """Add a new agenda item to a meeting or standalone meeting task."""
    # Validate: either meeting_id or task_id must be provided
    if not input_data.meeting_id and not input_data.task_id:
        return {"error": "Either meeting_id or task_id must be provided"}

    meeting_id = None
    task_id = None

    if input_data.meeting_id:
        try:
            meeting_id = UUID(input_data.meeting_id)
        except ValueError:
            return {"error": f"Invalid meeting ID format: {input_data.meeting_id}"}

    if input_data.task_id:
        try:
            task_id = UUID(input_data.task_id)
        except ValueError:
            return {"error": f"Invalid task ID format: {input_data.task_id}"}

    create_data = MeetingAgendaItemCreate(
        title=input_data.title,
        description=input_data.description,
        duration_minutes=input_data.duration_minutes,
        order_index=input_data.order_index,
        event_date=input_data.event_date,
        task_id=task_id,
    )

    owner_id, error = await _resolve_owner_id(
        user_id,
        meeting_id,
        task_id,
        project_repo=project_repo,
        member_repo=member_repo,
        recurring_meeting_repo=recurring_meeting_repo,
        task_repo=task_repo,
    )
    if error:
        return {"error": error}
    agenda_item = await repo.create(owner_id or user_id, meeting_id, create_data)
    return agenda_item.model_dump(mode="json")


def add_agenda_item_tool(
    repo: IMeetingAgendaRepository,
    project_repo: Optional[IProjectRepository],
    member_repo: Optional[IProjectMemberRepository],
    recurring_meeting_repo: Optional[IRecurringMeetingRepository],
    task_repo: Optional[ITaskRepository],
    user_id: str,
    proposal_repo: Optional[IProposalRepository] = None,
    session_id: Optional[str] = None,
    auto_approve: bool = True,
) -> FunctionTool:
    """Create ADK tool for adding agenda items."""

    async def _tool(input_data: dict) -> dict:
        """add_agenda_item: 会議にアジェンダ項目を追加します。

        IMPORTANT: すべての会議（定例・単発）は実際の開催インスタンスとしてTask（is_fixed_time=true）で管理されています。
        基本的には task_id を使用してください。meeting_id は RecurringMeeting のテンプレート情報が必要な場合のみ使用します。

        Parameters:
            task_id (str, optional): 会議タスクID（推奨、ほとんどの場合これを使用）
            meeting_id (str, optional): RecurringMeetingのUUID（定例会議のテンプレート情報が必要な場合のみ）
            title (str): 議題タイトル（必須）
            description (str, optional): 議題の詳細説明
            duration_minutes (int, optional): 割り当て時間（分）
            order_index (int, optional): 表示順序（デフォルト: 0）
            event_date (str, optional): 開催日 (YYYY-MM-DD)

        Returns:
            dict: 作成されたアジェンダ項目の情報

        Usage:
            - 会議タスクが特定されている場合: task_id を指定
            - 定例会議のテンプレート編集の場合: meeting_id を指定
        """
        payload = dict(input_data)
        proposal_desc = payload.pop("proposal_description", "")
        if proposal_repo and session_id and not auto_approve:
            return await create_tool_action_proposal(
                user_id,
                session_id,
                proposal_repo,
                "add_agenda_item",
                payload,
                proposal_desc,
            )
        return await add_agenda_item(
            user_id,
            repo,
            AddAgendaItemInput(**payload),
            project_repo=project_repo,
            member_repo=member_repo,
            recurring_meeting_repo=recurring_meeting_repo,
            task_repo=task_repo,
        )

    _tool.__name__ = "add_agenda_item"
    return FunctionTool(func=_tool)


async def update_agenda_item(
    user_id: str,
    repo: IMeetingAgendaRepository,
    input_data: UpdateAgendaItemInput,
    project_repo: Optional[IProjectRepository] = None,
    member_repo: Optional[IProjectMemberRepository] = None,
    recurring_meeting_repo: Optional[IRecurringMeetingRepository] = None,
    task_repo: Optional[ITaskRepository] = None,
) -> dict:
    """Update an existing agenda item."""
    try:
        agenda_item_id = UUID(input_data.agenda_item_id)
    except ValueError:
        return {"error": f"Invalid agenda item ID format: {input_data.agenda_item_id}"}

    agenda_item = await repo.get_by_id(agenda_item_id)
    if not agenda_item:
        return {"error": f"Agenda item not found: {input_data.agenda_item_id}"}

    owner_id = user_id
    if agenda_item.meeting_id or agenda_item.task_id:
        owner_id, error = await _resolve_owner_id(
            user_id,
            agenda_item.meeting_id,
            agenda_item.task_id,
            project_repo=project_repo,
            member_repo=member_repo,
            recurring_meeting_repo=recurring_meeting_repo,
            task_repo=task_repo,
        )
        if error:
            return {"error": error}

    update_data = MeetingAgendaItemUpdate(
        title=input_data.title,
        description=input_data.description,
        duration_minutes=input_data.duration_minutes,
        order_index=input_data.order_index,
        is_completed=input_data.is_completed,
        event_date=input_data.event_date,
    )

    agenda_item = await repo.update(owner_id, agenda_item_id, update_data)
    return agenda_item.model_dump(mode="json")


def update_agenda_item_tool(
    repo: IMeetingAgendaRepository,
    project_repo: Optional[IProjectRepository],
    member_repo: Optional[IProjectMemberRepository],
    recurring_meeting_repo: Optional[IRecurringMeetingRepository],
    task_repo: Optional[ITaskRepository],
    user_id: str,
    proposal_repo: Optional[IProposalRepository] = None,
    session_id: Optional[str] = None,
    auto_approve: bool = True,
) -> FunctionTool:
    """Create ADK tool for updating agenda items."""

    async def _tool(input_data: dict) -> dict:
        """update_agenda_item: アジェンダ項目を更新します。

        Parameters:
            agenda_item_id (str): アジェンダ項目ID（UUID、必須）
            title (str, optional): 議題タイトル
            description (str, optional): 議題の詳細説明
            duration_minutes (int, optional): 割り当て時間（分）
            order_index (int, optional): 表示順序
            is_completed (bool, optional): 完了フラグ
            event_date (str, optional): 開催日 (YYYY-MM-DD)

        Returns:
            dict: 更新されたアジェンダ項目の情報
        """
        payload = dict(input_data)
        proposal_desc = payload.pop("proposal_description", "")
        if proposal_repo and session_id and not auto_approve:
            return await create_tool_action_proposal(
                user_id,
                session_id,
                proposal_repo,
                "update_agenda_item",
                payload,
                proposal_desc,
            )
        return await update_agenda_item(
            user_id,
            repo,
            UpdateAgendaItemInput(**payload),
            project_repo=project_repo,
            member_repo=member_repo,
            recurring_meeting_repo=recurring_meeting_repo,
            task_repo=task_repo,
        )

    _tool.__name__ = "update_agenda_item"
    return FunctionTool(func=_tool)


async def delete_agenda_item(
    user_id: str,
    repo: IMeetingAgendaRepository,
    input_data: DeleteAgendaItemInput,
    project_repo: Optional[IProjectRepository] = None,
    member_repo: Optional[IProjectMemberRepository] = None,
    recurring_meeting_repo: Optional[IRecurringMeetingRepository] = None,
    task_repo: Optional[ITaskRepository] = None,
) -> dict:
    """Delete an agenda item."""
    try:
        agenda_item_id = UUID(input_data.agenda_item_id)
    except ValueError:
        return {"error": f"Invalid agenda item ID format: {input_data.agenda_item_id}"}

    agenda_item = await repo.get_by_id(agenda_item_id)
    if not agenda_item:
        return {"error": f"Agenda item not found: {input_data.agenda_item_id}"}

    owner_id = user_id
    if agenda_item.meeting_id or agenda_item.task_id:
        owner_id, error = await _resolve_owner_id(
            user_id,
            agenda_item.meeting_id,
            agenda_item.task_id,
            project_repo=project_repo,
            member_repo=member_repo,
            recurring_meeting_repo=recurring_meeting_repo,
            task_repo=task_repo,
        )
        if error:
            return {"error": error}

    success = await repo.delete(owner_id, agenda_item_id)
    return {"success": success, "deleted_id": input_data.agenda_item_id}


def delete_agenda_item_tool(
    repo: IMeetingAgendaRepository,
    project_repo: Optional[IProjectRepository],
    member_repo: Optional[IProjectMemberRepository],
    recurring_meeting_repo: Optional[IRecurringMeetingRepository],
    task_repo: Optional[ITaskRepository],
    user_id: str,
    proposal_repo: Optional[IProposalRepository] = None,
    session_id: Optional[str] = None,
    auto_approve: bool = True,
) -> FunctionTool:
    """Create ADK tool for deleting agenda items."""

    async def _tool(input_data: dict) -> dict:
        """delete_agenda_item: アジェンダ項目を削除します。

        Parameters:
            agenda_item_id (str): アジェンダ項目ID（UUID、必須）

        Returns:
            dict: success (bool), deleted_id (str)
        """
        payload = dict(input_data)
        proposal_desc = payload.pop("proposal_description", "")
        if proposal_repo and session_id and not auto_approve:
            return await create_tool_action_proposal(
                user_id,
                session_id,
                proposal_repo,
                "delete_agenda_item",
                payload,
                proposal_desc,
            )
        return await delete_agenda_item(
            user_id,
            repo,
            DeleteAgendaItemInput(**payload),
            project_repo=project_repo,
            member_repo=member_repo,
            recurring_meeting_repo=recurring_meeting_repo,
            task_repo=task_repo,
        )

    _tool.__name__ = "delete_agenda_item"
    return FunctionTool(func=_tool)


async def list_agenda_items(
    user_id: str,
    repo: IMeetingAgendaRepository,
    input_data: ListAgendaItemsInput,
    project_repo: Optional[IProjectRepository] = None,
    member_repo: Optional[IProjectMemberRepository] = None,
    recurring_meeting_repo: Optional[IRecurringMeetingRepository] = None,
    task_repo: Optional[ITaskRepository] = None,
) -> dict:
    """List all agenda items for a meeting or standalone meeting task."""
    # Validate: either meeting_id or task_id must be provided
    if not input_data.meeting_id and not input_data.task_id:
        return {"error": "Either meeting_id or task_id must be provided"}

    items = []

    if input_data.meeting_id:
        try:
            meeting_id = UUID(input_data.meeting_id)
        except ValueError:
            return {"error": f"Invalid meeting ID format: {input_data.meeting_id}"}
        owner_id, error = await _resolve_owner_id(
            user_id,
            meeting_id,
            None,
            project_repo=project_repo,
            member_repo=member_repo,
            recurring_meeting_repo=recurring_meeting_repo,
        )
        if error:
            return {"error": error}
        items = await repo.list_by_meeting(owner_id or user_id, meeting_id, event_date=input_data.event_date)
    elif input_data.task_id:
        try:
            task_id = UUID(input_data.task_id)
        except ValueError:
            return {"error": f"Invalid task ID format: {input_data.task_id}"}
        owner_id, error = await _resolve_owner_id(
            user_id,
            None,
            task_id,
            project_repo=project_repo,
            member_repo=member_repo,
            task_repo=task_repo,
        )
        if error:
            return {"error": error}
        items = await repo.list_by_task(owner_id or user_id, task_id)

    return {
        "agenda_items": [item.model_dump(mode="json") for item in items],
        "count": len(items),
    }


def list_agenda_items_tool(
    repo: IMeetingAgendaRepository,
    project_repo: Optional[IProjectRepository],
    member_repo: Optional[IProjectMemberRepository],
    recurring_meeting_repo: Optional[IRecurringMeetingRepository],
    task_repo: Optional[ITaskRepository],
    user_id: str,
) -> FunctionTool:
    """Create ADK tool for listing agenda items."""

    async def _tool(input_data: dict) -> dict:
        """list_agenda_items: 会議のアジェンダ項目一覧を取得します。

        IMPORTANT: すべての会議は Task として管理されています。基本的には task_id を使用してください。

        Parameters:
            task_id (str, optional): 会議タスクID（推奨、ほとんどの場合これを使用）
            meeting_id (str, optional): RecurringMeetingのUUID（定例会議のテンプレート情報が必要な場合のみ）
            event_date (str, optional): 開催日 (YYYY-MM-DD)。指定しない場合は全て。

        Returns:
            dict: agenda_items (list), count (int)
        """
        return await list_agenda_items(
            user_id,
            repo,
            ListAgendaItemsInput(**input_data),
            project_repo=project_repo,
            member_repo=member_repo,
            recurring_meeting_repo=recurring_meeting_repo,
            task_repo=task_repo,
        )

    _tool.__name__ = "list_agenda_items"
    return FunctionTool(func=_tool)


async def reorder_agenda_items(
    user_id: str,
    repo: IMeetingAgendaRepository,
    input_data: ReorderAgendaItemsInput,
    project_repo: Optional[IProjectRepository] = None,
    member_repo: Optional[IProjectMemberRepository] = None,
    recurring_meeting_repo: Optional[IRecurringMeetingRepository] = None,
    task_repo: Optional[ITaskRepository] = None,
) -> dict:
    """Reorder agenda items."""
    if not input_data.meeting_id and not input_data.task_id:
        return {"error": "Either meeting_id or task_id must be provided"}

    meeting_id = None
    task_id = None

    try:
        if input_data.meeting_id:
            meeting_id = UUID(input_data.meeting_id)
        if input_data.task_id:
            task_id = UUID(input_data.task_id)
        ordered_ids = [UUID(id_str) for id_str in input_data.ordered_ids]
    except ValueError as e:
        return {"error": f"Invalid ID format: {e}"}

    owner_id, error = await _resolve_owner_id(
        user_id,
        meeting_id,
        task_id,
        project_repo=project_repo,
        member_repo=member_repo,
        recurring_meeting_repo=recurring_meeting_repo,
        task_repo=task_repo,
    )
    if error:
        return {"error": error}
    items = await repo.reorder(owner_id or user_id, ordered_ids, meeting_id=meeting_id, task_id=task_id)
    return {
        "agenda_items": [item.model_dump(mode="json") for item in items],
        "count": len(items),
    }


def reorder_agenda_items_tool(
    repo: IMeetingAgendaRepository,
    project_repo: Optional[IProjectRepository],
    member_repo: Optional[IProjectMemberRepository],
    recurring_meeting_repo: Optional[IRecurringMeetingRepository],
    task_repo: Optional[ITaskRepository],
    user_id: str,
    proposal_repo: Optional[IProposalRepository] = None,
    session_id: Optional[str] = None,
    auto_approve: bool = True,
) -> FunctionTool:
    """Create ADK tool for reordering agenda items."""

    async def _tool(input_data: dict) -> dict:
        """reorder_agenda_items: アジェンダ項目の順序を変更します。

        IMPORTANT: すべての会議は Task として管理されています。基本的には task_id を使用してください。

        Parameters:
            task_id (str, optional): 会議タスクID（推奨、ほとんどの場合これを使用）
            meeting_id (str, optional): RecurringMeetingのUUID（定例会議のテンプレート情報が必要な場合のみ）
            ordered_ids (list[str]): 並び替え後のアジェンダ項目ID一覧（順序通り、必須）

        Returns:
            dict: agenda_items (list), count (int)
        """
        payload = dict(input_data)
        proposal_desc = payload.pop("proposal_description", "")
        if proposal_repo and session_id and not auto_approve:
            return await create_tool_action_proposal(
                user_id,
                session_id,
                proposal_repo,
                "reorder_agenda_items",
                payload,
                proposal_desc,
            )
        return await reorder_agenda_items(
            user_id,
            repo,
            ReorderAgendaItemsInput(**payload),
            project_repo=project_repo,
            member_repo=member_repo,
            recurring_meeting_repo=recurring_meeting_repo,
            task_repo=task_repo,
        )

    _tool.__name__ = "reorder_agenda_items"
    return FunctionTool(func=_tool)
