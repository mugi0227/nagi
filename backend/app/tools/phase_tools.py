"""
Phase-related agent tools.

Tools for planning phases/milestones and phase task breakdowns.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from google.adk.tools import FunctionTool
from pydantic import BaseModel, Field

from app.interfaces.llm_provider import ILLMProvider
from app.interfaces.memory_repository import IMemoryRepository
from app.interfaces.milestone_repository import IMilestoneRepository
from app.interfaces.phase_repository import IPhaseRepository
from app.interfaces.proposal_repository import IProposalRepository
from app.interfaces.project_repository import IProjectRepository
from app.interfaces.task_repository import ITaskRepository
from app.models.phase_breakdown import (
    PhaseBreakdownRequest,
    PhaseTaskBreakdownRequest,
    PhaseSuggestion,
)
from app.models.phase import PhaseCreate
from app.models.milestone import MilestoneCreate
from app.models.proposal import Proposal, ProposalResponse, ProposalType
from app.services.phase_planner_service import PhasePlannerService


class PlanProjectPhasesInput(BaseModel):
    """Input for plan_project_phases tool."""

    project_id: str = Field(..., description="Project ID")
    instruction: Optional[str] = Field(
        None,
        description="User instruction or constraints for phase planning",
    )
    create_phases: bool = Field(
        False,
        description="Create phases in the database",
    )
    create_milestones: bool = Field(
        False,
        description="Create milestones in the database",
    )


class PlanPhaseTasksInput(BaseModel):
    """Input for plan_phase_tasks tool."""

    phase_id: str = Field(..., description="Phase ID")
    instruction: Optional[str] = Field(
        None,
        description="User instruction or constraints for task breakdown",
    )
    create_tasks: bool = Field(
        False,
        description="Create tasks in the database",
    )


class ProposePhaseBreakdownInput(BaseModel):
    """Input for propose_phase_breakdown tool."""

    project_id: str = Field(..., description="Project ID")
    instruction: Optional[str] = Field(
        None,
        description="User instruction or constraints for phase planning",
    )
    create_milestones: bool = Field(
        True,
        description="Create milestones when applying the plan",
    )


class PhaseBreakdownProposalPayload(BaseModel):
    """Payload stored for phase breakdown proposals."""

    project_id: str
    instruction: Optional[str] = None
    create_milestones: bool = True
    phases: list[PhaseSuggestion]


def _parse_optional_datetime(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _normalize_phase_suggestions(phases: list[PhaseSuggestion] | list[dict]) -> list[PhaseSuggestion]:
    normalized: list[PhaseSuggestion] = []
    for item in phases:
        if isinstance(item, PhaseSuggestion):
            normalized.append(item)
        else:
            normalized.append(PhaseSuggestion.model_validate(item))
    return normalized


async def apply_phase_plan(
    user_id: str,
    project_id: UUID,
    phase_repo: IPhaseRepository,
    milestone_repo: IMilestoneRepository,
    phases: list[PhaseSuggestion] | list[dict],
    create_milestones: bool = True,
) -> dict:
    """Create phases (and optional milestones) from a planned breakdown."""
    normalized_phases = _normalize_phase_suggestions(phases)
    created_phase_ids: list[str] = []
    created_milestone_ids: list[str] = []

    for index, phase in enumerate(normalized_phases, start=1):
        created_phase = await phase_repo.create(
            user_id,
            PhaseCreate(
                project_id=project_id,
                name=phase.name,
                description=phase.description,
                order_in_project=index,
            ),
        )
        created_phase_ids.append(str(created_phase.id))

        if create_milestones and phase.milestones:
            for milestone_index, milestone in enumerate(phase.milestones, start=1):
                created_milestone = await milestone_repo.create(
                    user_id,
                    MilestoneCreate(
                        project_id=project_id,
                        phase_id=created_phase.id,
                        title=milestone.title,
                        description=milestone.description,
                        order_in_phase=milestone_index,
                        due_date=_parse_optional_datetime(milestone.due_date),
                    ),
                )
                created_milestone_ids.append(str(created_milestone.id))

    return {
        "created_phase_ids": created_phase_ids,
        "created_milestone_ids": created_milestone_ids,
    }


async def propose_phase_breakdown(
    user_id: str,
    session_id: str,
    proposal_repo: IProposalRepository,
    project_repo: IProjectRepository,
    phase_repo: IPhaseRepository,
    milestone_repo: IMilestoneRepository,
    task_repo: ITaskRepository,
    memory_repo: IMemoryRepository,
    llm_provider: ILLMProvider,
    input_data: ProposePhaseBreakdownInput,
    description: str = "",
    auto_approve: bool = False,
) -> dict:
    """Propose a phase breakdown for user approval (or auto-apply if configured)."""
    if not description:
        description = "Proposed a phase breakdown plan for the project."

    service = PhasePlannerService(
        llm_provider=llm_provider,
        memory_repo=memory_repo,
        project_repo=project_repo,
        phase_repo=phase_repo,
        milestone_repo=milestone_repo,
        task_repo=task_repo,
    )
    response = await service.breakdown_project_phases(
        user_id=user_id,
        project_id=UUID(input_data.project_id),
        request=PhaseBreakdownRequest(
            create_phases=False,
            create_milestones=False,
            instruction=input_data.instruction,
        ),
    )

    payload = PhaseBreakdownProposalPayload(
        project_id=input_data.project_id,
        instruction=input_data.instruction,
        create_milestones=input_data.create_milestones,
        phases=response.phases,
    )

    if auto_approve:
        created = await apply_phase_plan(
            user_id=user_id,
            project_id=UUID(input_data.project_id),
            phase_repo=phase_repo,
            milestone_repo=milestone_repo,
            phases=response.phases,
            create_milestones=input_data.create_milestones,
        )
        return {
            "auto_approved": True,
            "description": description,
            "project_id": input_data.project_id,
            "phases": payload.model_dump(mode="json")["phases"],
            "created_phase_ids": created["created_phase_ids"],
            "created_milestone_ids": created["created_milestone_ids"],
        }

    user_id_raw = None
    try:
        parsed_user_id = UUID(user_id)
    except (ValueError, AttributeError):
        import hashlib

        user_id_raw = user_id
        parsed_user_id = UUID(bytes=hashlib.md5(user_id.encode()).digest())

    proposal = Proposal(
        user_id=parsed_user_id,
        user_id_raw=user_id_raw,
        session_id=session_id,
        proposal_type=ProposalType.PHASE_BREAKDOWN,
        payload=payload.model_dump(mode="json"),
        description=description,
    )

    created_proposal = await proposal_repo.create(proposal)

    return ProposalResponse(
        proposal_id=str(created_proposal.id),
        proposal_type=ProposalType.PHASE_BREAKDOWN,
        description=description,
        payload=payload.model_dump(mode="json"),
    ).model_dump(mode="json")


def plan_project_phases_tool(
    project_repo: IProjectRepository,
    phase_repo: IPhaseRepository,
    milestone_repo: IMilestoneRepository,
    task_repo: ITaskRepository,
    memory_repo: IMemoryRepository,
    llm_provider: ILLMProvider,
    user_id: str,
) -> FunctionTool:
    """Create ADK tool for AI phase/milestone planning."""

    async def _tool(input_data: dict) -> dict:
        """plan_project_phases: generate phases and milestones for a project.

        Parameters:
            project_id (str): Project ID
            instruction (str, optional): User instruction or constraints
            create_phases (bool, optional): Create phases in DB
            create_milestones (bool, optional): Create milestones in DB

        Returns:
            dict: phases list and created IDs if requested
        """
        payload = PlanProjectPhasesInput(**input_data)
        service = PhasePlannerService(
            llm_provider=llm_provider,
            memory_repo=memory_repo,
            project_repo=project_repo,
            phase_repo=phase_repo,
            milestone_repo=milestone_repo,
            task_repo=task_repo,
        )
        response = await service.breakdown_project_phases(
            user_id=user_id,
            project_id=UUID(payload.project_id),
            request=PhaseBreakdownRequest(
                create_phases=payload.create_phases,
                create_milestones=payload.create_milestones,
                instruction=payload.instruction,
            ),
        )
        return response.model_dump(mode="json")

    _tool.__name__ = "plan_project_phases"
    return FunctionTool(func=_tool)


def plan_phase_tasks_tool(
    project_repo: IProjectRepository,
    phase_repo: IPhaseRepository,
    milestone_repo: IMilestoneRepository,
    task_repo: ITaskRepository,
    memory_repo: IMemoryRepository,
    llm_provider: ILLMProvider,
    user_id: str,
) -> FunctionTool:
    """Create ADK tool for AI phase task breakdown."""

    async def _tool(input_data: dict) -> dict:
        """plan_phase_tasks: generate tasks for a phase.

        Parameters:
            phase_id (str): Phase ID
            instruction (str, optional): User instruction or constraints
            create_tasks (bool, optional): Create tasks in DB

        Returns:
            dict: tasks list and created IDs if requested
        """
        payload = PlanPhaseTasksInput(**input_data)
        service = PhasePlannerService(
            llm_provider=llm_provider,
            memory_repo=memory_repo,
            project_repo=project_repo,
            phase_repo=phase_repo,
            milestone_repo=milestone_repo,
            task_repo=task_repo,
        )
        response = await service.breakdown_phase_tasks(
            user_id=user_id,
            phase_id=UUID(payload.phase_id),
            request=PhaseTaskBreakdownRequest(
                create_tasks=payload.create_tasks,
                instruction=payload.instruction,
            ),
        )
        return response.model_dump(mode="json")

    _tool.__name__ = "plan_phase_tasks"
    return FunctionTool(func=_tool)


def propose_phase_breakdown_tool(
    proposal_repo: IProposalRepository,
    project_repo: IProjectRepository,
    phase_repo: IPhaseRepository,
    milestone_repo: IMilestoneRepository,
    task_repo: ITaskRepository,
    memory_repo: IMemoryRepository,
    llm_provider: ILLMProvider,
    user_id: str,
    session_id: str,
    auto_approve: bool = False,
) -> FunctionTool:
    """Create ADK tool for proposing phase breakdowns (with auto-approve option)."""

    async def _tool(input_data: dict) -> dict:
        """propose_phase_breakdown: propose project phases/milestones for approval.

        Parameters:
            project_id (str): Project ID
            instruction (str, optional): User instruction or constraints
            create_milestones (bool, optional): Create milestones when approved
            proposal_description (str, optional): Proposal description

        Returns:
            dict: Proposal payload or created phase IDs if auto-approved
        """
        proposal_desc = input_data.pop("proposal_description", "")
        return await propose_phase_breakdown(
            user_id=user_id,
            session_id=session_id,
            proposal_repo=proposal_repo,
            project_repo=project_repo,
            phase_repo=phase_repo,
            milestone_repo=milestone_repo,
            task_repo=task_repo,
            memory_repo=memory_repo,
            llm_provider=llm_provider,
            input_data=ProposePhaseBreakdownInput(**input_data),
            description=proposal_desc,
            auto_approve=auto_approve,
        )

    _tool.__name__ = "propose_phase_breakdown"
    return FunctionTool(func=_tool)


class ListPhasesInput(BaseModel):
    """Input for list_phases tool."""

    project_id: str = Field(..., description="プロジェクトID")


class GetPhaseInput(BaseModel):
    """Input for get_phase tool."""

    phase_id: str = Field(..., description="フェーズID")


class UpdatePhaseInput(BaseModel):
    """Input for update_phase tool."""

    phase_id: str = Field(..., description="フェーズID")
    name: Optional[str] = Field(None, description="フェーズ名")
    description: Optional[str] = Field(None, description="フェーズの説明")
    status: Optional[str] = Field(None, description="ステータス (ACTIVE/COMPLETED/ARCHIVED)")
    order_in_project: Optional[int] = Field(None, ge=1, description="プロジェクト内での順序")
    start_date: Optional[str] = Field(None, description="開始予定日（ISO形式）")
    end_date: Optional[str] = Field(None, description="終了予定日（ISO形式）")


async def list_phases(
    user_id: str,
    phase_repo: IPhaseRepository,
    input_data: ListPhasesInput,
) -> dict:
    """List phases for a project."""
    try:
        project_id = UUID(input_data.project_id)
    except ValueError:
        return {"error": f"Invalid project ID format: {input_data.project_id}"}

    phases = await phase_repo.list_by_project(user_id, project_id)
    return {
        "phases": [phase.model_dump(mode="json") for phase in phases],
        "count": len(phases),
    }


def list_phases_tool(phase_repo: IPhaseRepository, user_id: str) -> FunctionTool:
    """Create ADK tool for listing phases."""

    async def _tool(input_data: dict) -> dict:
        """list_phases: 指定されたプロジェクトのフェーズ一覧を取得します。

        このツールは、プロジェクト内のすべてのフェーズを順序付きで取得し、
        各フェーズのタスク統計情報（総数、完了数、進行中数）も含めて返します。
        フェーズの概要を把握したい場合や、フェーズごとの進捗状況を確認したい場合に使用してください。

        Parameters:
            project_id (str): プロジェクトID（UUID形式、必須）

        Returns:
            dict: {
                "phases": [
                    {
                        "id": "フェーズID",
                        "name": "フェーズ名",
                        "description": "説明",
                        "project_id": "プロジェクトID",
                        "order_in_project": 順序番号,
                        "status": "ACTIVE/COMPLETED/ARCHIVED",
                        "start_date": "開始日（ISO形式）",
                        "end_date": "終了日（ISO形式）",
                        "total_tasks": 総タスク数,
                        "completed_tasks": 完了タスク数,
                        "in_progress_tasks": 進行中タスク数,
                        "created_at": "作成日時",
                        "updated_at": "更新日時"
                    }
                ],
                "count": フェーズ数
            }
        """
        return await list_phases(user_id, phase_repo, ListPhasesInput(**input_data))

    _tool.__name__ = "list_phases"
    return FunctionTool(func=_tool)


async def get_phase(
    user_id: str,
    phase_repo: IPhaseRepository,
    input_data: GetPhaseInput,
) -> dict:
    """Get detailed phase information."""
    try:
        phase_id = UUID(input_data.phase_id)
    except ValueError:
        return {"error": f"Invalid phase ID format: {input_data.phase_id}"}

    phase = await phase_repo.get_by_id(user_id, phase_id)
    if not phase:
        return {"error": f"Phase not found: {input_data.phase_id}"}

    return phase.model_dump(mode="json")


def get_phase_tool(phase_repo: IPhaseRepository, user_id: str) -> FunctionTool:
    """Create ADK tool for getting phase details."""

    async def _tool(input_data: dict) -> dict:
        """get_phase: フェーズの詳細情報を取得します。

        特定のフェーズの詳細情報を取得します。フェーズIDを指定して、
        そのフェーズの名前、説明、ステータス、日付などの情報を確認できます。
        フェーズを編集する前に現在の状態を確認したい場合などに使用してください。

        Parameters:
            phase_id (str): フェーズID（UUID形式、必須）

        Returns:
            dict: {
                "id": "フェーズID",
                "name": "フェーズ名",
                "description": "フェーズの説明",
                "project_id": "所属プロジェクトID",
                "user_id": "所有者ユーザーID",
                "order_in_project": プロジェクト内での順序,
                "status": "ACTIVE/COMPLETED/ARCHIVED",
                "start_date": "開始予定日（ISO形式）",
                "end_date": "終了予定日（ISO形式）",
                "created_at": "作成日時",
                "updated_at": "更新日時"
            }

            エラー時: {"error": "エラーメッセージ"}
        """
        return await get_phase(user_id, phase_repo, GetPhaseInput(**input_data))

    _tool.__name__ = "get_phase"
    return FunctionTool(func=_tool)


async def update_phase(
    user_id: str,
    phase_repo: IPhaseRepository,
    input_data: UpdatePhaseInput,
) -> dict:
    """Update phase information."""
    from app.models.phase import PhaseUpdate
    from app.models.enums import PhaseStatus

    try:
        phase_id = UUID(input_data.phase_id)
    except ValueError:
        return {"error": f"Invalid phase ID format: {input_data.phase_id}"}

    update_fields: dict = {}

    if input_data.name is not None:
        update_fields["name"] = input_data.name
    if input_data.description is not None:
        update_fields["description"] = input_data.description
    if input_data.status is not None:
        try:
            update_fields["status"] = PhaseStatus[input_data.status.upper()]
        except KeyError:
            return {"error": f"Invalid status: {input_data.status}. Must be ACTIVE, COMPLETED, or ARCHIVED"}
    if input_data.order_in_project is not None:
        update_fields["order_in_project"] = input_data.order_in_project
    if input_data.start_date is not None:
        update_fields["start_date"] = _parse_optional_datetime(input_data.start_date)
    if input_data.end_date is not None:
        update_fields["end_date"] = _parse_optional_datetime(input_data.end_date)

    if not update_fields:
        return {"error": "No fields to update"}

    update_model = PhaseUpdate(**update_fields)
    phase = await phase_repo.update(user_id, phase_id, update_model)
    return phase.model_dump(mode="json")


def update_phase_tool(phase_repo: IPhaseRepository, user_id: str) -> FunctionTool:
    """Create ADK tool for updating phases."""

    async def _tool(input_data: dict) -> dict:
        """update_phase: 既存フェーズの情報を更新します。

        フェーズの名前、説明、ステータス、順序、日付などを更新できます。
        更新したいフィールドのみを指定してください（指定しないフィールドは変更されません）。
        フェーズの状態を変更したり、スケジュールを調整したりする場合に使用します。

        Parameters:
            phase_id (str): 更新対象のフェーズID（UUID形式、必須）
            name (str, optional): フェーズ名（最大200文字）
            description (str, optional): フェーズの説明（最大2000文字）
            status (str, optional): ステータス。以下のいずれか:
                - "ACTIVE": アクティブ（進行中）
                - "COMPLETED": 完了
                - "ARCHIVED": アーカイブ済み
            order_in_project (int, optional): プロジェクト内での順序（1以上の整数）
            start_date (str, optional): 開始予定日（ISO 8601形式、例: "2026-01-15T09:00:00Z"）
            end_date (str, optional): 終了予定日（ISO 8601形式、例: "2026-02-15T18:00:00Z"）

        Returns:
            dict: 更新されたフェーズの完全な情報（get_phaseと同じ形式）

            エラー時: {"error": "エラーメッセージ"}
                - 無効なフェーズID形式
                - フェーズが見つからない
                - 無効なステータス値
                - 更新するフィールドが指定されていない

        Example:
            # ステータスを完了に変更
            {"phase_id": "123e4567-e89b-12d3-a456-426614174000", "status": "COMPLETED"}

            # 名前と説明を更新
            {"phase_id": "123e4567-...", "name": "新しいフェーズ名", "description": "更新された説明"}
        """
        return await update_phase(user_id, phase_repo, UpdatePhaseInput(**input_data))

    _tool.__name__ = "update_phase"
    return FunctionTool(func=_tool)


# =============================================================================
# Simple CRUD Tools (No AI)
# =============================================================================


class CreatePhaseInput(BaseModel):
    """Input for create_phase tool."""

    project_id: str = Field(..., description="プロジェクトID")
    name: str = Field(..., description="フェーズ名")
    description: Optional[str] = Field(None, description="フェーズの説明")
    order_in_project: Optional[int] = Field(None, ge=1, description="プロジェクト内での順序")
    start_date: Optional[str] = Field(None, description="開始予定日（ISO形式）")
    end_date: Optional[str] = Field(None, description="終了予定日（ISO形式）")


class DeletePhaseInput(BaseModel):
    """Input for delete_phase tool."""

    phase_id: str = Field(..., description="フェーズID")


class CreateMilestoneInput(BaseModel):
    """Input for create_milestone tool."""

    project_id: str = Field(..., description="プロジェクトID")
    phase_id: str = Field(..., description="フェーズID")
    title: str = Field(..., description="マイルストーン名")
    description: Optional[str] = Field(None, description="マイルストーンの説明")
    order_in_phase: Optional[int] = Field(None, ge=1, description="フェーズ内での順序")
    due_date: Optional[str] = Field(None, description="期限日（ISO形式）")


class UpdateMilestoneInput(BaseModel):
    """Input for update_milestone tool."""

    milestone_id: str = Field(..., description="マイルストーンID")
    title: Optional[str] = Field(None, description="マイルストーン名")
    description: Optional[str] = Field(None, description="マイルストーンの説明")
    order_in_phase: Optional[int] = Field(None, ge=1, description="フェーズ内での順序")
    due_date: Optional[str] = Field(None, description="期限日（ISO形式）")
    is_completed: Optional[bool] = Field(None, description="完了フラグ")


class DeleteMilestoneInput(BaseModel):
    """Input for delete_milestone tool."""

    milestone_id: str = Field(..., description="マイルストーンID")


def create_phase_tool(phase_repo: IPhaseRepository, user_id: str) -> FunctionTool:
    """Create ADK tool for simple phase creation (no AI)."""

    async def _tool(input_data: dict) -> dict:
        """create_phase: 新しいフェーズを作成します（AI不使用）。

        プロジェクトに新しいフェーズを追加します。
        AI生成ではなく、指定された情報でそのままフェーズを作成します。

        Parameters:
            project_id (str): プロジェクトID（UUID形式、必須）
            name (str): フェーズ名（必須）
            description (str, optional): フェーズの説明
            order_in_project (int, optional): プロジェクト内での順序（1以上）
            start_date (str, optional): 開始予定日（ISO形式）
            end_date (str, optional): 終了予定日（ISO形式）

        Returns:
            dict: 作成されたフェーズの情報
        """
        payload = CreatePhaseInput(**input_data)

        try:
            project_id = UUID(payload.project_id)
        except ValueError:
            return {"error": f"Invalid project ID format: {payload.project_id}"}

        # Get max order if not specified
        order = payload.order_in_project
        if order is None:
            existing_phases = await phase_repo.list_by_project(user_id, project_id)
            order = len(existing_phases) + 1

        phase_create = PhaseCreate(
            project_id=project_id,
            name=payload.name,
            description=payload.description,
            order_in_project=order,
            start_date=_parse_optional_datetime(payload.start_date),
            end_date=_parse_optional_datetime(payload.end_date),
        )

        created_phase = await phase_repo.create(user_id, phase_create)
        return created_phase.model_dump(mode="json")

    _tool.__name__ = "create_phase"
    return FunctionTool(func=_tool)


def delete_phase_tool(phase_repo: IPhaseRepository, user_id: str) -> FunctionTool:
    """Create ADK tool for phase deletion."""

    async def _tool(input_data: dict) -> dict:
        """delete_phase: フェーズを削除します。

        指定されたフェーズを削除します。
        注意: 関連するタスクやマイルストーンも影響を受ける可能性があります。

        Parameters:
            phase_id (str): フェーズID（UUID形式、必須）

        Returns:
            dict: {"success": True, "deleted_phase_id": "..."} または {"error": "..."}
        """
        payload = DeletePhaseInput(**input_data)

        try:
            phase_id = UUID(payload.phase_id)
        except ValueError:
            return {"error": f"Invalid phase ID format: {payload.phase_id}"}

        success = await phase_repo.delete(user_id, phase_id)
        if success:
            return {"success": True, "deleted_phase_id": payload.phase_id}
        return {"error": f"Phase not found or could not be deleted: {payload.phase_id}"}

    _tool.__name__ = "delete_phase"
    return FunctionTool(func=_tool)


def create_milestone_tool(milestone_repo: IMilestoneRepository, user_id: str) -> FunctionTool:
    """Create ADK tool for simple milestone creation (no AI)."""

    async def _tool(input_data: dict) -> dict:
        """create_milestone: 新しいマイルストーンを作成します（AI不使用）。

        フェーズに新しいマイルストーンを追加します。

        Parameters:
            project_id (str): プロジェクトID（UUID形式、必須）
            phase_id (str): フェーズID（UUID形式、必須）
            title (str): マイルストーン名（必須）
            description (str, optional): マイルストーンの説明
            order_in_phase (int, optional): フェーズ内での順序（1以上）
            due_date (str, optional): 期限日（ISO形式）

        Returns:
            dict: 作成されたマイルストーンの情報
        """
        payload = CreateMilestoneInput(**input_data)

        try:
            project_id = UUID(payload.project_id)
            phase_id = UUID(payload.phase_id)
        except ValueError as e:
            return {"error": f"Invalid ID format: {e}"}

        # Get max order if not specified
        order = payload.order_in_phase
        if order is None:
            existing_milestones = await milestone_repo.list_by_phase(user_id, phase_id)
            order = len(existing_milestones) + 1

        milestone_create = MilestoneCreate(
            project_id=project_id,
            phase_id=phase_id,
            title=payload.title,
            description=payload.description,
            order_in_phase=order,
            due_date=_parse_optional_datetime(payload.due_date),
        )

        created_milestone = await milestone_repo.create(user_id, milestone_create)
        return created_milestone.model_dump(mode="json")

    _tool.__name__ = "create_milestone"
    return FunctionTool(func=_tool)


def update_milestone_tool(milestone_repo: IMilestoneRepository, user_id: str) -> FunctionTool:
    """Create ADK tool for milestone update."""

    async def _tool(input_data: dict) -> dict:
        """update_milestone: マイルストーンを更新します。

        既存のマイルストーンの情報を更新します。

        Parameters:
            milestone_id (str): マイルストーンID（UUID形式、必須）
            title (str, optional): マイルストーン名
            description (str, optional): マイルストーンの説明
            order_in_phase (int, optional): フェーズ内での順序
            due_date (str, optional): 期限日（ISO形式）
            is_completed (bool, optional): 完了フラグ

        Returns:
            dict: 更新されたマイルストーンの情報
        """
        from app.models.milestone import MilestoneUpdate

        payload = UpdateMilestoneInput(**input_data)

        try:
            milestone_id = UUID(payload.milestone_id)
        except ValueError:
            return {"error": f"Invalid milestone ID format: {payload.milestone_id}"}

        update_fields: dict = {}
        if payload.title is not None:
            update_fields["title"] = payload.title
        if payload.description is not None:
            update_fields["description"] = payload.description
        if payload.order_in_phase is not None:
            update_fields["order_in_phase"] = payload.order_in_phase
        if payload.due_date is not None:
            update_fields["due_date"] = _parse_optional_datetime(payload.due_date)
        if payload.is_completed is not None:
            update_fields["is_completed"] = payload.is_completed

        if not update_fields:
            return {"error": "No fields to update"}

        update_model = MilestoneUpdate(**update_fields)
        updated_milestone = await milestone_repo.update(user_id, milestone_id, update_model)
        if not updated_milestone:
            return {"error": f"Milestone not found: {payload.milestone_id}"}
        return updated_milestone.model_dump(mode="json")

    _tool.__name__ = "update_milestone"
    return FunctionTool(func=_tool)


def delete_milestone_tool(milestone_repo: IMilestoneRepository, user_id: str) -> FunctionTool:
    """Create ADK tool for milestone deletion."""

    async def _tool(input_data: dict) -> dict:
        """delete_milestone: マイルストーンを削除します。

        指定されたマイルストーンを削除します。

        Parameters:
            milestone_id (str): マイルストーンID（UUID形式、必須）

        Returns:
            dict: {"success": True, "deleted_milestone_id": "..."} または {"error": "..."}
        """
        payload = DeleteMilestoneInput(**input_data)

        try:
            milestone_id = UUID(payload.milestone_id)
        except ValueError:
            return {"error": f"Invalid milestone ID format: {payload.milestone_id}"}

        success = await milestone_repo.delete(user_id, milestone_id)
        if success:
            return {"success": True, "deleted_milestone_id": payload.milestone_id}
        return {"error": f"Milestone not found or could not be deleted: {payload.milestone_id}"}

    _tool.__name__ = "delete_milestone"
    return FunctionTool(func=_tool)
