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
from app.models.meeting_agenda import MeetingAgendaItemCreate, MeetingAgendaItemUpdate


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


async def add_agenda_item(
    user_id: str,
    repo: IMeetingAgendaRepository,
    input_data: AddAgendaItemInput,
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

    agenda_item = await repo.create(user_id, meeting_id, create_data)
    return agenda_item.model_dump(mode="json")


def add_agenda_item_tool(
    repo: IMeetingAgendaRepository,
    user_id: str,
) -> FunctionTool:
    """Create ADK tool for adding agenda items."""

    async def _tool(input_data: dict) -> dict:
        """add_agenda_item: 会議にアジェンダ項目を追加します。

        Parameters:
            meeting_id (str, optional): 会議ID（RecurringMeetingのUUID、meeting_idかtask_idどちらか必須）
            task_id (str, optional): 単発会議タスクID（meeting_idかtask_idどちらか必須）
            title (str): 議題タイトル（必須）
            description (str, optional): 議題の詳細説明
            duration_minutes (int, optional): 割り当て時間（分）
            order_index (int, optional): 表示順序（デフォルト: 0）
            event_date (str, optional): 開催日 (YYYY-MM-DD)

        Returns:
            dict: 作成されたアジェンダ項目の情報
        """
        return await add_agenda_item(user_id, repo, AddAgendaItemInput(**input_data))

    _tool.__name__ = "add_agenda_item"
    return FunctionTool(func=_tool)


async def update_agenda_item(
    user_id: str,
    repo: IMeetingAgendaRepository,
    input_data: UpdateAgendaItemInput,
) -> dict:
    """Update an existing agenda item."""
    try:
        agenda_item_id = UUID(input_data.agenda_item_id)
    except ValueError:
        return {"error": f"Invalid agenda item ID format: {input_data.agenda_item_id}"}

    update_data = MeetingAgendaItemUpdate(
        title=input_data.title,
        description=input_data.description,
        duration_minutes=input_data.duration_minutes,
        order_index=input_data.order_index,
        is_completed=input_data.is_completed,
        event_date=input_data.event_date,
    )

    agenda_item = await repo.update(user_id, agenda_item_id, update_data)
    return agenda_item.model_dump(mode="json")


def update_agenda_item_tool(
    repo: IMeetingAgendaRepository,
    user_id: str,
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
        return await update_agenda_item(user_id, repo, UpdateAgendaItemInput(**input_data))

    _tool.__name__ = "update_agenda_item"
    return FunctionTool(func=_tool)


async def delete_agenda_item(
    user_id: str,
    repo: IMeetingAgendaRepository,
    input_data: DeleteAgendaItemInput,
) -> dict:
    """Delete an agenda item."""
    try:
        agenda_item_id = UUID(input_data.agenda_item_id)
    except ValueError:
        return {"error": f"Invalid agenda item ID format: {input_data.agenda_item_id}"}

    success = await repo.delete(user_id, agenda_item_id)
    return {"success": success, "deleted_id": input_data.agenda_item_id}


def delete_agenda_item_tool(
    repo: IMeetingAgendaRepository,
    user_id: str,
) -> FunctionTool:
    """Create ADK tool for deleting agenda items."""

    async def _tool(input_data: dict) -> dict:
        """delete_agenda_item: アジェンダ項目を削除します。

        Parameters:
            agenda_item_id (str): アジェンダ項目ID（UUID、必須）

        Returns:
            dict: success (bool), deleted_id (str)
        """
        return await delete_agenda_item(user_id, repo, DeleteAgendaItemInput(**input_data))

    _tool.__name__ = "delete_agenda_item"
    return FunctionTool(func=_tool)


async def list_agenda_items(
    user_id: str,
    repo: IMeetingAgendaRepository,
    input_data: ListAgendaItemsInput,
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
        items = await repo.list_by_meeting(user_id, meeting_id, event_date=input_data.event_date)
    elif input_data.task_id:
        try:
            task_id = UUID(input_data.task_id)
        except ValueError:
            return {"error": f"Invalid task ID format: {input_data.task_id}"}
        items = await repo.list_by_task(user_id, task_id)

    return {
        "agenda_items": [item.model_dump(mode="json") for item in items],
        "count": len(items),
    }


def list_agenda_items_tool(
    repo: IMeetingAgendaRepository,
    user_id: str,
) -> FunctionTool:
    """Create ADK tool for listing agenda items."""

    async def _tool(input_data: dict) -> dict:
        """list_agenda_items: 会議のアジェンダ項目一覧を取得します。

        Parameters:
            meeting_id (str, optional): 会議ID（RecurringMeetingのUUID、meeting_idかtask_idどちらか必須）
            task_id (str, optional): 単発会議タスクID（meeting_idかtask_idどちらか必須）
            event_date (str, optional): 開催日 (YYYY-MM-DD)。指定しない場合は全て。

        Returns:
            dict: agenda_items (list), count (int)
        """
        return await list_agenda_items(user_id, repo, ListAgendaItemsInput(**input_data))

    _tool.__name__ = "list_agenda_items"
    return FunctionTool(func=_tool)


async def reorder_agenda_items(
    user_id: str,
    repo: IMeetingAgendaRepository,
    input_data: ReorderAgendaItemsInput,
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

    items = await repo.reorder(user_id, ordered_ids, meeting_id=meeting_id, task_id=task_id)
    return {
        "agenda_items": [item.model_dump(mode="json") for item in items],
        "count": len(items),
    }


def reorder_agenda_items_tool(
    repo: IMeetingAgendaRepository,
    user_id: str,
) -> FunctionTool:
    """Create ADK tool for reordering agenda items."""

    async def _tool(input_data: dict) -> dict:
        """reorder_agenda_items: アジェンダ項目の順序を変更します。

        Parameters:
            meeting_id (str, optional): 会議ID（RecurringMeetingのUUID、meeting_idかtask_idどちらか必須）
            task_id (str, optional): 単発会議タスクID（meeting_idかtask_idどちらか必須）
            ordered_ids (list[str]): 並び替え後のアジェンダ項目ID一覧（順序通り、必須）

        Returns:
            dict: agenda_items (list), count (int)
        """
        return await reorder_agenda_items(user_id, repo, ReorderAgendaItemsInput(**input_data))

    _tool.__name__ = "reorder_agenda_items"
    return FunctionTool(func=_tool)
