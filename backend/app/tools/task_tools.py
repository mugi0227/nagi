"""
Task-related agent tools.

Tools for creating, updating, deleting, and searching tasks.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

from google.adk.tools import FunctionTool
from pydantic import BaseModel, Field

from app.core.config import get_settings
from app.interfaces.llm_provider import ILLMProvider
from app.interfaces.memory_repository import IMemoryRepository
from app.interfaces.project_repository import IProjectRepository
from app.interfaces.proposal_repository import IProposalRepository
from app.interfaces.task_repository import ITaskRepository
from app.models.enums import CreatedBy, EnergyLevel, Priority
from app.models.proposal import Proposal, ProposalResponse, ProposalType
from app.models.task import Task, TaskCreate, TaskUpdate
from app.services.planner_service import PlannerService


# ===========================================
# Tool Input Models
# ===========================================


class CreateTaskInput(BaseModel):
    """Input for create_task tool."""

    title: str = Field(
        ...,
        description="タスクのタイトル",
        validation_alias="task_title",
        json_schema_extra={"examples": ["買い物リストを作る", "圏論の勉強"]}
    )
    description: Optional[str] = Field(None, description="タスクの詳細説明")
    project_id: Optional[str] = Field(None, description="プロジェクトID（UUID文字列）")
    importance: Priority = Field(Priority.MEDIUM, description="重要度 (HIGH/MEDIUM/LOW)")
    urgency: Priority = Field(Priority.MEDIUM, description="緊急度 (HIGH/MEDIUM/LOW)")
    energy_level: EnergyLevel = Field(
        EnergyLevel.LOW, description="必要エネルギー (HIGH=重い, LOW=軽い)"
    )
    estimated_minutes: Optional[int] = Field(None, ge=1, le=480, description="見積もり時間（分）")
    due_date: Optional[str] = Field(None, description="期限（ISO形式: YYYY-MM-DDTHH:MM:SS）")
    dependency_ids: list[str] = Field(
        default_factory=list,
        description="このタスクが依存する他のタスクのIDリスト（UUID文字列のリスト）"
    )
    # Meeting fields (optional, only for fixed-time events)
    is_fixed_time: bool = Field(False, description="会議・固定時間イベントの場合true")
    start_time: Optional[str] = Field(None, description="開始時刻（ISO形式、is_fixed_time=trueの場合必須）")
    end_time: Optional[str] = Field(None, description="終了時刻（ISO形式、is_fixed_time=trueの場合必須）")
    location: Optional[str] = Field(None, description="場所（会議用）")
    attendees: list[str] = Field(default_factory=list, description="参加者リスト（会議用）")
    meeting_notes: Optional[str] = Field(None, description="議事録・メモ（会議用）")

    model_config = {"populate_by_name": True}


class UpdateTaskInput(BaseModel):
    """Input for update_task tool."""

    task_id: str = Field(..., description="タスクID（UUID文字列）")
    title: Optional[str] = Field(None, description="タスクのタイトル")
    description: Optional[str] = Field(None, description="タスクの詳細説明")
    status: Optional[str] = Field(None, description="ステータス (TODO/IN_PROGRESS/WAITING/DONE)")
    importance: Optional[Priority] = Field(None, description="重要度")
    urgency: Optional[Priority] = Field(None, description="緊急度")
    energy_level: Optional[EnergyLevel] = Field(None, description="必要エネルギー")
    progress: Optional[int] = Field(None, ge=0, le=100, description="進捗率（0-100%）")
    # Meeting fields
    is_fixed_time: Optional[bool] = Field(None, description="会議・固定時間イベントの場合true")
    start_time: Optional[str] = Field(None, description="開始時刻（ISO形式）")
    end_time: Optional[str] = Field(None, description="終了時刻（ISO形式）")
    location: Optional[str] = Field(None, description="場所（会議用）")
    attendees: Optional[list[str]] = Field(None, description="参加者リスト（会議用）")
    meeting_notes: Optional[str] = Field(None, description="議事録・メモ（会議用）")


class DeleteTaskInput(BaseModel):
    """Input for delete_task tool."""

    task_id: str = Field(..., description="タスクID（UUID文字列）")


class SearchSimilarTasksInput(BaseModel):
    """Input for search_similar_tasks tool."""

    task_title: str = Field(
        ...,
        description="検索するタスクタイトル",
        json_schema_extra={"examples": ["買い物リストを作る", "圏論の勉強"]}
    )
    project_id: Optional[str] = Field(
        None,
        description="プロジェクトID（指定時はそのプロジェクト内のみ検索）"
    )


class CreateMeetingInput(BaseModel):
    """Input for create_meeting tool."""

    title: str = Field(..., description="会議タイトル")
    start_time: str = Field(..., description="開始時刻（ISO形式: YYYY-MM-DDTHH:MM）")
    end_time: str = Field(..., description="終了時刻（ISO形式: YYYY-MM-DDTHH:MM）")
    location: Optional[str] = Field(None, description="場所（オンライン/会議室名）")
    attendees: list[str] = Field(default_factory=list, description="参加者リスト")
    description: Optional[str] = Field(None, description="会議の目的・議題")
    meeting_notes: Optional[str] = Field(None, description="議事録・メモ")
    project_id: Optional[str] = Field(None, description="プロジェクトID（UUID文字列）")


class BreakdownTaskInput(BaseModel):
    """Input for breakdown_task tool."""

    task_id: str = Field(..., description="分解するタスクのID（UUID文字列、必須）")
    create_subtasks: bool = Field(
        True,
        description="サブタスクを自動作成するか（True: 作成する、False: ステップ案のみ返す）"
    )


class ListTasksInput(BaseModel):
    """Input for list_tasks tool."""

    project_id: Optional[str] = Field(
        None,
        description="プロジェクトID（指定時はそのプロジェクト内のみ取得）"
    )
    status_filter: Optional[list[str]] = Field(
        None,
        description="ステータスフィルタ（例: ['TODO', 'IN_PROGRESS']）。指定なしで全ステータス取得"
    )
    limit: int = Field(
        50,
        ge=1,
        le=100,
        description="取得件数上限（デフォルト: 50、最大: 100）"
    )


# ===========================================
# Tool Functions
# ===========================================


def _normalize_meeting_title(title: str) -> str:
    return " ".join(title.split()).casefold()


def _normalize_datetime(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def _within_minutes(left: datetime, right: datetime, minutes: int) -> bool:
    left_norm = _normalize_datetime(left)
    right_norm = _normalize_datetime(right)
    delta_seconds = abs((left_norm - right_norm).total_seconds())
    return delta_seconds <= minutes * 60


async def _find_existing_meeting(
    repo: ITaskRepository,
    user_id: str,
    start_time: datetime,
    end_time: datetime,
    title: str,
    project_id: UUID | None,
) -> Task | None:
    normalized = _normalize_meeting_title(title)
    tasks = await repo.list(user_id, project_id=project_id, include_done=True, limit=1000)
    for task in tasks:
        if not task.is_fixed_time or not task.start_time or not task.end_time:
            continue
        if not _within_minutes(task.start_time, start_time, 30):
            continue
        if not _within_minutes(task.end_time, end_time, 30):
            continue
        if _normalize_meeting_title(task.title) == normalized:
            return task
    return None


async def propose_task(
    user_id: str,
    session_id: str,
    proposal_repo: IProposalRepository,
    task_repo: ITaskRepository,
    input_data: CreateTaskInput,
    description: str = "",
    auto_approve: bool = False,
) -> dict:
    """
    Propose a task for user approval, or auto-approve if configured.

    Args:
        user_id: User ID
        session_id: Chat session ID
        proposal_repo: Proposal repository
        task_repo: Task repository (for auto-approval)
        input_data: Task creation data
        description: AI-generated description of why this task is being proposed
        auto_approve: If True, automatically approve and create the task

    Returns:
        If auto_approve=False: Proposal response with proposal_id
        If auto_approve=True: Created task info with task_id
    """
    # If no description provided, generate a simple one
    if not description:
        description = f"タスク「{input_data.title}」を作成します。"

    # Auto-approve mode: create task immediately
    if auto_approve:
        created_task = await create_task(
            user_id=user_id,
            repo=task_repo,
            input_data=input_data,
        )
        return {
            "auto_approved": True,
            "task_id": created_task.get("id"),
            "description": description,
        }

    # Proposal mode: create proposal and return for user approval
    # Try to parse user_id as UUID, fallback to generating a new one for dev mode
    user_id_raw = None
    try:
        parsed_user_id = UUID(user_id)
    except (ValueError, AttributeError):
        # For dev mode where user_id might be "dev_user", use a consistent UUID
        import hashlib
        user_id_raw = user_id
        parsed_user_id = UUID(bytes=hashlib.md5(user_id.encode()).digest())

    proposal = Proposal(
        user_id=parsed_user_id,
        user_id_raw=user_id_raw,
        session_id=session_id,
        proposal_type=ProposalType.CREATE_TASK,
        payload=input_data.model_dump(mode="json"),
        description=description,
    )

    created_proposal = await proposal_repo.create(proposal)

    return ProposalResponse(
        proposal_id=str(created_proposal.id),
        proposal_type=ProposalType.CREATE_TASK,
        description=description,
        payload=input_data.model_dump(mode="json"),
    ).model_dump(mode="json")


async def create_task(
    user_id: str,
    repo: ITaskRepository,
    input_data: CreateTaskInput,
) -> dict:
    """
    Create a new task.

    Args:
        user_id: User ID
        repo: Task repository
        input_data: Task creation data

    Returns:
        Created task as dict
    """
    # Parse project_id if provided
    project_id = UUID(input_data.project_id) if input_data.project_id else None

    # Parse due_date if provided
    due_date = None
    if input_data.due_date:
        try:
            due_date = datetime.fromisoformat(input_data.due_date.replace("Z", "+00:00"))
        except ValueError:
            pass  # Invalid date format, ignore

    # Parse dependency_ids if provided
    dependency_ids = []
    for dep_id_str in input_data.dependency_ids:
        try:
            dependency_ids.append(UUID(dep_id_str))
        except (ValueError, AttributeError):
            # Invalid UUID format, skip this dependency
            pass

    # Parse meeting times if is_fixed_time
    start_time = None
    end_time = None
    if input_data.is_fixed_time and input_data.start_time and input_data.end_time:
        try:
            start_time = datetime.fromisoformat(input_data.start_time.replace("Z", "+00:00"))
            end_time = datetime.fromisoformat(input_data.end_time.replace("Z", "+00:00"))
        except ValueError:
            pass  # Invalid date format, ignore

    if input_data.is_fixed_time and start_time and end_time:
        existing = await _find_existing_meeting(
            repo,
            user_id,
            start_time,
            end_time,
            input_data.title,
            project_id,
        )
        if existing:
            return existing.model_dump(mode="json")

    task_data = TaskCreate(
        title=input_data.title,
        description=input_data.description,
        project_id=project_id,
        importance=input_data.importance,
        urgency=input_data.urgency,
        energy_level=input_data.energy_level,
        estimated_minutes=input_data.estimated_minutes,
        due_date=due_date,
        dependency_ids=dependency_ids,
        created_by=CreatedBy.AGENT,
        # Meeting fields
        is_fixed_time=input_data.is_fixed_time,
        start_time=start_time,
        end_time=end_time,
        location=input_data.location,
        attendees=input_data.attendees,
        meeting_notes=input_data.meeting_notes,
    )

    task = await repo.create(user_id, task_data)
    return task.model_dump(mode="json")  # Serialize UUIDs to strings


async def update_task(
    user_id: str,
    repo: ITaskRepository,
    input_data: UpdateTaskInput,
) -> dict:
    """
    Update an existing task.

    Args:
        user_id: User ID
        repo: Task repository
        input_data: Task update data

    Returns:
        Updated task as dict
    """
    task_id = UUID(input_data.task_id)

    # Parse meeting times if provided
    start_time = None
    end_time = None
    if input_data.start_time and input_data.end_time:
        try:
            start_time = datetime.fromisoformat(input_data.start_time.replace("Z", "+00:00"))
            end_time = datetime.fromisoformat(input_data.end_time.replace("Z", "+00:00"))
        except ValueError:
            pass  # Invalid date format, ignore

    update_data = TaskUpdate(
        title=input_data.title,
        description=input_data.description,
        status=input_data.status,
        importance=input_data.importance,
        urgency=input_data.urgency,
        energy_level=input_data.energy_level,
        progress=input_data.progress,
        # Meeting fields
        is_fixed_time=input_data.is_fixed_time,
        start_time=start_time,
        end_time=end_time,
        location=input_data.location,
        attendees=input_data.attendees,
        meeting_notes=input_data.meeting_notes,
    )

    task = await repo.update(user_id, task_id, update_data)
    return task.model_dump(mode="json")  # Serialize UUIDs to strings


async def delete_task(
    user_id: str,
    repo: ITaskRepository,
    input_data: DeleteTaskInput,
) -> dict:
    """
    Delete a task.

    Args:
        user_id: User ID
        repo: Task repository
        input_data: Task deletion data

    Returns:
        Deletion result
    """
    task_id = UUID(input_data.task_id)
    deleted = await repo.delete(user_id, task_id)

    return {
        "success": deleted,
        "task_id": input_data.task_id,
        "message": "Task deleted successfully" if deleted else "Task not found",
    }


async def list_tasks(
    user_id: str,
    repo: ITaskRepository,
    input_data: ListTasksInput,
) -> dict:
    """
    List tasks with optional filters.

    Args:
        user_id: User ID
        repo: Task repository
        input_data: List parameters

    Returns:
        List of tasks matching the filters
    """
    # Parse project_id if provided
    project_id = None
    if input_data.project_id and input_data.project_id.strip():
        try:
            project_id = UUID(input_data.project_id)
        except (ValueError, AttributeError):
            # Invalid UUID format, ignore
            pass

    # Get tasks - we'll filter by status in Python since repo.list doesn't support multiple statuses
    all_tasks = await repo.list(
        user_id,
        project_id=project_id,
        parent_id=None,  # Only root tasks (not subtasks)
    )

    # Filter by status if specified
    if input_data.status_filter:
        status_set = set(s.upper() for s in input_data.status_filter)
        filtered_tasks = [t for t in all_tasks if t.status.value in status_set]
    else:
        filtered_tasks = all_tasks

    # Apply limit
    limited_tasks = filtered_tasks[:input_data.limit]

    return {
        "tasks": [task.model_dump(mode="json") for task in limited_tasks],
        "count": len(limited_tasks),
        "total_matching": len(filtered_tasks),
    }


async def create_meeting(
    user_id: str,
    repo: ITaskRepository,
    input_data: CreateMeetingInput,
) -> dict:
    """
    Create a meeting task with fixed time.

    Args:
        user_id: User ID
        repo: Task repository
        input_data: Meeting creation data

    Returns:
        Created meeting task as dict
    """
    # Parse timestamps
    start_dt = datetime.fromisoformat(input_data.start_time.replace("Z", "+00:00"))
    end_dt = datetime.fromisoformat(input_data.end_time.replace("Z", "+00:00"))

    # Validate time range
    if end_dt <= start_dt:
        raise ValueError("終了時刻は開始時刻より後である必要があります")

    # Calculate duration
    duration_minutes = int((end_dt - start_dt).total_seconds() / 60)

    # Parse project_id if provided
    project_id = UUID(input_data.project_id) if input_data.project_id else None

    existing = await _find_existing_meeting(
        repo,
        user_id,
        start_dt,
        end_dt,
        input_data.title,
        project_id,
    )
    if existing:
        return existing.model_dump(mode="json")

    task_data = TaskCreate(
        title=input_data.title,
        description=input_data.description,
        start_time=start_dt,
        end_time=end_dt,
        is_fixed_time=True,
        estimated_minutes=duration_minutes,
        location=input_data.location,
        attendees=input_data.attendees,
        meeting_notes=input_data.meeting_notes,
        project_id=project_id,
        importance=Priority.HIGH,  # 会議は重要度HIGH（変更不可）
        urgency=Priority.HIGH,      # 緊急度HIGH（リスケ不可）
        energy_level=EnergyLevel.LOW,  # 受動的参加
        created_by=CreatedBy.AGENT,
    )

    task = await repo.create(user_id, task_data)
    return task.model_dump(mode="json")


async def search_similar_tasks(
    user_id: str,
    repo: ITaskRepository,
    input_data: SearchSimilarTasksInput,
) -> dict:
    """
    Search for similar tasks to avoid duplicates.

    Args:
        user_id: User ID
        repo: Task repository
        input_data: Search parameters

    Returns:
        List of similar tasks with similarity scores
    """
    settings = get_settings()

    # Parse project_id safely - only if it's a valid UUID string
    project_id = None
    if input_data.project_id and input_data.project_id.strip():
        try:
            project_id = UUID(input_data.project_id)
        except (ValueError, AttributeError):
            # Invalid UUID format, ignore and search all projects
            pass

    similar = await repo.find_similar(
        user_id,
        title=input_data.task_title,
        project_id=project_id,
        threshold=settings.SIMILARITY_THRESHOLD,
        limit=5,
    )

    return {
        "similar_tasks": [
            {
                "task": task.task.model_dump(mode="json"),
                "similarity_score": task.similarity_score,
            }
            for task in similar
        ],
        "count": len(similar),
    }


# ===========================================
# ADK Tool Definitions
# ===========================================


def propose_task_tool(
    proposal_repo: IProposalRepository,
    task_repo: ITaskRepository,
    user_id: str,
    session_id: str,
    auto_approve: bool = False,
) -> FunctionTool:
    """Create ADK tool for proposing/creating tasks (with auto-approve option)."""
    async def _tool(input_data: dict) -> dict:
        """propose_task: 新しいタスクを作成します。

        設定に応じて、即座に作成するか、ユーザー承諾を待ちます。

        **⚠️ 依存関係の設定（重要）**:
        タスク作成時には、以下の手順で依存関係を判断してください：
        1. list_tasks で同じプロジェクト内の未完了タスク（TODO/IN_PROGRESS）を取得
        2. 新しいタスクが既存タスクの完了を前提とする場合、dependency_ids に設定
        3. 例: 「確定申告書を提出する」を提案する場合 → 「領収書を整理する」が未完了なら依存関係を設定
        4. 並行実行可能なタスク（関係ないタスク）には依存関係を設定しない

        Parameters:
            title (str): タスクのタイトル（必須）※task_titleでも可
            description (str, optional): タスクの詳細説明
            project_id (str, optional): プロジェクトID
            importance (str, optional): 重要度 (HIGH/MEDIUM/LOW)、デフォルト: MEDIUM
            urgency (str, optional): 緊急度 (HIGH/MEDIUM/LOW)、デフォルト: MEDIUM
            energy_level (str, optional): 必要エネルギー (HIGH/LOW)、デフォルト: LOW
            estimated_minutes (int, optional): 見積もり時間（分）
            due_date (str, optional): 期限（ISO形式）
            dependency_ids (list[str], optional): このタスクが依存する他のタスクのIDリスト（UUID文字列）
            is_fixed_time (bool, optional): 会議・固定時間イベントの場合true
            start_time (str, optional): 開始時刻（ISO形式、is_fixed_time=trueの場合必須）
            end_time (str, optional): 終了時刻（ISO形式、is_fixed_time=trueの場合必須）
            location (str, optional): 場所（会議用）
            attendees (list[str], optional): 参加者リスト（会議用）
            meeting_notes (str, optional): 議事録・メモ（会議用）
            proposal_description (str, optional): 提案の説明文（なぜこのタスクを作成するか）

        Returns:
            dict: タスクID、説明文、または提案ID（auto_approveの設定による）
        """
        # Extract proposal_description if provided
        proposal_desc = input_data.pop("proposal_description", "")
        return await propose_task(
            user_id, session_id, proposal_repo, task_repo,
            CreateTaskInput(**input_data), proposal_desc, auto_approve
        )

    _tool.__name__ = "propose_task"
    return FunctionTool(func=_tool)


def create_task_tool(repo: ITaskRepository, user_id: str) -> FunctionTool:
    """Create ADK tool for creating tasks."""
    async def _tool(input_data: dict) -> dict:
        """create_task: 新しいタスクを作成します。作成前にsearch_similar_tasksで重複チェック推奨。

        **⚠️ 依存関係の設定（重要）**:
        タスク作成時には、以下の手順で依存関係を判断してください：
        1. list_tasks で同じプロジェクト内の未完了タスク（TODO/IN_PROGRESS）を取得
        2. 新しいタスクが既存タスクの完了を前提とする場合、dependency_ids に設定
        3. 例: 「確定申告書を提出する」を作る場合 → 「領収書を整理する」が未完了なら依存関係を設定
        4. 並行実行可能なタスク（関係ないタスク）には依存関係を設定しない

        Parameters:
            title (str): タスクのタイトル（必須）※task_titleでも可
            description (str, optional): タスクの詳細説明
            project_id (str, optional): プロジェクトID
            importance (str, optional): 重要度 (HIGH/MEDIUM/LOW)、デフォルト: MEDIUM
            urgency (str, optional): 緊急度 (HIGH/MEDIUM/LOW)、デフォルト: MEDIUM
            energy_level (str, optional): 必要エネルギー (HIGH/LOW)、デフォルト: LOW
            estimated_minutes (int, optional): 見積もり時間（分）
            due_date (str, optional): 期限（ISO形式）
            dependency_ids (list[str], optional): このタスクが依存する他のタスクのIDリスト（UUID文字列）
            is_fixed_time (bool, optional): 会議・固定時間イベントの場合true
            start_time (str, optional): 開始時刻（ISO形式、is_fixed_time=trueの場合必須）
            end_time (str, optional): 終了時刻（ISO形式、is_fixed_time=trueの場合必須）
            location (str, optional): 場所（会議用）
            attendees (list[str], optional): 参加者リスト（会議用）
            meeting_notes (str, optional): 議事録・メモ（会議用）

        Returns:
            dict: 作成されたタスク情報
        """
        return await create_task(user_id, repo, CreateTaskInput(**input_data))

    _tool.__name__ = "create_task"
    return FunctionTool(func=_tool)


def update_task_tool(repo: ITaskRepository, user_id: str) -> FunctionTool:
    """Create ADK tool for updating tasks."""
    async def _tool(input_data: dict) -> dict:
        """update_task: 既存のタスクを更新します（タイトル、説明、ステータス、進捗率等）。

        Parameters:
            task_id (str): タスクID（UUID文字列、必須）
            title (str, optional): タスクのタイトル
            description (str, optional): タスクの詳細説明
            status (str, optional): ステータス (TODO/IN_PROGRESS/WAITING/DONE)
            importance (str, optional): 重要度 (HIGH/MEDIUM/LOW)
            urgency (str, optional): 緊急度 (HIGH/MEDIUM/LOW)
            energy_level (str, optional): 必要エネルギー (HIGH/LOW)
            progress (int, optional): 進捗率（0-100%）。タスクの完成度を設定
            is_fixed_time (bool, optional): 会議・固定時間イベントの場合true
            start_time (str, optional): 開始時刻（ISO形式）
            end_time (str, optional): 終了時刻（ISO形式）
            location (str, optional): 場所（会議用）
            attendees (list[str], optional): 参加者リスト（会議用）
            meeting_notes (str, optional): 議事録・メモ（会議用）

        Returns:
            dict: 更新されたタスク情報
        """
        return await update_task(user_id, repo, UpdateTaskInput(**input_data))

    _tool.__name__ = "update_task"
    return FunctionTool(func=_tool)


def delete_task_tool(repo: ITaskRepository, user_id: str) -> FunctionTool:
    """Create ADK tool for deleting tasks."""
    async def _tool(input_data: dict) -> dict:
        """delete_task: タスクを削除します。

        Parameters:
            task_id (str): 削除するタスクのID（UUID文字列、必須）

        Returns:
            dict: 削除結果 (success, task_id, message)
        """
        return await delete_task(user_id, repo, DeleteTaskInput(**input_data))

    _tool.__name__ = "delete_task"
    return FunctionTool(func=_tool)


def search_similar_tasks_tool(repo: ITaskRepository, user_id: str) -> FunctionTool:
    """Create ADK tool for searching similar tasks."""
    async def _tool(input_data: dict) -> dict:
        """search_similar_tasks: 類似タスクを検索して重複をチェックします。

        Parameters:
            task_title (str): 検索するタスクのタイトル（必須）
            project_id (str, optional): プロジェクトID（指定時はそのプロジェクト内のみ検索）

        Returns:
            dict: 類似タスクのリストとスコア
        """
        return await search_similar_tasks(user_id, repo, SearchSimilarTasksInput(**input_data))

    _tool.__name__ = "search_similar_tasks"
    return FunctionTool(func=_tool)


def list_tasks_tool(repo: ITaskRepository, user_id: str) -> FunctionTool:
    """Create ADK tool for listing tasks."""
    async def _tool(input_data: dict) -> dict:
        """list_tasks: タスク一覧を取得します（依存関係判断に利用）。

        Parameters:
            project_id (str, optional): プロジェクトID（指定時はそのプロジェクト内のみ取得）
            status_filter (list[str], optional): ステータスフィルタ（例: ["TODO", "IN_PROGRESS"]）
            limit (int, optional): 取得件数上限（デフォルト: 50、最大: 100）

        Returns:
            dict: タスク一覧（各タスクにはid, title, description, status, dependency_ids等を含む）
        """
        return await list_tasks(user_id, repo, ListTasksInput(**input_data))

    _tool.__name__ = "list_tasks"
    return FunctionTool(func=_tool)


async def breakdown_task(
    user_id: str,
    task_repo: ITaskRepository,
    memory_repo: IMemoryRepository,
    llm_provider: ILLMProvider,
    project_repo: Optional[IProjectRepository],
    input_data: BreakdownTaskInput,
) -> dict:
    """
    Break down a task into subtasks using Planner Agent.

    Args:
        user_id: User ID
        task_repo: Task repository
        memory_repo: Memory repository
        llm_provider: LLM provider
        project_repo: Project repository (optional)
        input_data: Breakdown parameters

    Returns:
        Breakdown result with steps and subtask IDs
    """
    task_id = UUID(input_data.task_id)

    service = PlannerService(
        llm_provider=llm_provider,
        task_repo=task_repo,
        memory_repo=memory_repo,
        project_repo=project_repo,
    )

    result = await service.breakdown_task(
        user_id=user_id,
        task_id=task_id,
        create_subtasks=input_data.create_subtasks,
    )

    return result.model_dump(mode="json")


def create_meeting_tool(repo: ITaskRepository, user_id: str) -> FunctionTool:
    """Create ADK tool for creating meetings."""
    async def _tool(input_data: dict) -> dict:
        """create_meeting: 固定時間の会議・予定を登録します。

        Outlookスクリーンショット等から会議情報を抽出した際に使用してください。

        **複数日にまたがる会議の処理**:
        2日間の研修や複数日カンファレンスの場合、日ごとに別々のタスクとして登録してください。
        例: 「1月15-16日 年次研修」→ 2つの会議タスク（1/15分と1/16分）

        Parameters:
            title (str): 会議タイトル（必須）
            start_time (str): 開始時刻（ISO形式: "2024-01-15T14:00:00"）
            end_time (str): 終了時刻（ISO形式: "2024-01-15T15:30:00"）
            location (str, optional): 場所（例: "Zoom", "会議室A"）
            attendees (list[str], optional): 参加者リスト
            description (str, optional): 会議の目的・議題
            meeting_notes (str, optional): 議事録・メモ
            project_id (str, optional): プロジェクトID

        Returns:
            dict: 作成された会議タスク情報
        """
        return await create_meeting(user_id, repo, CreateMeetingInput(**input_data))

    _tool.__name__ = "create_meeting"
    return FunctionTool(func=_tool)


def breakdown_task_tool(
    repo: ITaskRepository,
    memory_repo: IMemoryRepository,
    llm_provider: ILLMProvider,
    user_id: str,
    project_repo: Optional[IProjectRepository] = None,
) -> FunctionTool:
    """Create ADK tool for breaking down tasks into subtasks."""
    async def _tool(input_data: dict) -> dict:
        """breakdown_task: タスクを3-5個のサブタスクに分解します（Planner Agentを使用）。

        タスクがプロジェクトに属している場合、プロジェクトの目標・重要ポイント・READMEを考慮して分解します。

        Parameters:
            task_id (str): 分解するタスクのID（UUID文字列、必須）
            create_subtasks (bool, optional): サブタスクを自動作成するか（デフォルト: True）

        Returns:
            dict: 分解結果（steps: ステップリスト、subtasks_created: サブタスク作成有無、subtask_ids: 作成されたサブタスクIDリスト、markdown_guide: Markdownガイド）
        """
        return await breakdown_task(
            user_id, repo, memory_repo, llm_provider, project_repo, BreakdownTaskInput(**input_data)
        )

    _tool.__name__ = "breakdown_task"
    return FunctionTool(func=_tool)
