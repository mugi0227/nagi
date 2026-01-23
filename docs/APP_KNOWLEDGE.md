# Secretary Partner AI - アプリケーション知識ベース

*自動生成: 2026-01-22 17:26:41*

このドキュメントはコードベースから自動生成されています。
Issue投稿時のAIコンテキストとして使用されます。

## 1. アプリケーション概要

**Secretary Partner AI** は、自律型秘書AIアプリケーションです。

主な特徴:
- 脳内ダンプ: 思いついたことを気軽に投げ込める
- タスク管理: AIがタスクを整理・分解
- プロジェクト管理: フェーズ・マイルストーンでの進捗管理
- スケジュール: 自動スケジューリング
- 会議サポート: アジェンダ管理・議事録

## 2. 機能一覧

### サイドバーナビゲーション

| パス | 機能名 |
|------|--------|
| `/` | Dashboard |
| `/tasks` | Tasks |
| `/projects` | Projects |
| `/skills` | Skills |
| `/memories` | Memories |
| `/achievement` | Achievement |

### 全ルート

| パス | コンポーネント |
|------|----------------|
| `/login` | LoginPage |
| `/auth/callback` | OidcCallbackPage |
| `/invite/accept` | InvitationAcceptPage |
| `tasks` | TasksPage |
| `projects` | ProjectsPage |
| `projects/:projectId` | ProjectDetailPage |
| `projects/:projectId/v2` | ProjectDetailV2Page |
| `achievement` | AchievementPage |
| `skills` | SkillsPage |
| `memories` | MemoriesPage |

## 3. ディレクトリ構造

```
backend/
├── app/api/           # FastAPI Routers
├── app/core/          # Config, Logger, Exceptions
├── app/models/        # Pydantic Schemas
├── app/services/      # Business Logic
├── app/agents/        # ADK Agents
├── app/tools/         # Agent Tools
├── app/interfaces/    # Abstract Interfaces
├── app/infrastructure/
├──     local/         # SQLite implementations
├──     gcp/           # GCP implementations

frontend/
├── src/api/           # API clients
├── src/components/    # React components
├── src/hooks/         # Custom hooks
├── src/pages/         # Page components
├── src/utils/         # Utility functions
```

## 4. API エンドポイント

### agent_tasks

| Method | Path | 説明 |
|--------|------|------|
| GET | `/{task_id}` | Get an agent task by ID. |
| PATCH | `/{task_id}` | Update an agent task. |
| DELETE | `/{task_id}` | Cancel an agent task. |

### captures

| Method | Path | 説明 |
|--------|------|------|
| GET | `/{capture_id}` | Get a capture by ID. |
| POST | `/{capture_id}/process` | Mark a capture as processed. |
| DELETE | `/{capture_id}` | Delete a capture. |
| POST | `/{capture_id}/analyze` | Analyze a capture using AI to suggest task details. |

### chat

| Method | Path | 説明 |
|--------|------|------|
| GET | `/sessions` | List chat sessions for the current user. |
| GET | `/history/{session_id}` | Get message history for a specific session. |

### issues

| Method | Path | 説明 |
|--------|------|------|
| GET | `/{issue_id}` | Get an issue by ID. |
| PATCH | `/{issue_id}` | Update an existing issue (by author only). |
| PATCH | `/{issue_id}/status` | Update issue status (admin only - for now, any user can update). |
| DELETE | `/{issue_id}` | Delete an issue (by author only). |
| POST | `/{issue_id}/like` | Add a like to an issue. |
| DELETE | `/{issue_id}/like` | Remove a like from an issue. |

### meeting_agendas

| Method | Path | 説明 |
|--------|------|------|
| POST | `/{meeting_id}/items` | Create a new agenda item for a meeting. |
| GET | `/{meeting_id}/items` | List all agenda items for a meeting. |
| GET | `/items/{agenda_item_id}` | Get a specific agenda item. |
| PATCH | `/items/{agenda_item_id}` | Update an agenda item. |
| DELETE | `/items/{agenda_item_id}` | Delete an agenda item. |
| POST | `/{meeting_id}/items/reorder` | Reorder agenda items. |
| POST | `/tasks/{task_id}/items` | Create a new agenda item for a standalone meeting task. |
| GET | `/tasks/{task_id}/items` | List all agenda items for a standalone meeting task. |

### meeting_sessions

| Method | Path | 説明 |
|--------|------|------|
| GET | `/{session_id}` | Get a session by ID. |
| PATCH | `/{session_id}` | Update a session. |
| DELETE | `/{session_id}` | Delete a session. |
| GET | `/task/{task_id}` | Get the active (non-COMPLETED) session for a task. |
| GET | `/task/{task_id}/latest` | Get the most recent session for a task (any status). |
| POST | `/{session_id}/start` | Start a meeting session (change status to IN_PROGRESS). |
| POST | `/{session_id}/end` | End a meeting session (change status to COMPLETED). |
| POST | `/{session_id}/next-agenda` | Move to the next agenda item. |
| POST | `/{session_id}/prev-agenda` | Move to the previous agenda item. |
| POST | `/{session_id}/reset` | Reset a meeting session (reset agenda index to 0, keep IN_PROGRESS status). |
| POST | `/{session_id}/reopen` | Reopen a completed meeting session (change status back to IN_PROGRESS). |
| POST | `/{session_id}/reset-to-preparation` | Reset a session to PREPARATION status (before meeting started). |
| POST | `/{session_id}/analyze-transcript` | Analyze meeting transcript to extract summary, decisions, and next actions. |
| POST | `/{session_id}/create-tasks` | Create tasks from next actions extracted from meeting transcript. |

### memories

| Method | Path | 説明 |
|--------|------|------|
| GET | `/{memory_id}` | Get a memory by ID. |
| PATCH | `/{memory_id}` | Update an existing memory. |
| DELETE | `/{memory_id}` | Delete a memory. |

### milestones

| Method | Path | 説明 |
|--------|------|------|
| GET | `/{milestone_id}` | Get a milestone by ID. |
| GET | `/phase/{phase_id}` | List milestones for a phase. |
| GET | `/project/{project_id}` | List milestones for a project. |
| PATCH | `/{milestone_id}` | Update a milestone. |
| DELETE | `/{milestone_id}` | Delete a milestone. |

### phases

| Method | Path | 説明 |
|--------|------|------|
| GET | `/{phase_id}` | Get a phase by ID. |
| GET | `/project/{project_id}` | List all phases for a project with task counts. |
| PATCH | `/{phase_id}` | Update a phase. |
| POST | `/{phase_id}/set-current` | Set the specified phase as the current phase. |
| DELETE | `/{phase_id}` | Delete a phase. |
| POST | `/{phase_id}/task-breakdown` | Generate tasks for a phase using AI. |

### projects

| Method | Path | 説明 |
|--------|------|------|
| GET | `/kpi-templates` | List KPI templates. |
| GET | `/{project_id}` | Get a project by ID with task counts. |
| PATCH | `/{project_id}` | Update a project. |
| DELETE | `/{project_id}` | Delete a project. Only OWNER or ADMIN can delete. |
| GET | `/{project_id}/members` | List members for a project. |
| POST | `/{project_id}/members` | Add a member to a project. |
| PATCH | `/{project_id}/members/{member_id}` | Update a project member. |
| DELETE | `/{project_id}/members/{member_id}` | Remove a member from a project. |
| GET | `/{project_id}/invitations` | List invitations for a project. |
| POST | `/{project_id}/invitations` | Create a project invitation (or add member if user exists). |
| PATCH | `/{project_id}/invitations/{invitation_id}` | Update invitation status. |
| POST | `/invitations/{token}/accept` | Accept an invitation using a token. |
| GET | `/{project_id}/assignments` | List task assignments for a project. |
| GET | `/{project_id}/blockers` | List blockers for a project. |
| POST | `/{project_id}/checkins/summary` | Summarize check-ins with optional weekly context. |
| POST | `/{project_id}/checkins/summary/save` | Save a check-in summary as project memory. |
| POST | `/{project_id}/checkins` | Create a new check-in for a project. |
| PATCH | `/{project_id}/checkins/v2/{checkin_id}` | Update a structured check-in (V2). Only the creator can update. |
| DELETE | `/{project_id}/checkins/v2/{checkin_id}` | Delete a structured check-in (V2). Only the creator can delete. |
| POST | `/{project_id}/phase-breakdown` | Generate phases and milestones for a project using AI. |

### proposals

| Method | Path | 説明 |
|--------|------|------|
| POST | `/{proposal_id}/approve` | Approve a proposal and create task/project. |
| POST | `/{proposal_id}/reject` | Reject a proposal without creating anything. |
| GET | `/pending` | List pending proposals for current user. |

### recurring_meetings

| Method | Path | 説明 |
|--------|------|------|
| GET | `/{meeting_id}` | Get a recurring meeting by ID. |
| PATCH | `/{meeting_id}` | Update a recurring meeting. |
| DELETE | `/{meeting_id}` | Delete a recurring meeting. |

### tasks

| Method | Path | 説明 |
|--------|------|------|
| GET | `/{task_id}` | Get a task by ID. |
| PATCH | `/{task_id}` | Update a task. |
| DELETE | `/{task_id}` | Delete a task. |
| GET | `/{task_id}/subtasks` | Get all subtasks of a parent task. |
| POST | `/{task_id}/action-items` | Create action item subtasks from meeting notes. |
| GET | `/{task_id}/assignment` | Get assignment for a task (returns first assignee). |
| GET | `/{task_id}/assignments` | List all assignments for a task (multiple assignees). |
| POST | `/{task_id}/assignment` | Assign a task to a member (upsert). |
| PUT | `/{task_id}/assignments` | Assign a task to multiple members. Replaces existing assignments. |
| PATCH | `/assignments/{assignment_id}` | Update assignment fields. |
| DELETE | `/{task_id}/assignment` | Remove assignment from a task. |
| GET | `/{task_id}/blockers` | List blockers for a task. |
| POST | `/{task_id}/blockers` | Create a blocker for a task. |
| PATCH | `/blockers/{blocker_id}` | Update a blocker. |

## 5. AI ツール一覧

AIエージェントが使用できるツール:

### タスク管理

- `create_task_tool`: Create ADK tool for creating tasks.
- `assign_task_tool`: Create ADK tool for assigning tasks.
- `update_task_tool`: Create ADK tool for updating tasks.
- `delete_task_tool`: Create ADK tool for deleting tasks.
- `search_similar_tasks_tool`: Create ADK tool for searching similar tasks.
- `list_tasks_tool`: Create ADK tool for listing tasks.
- `list_task_assignments_tool`: List Task Assignments
- `breakdown_task_tool`: Create ADK tool for breaking down tasks into subtasks.
- `get_task_tool`: Create ADK tool for getting a single task.
- `schedule_agent_task_tool`: Create ADK tool for scheduling agent tasks.
- `plan_phase_tasks_tool`: Create ADK tool for AI phase task breakdown.

### プロジェクト管理

- `create_project_tool`: Create ADK tool for creating projects.
- `list_projects_tool`: Create ADK tool for listing projects.
- `list_project_members_tool`: Create ADK tool for listing project members.
- `list_project_invitations_tool`: List Project Invitations
- `load_project_context_tool`: Create ADK tool for loading project context.
- `update_project_tool`: Create ADK tool for updating projects.
- `invite_project_member_tool`: Create ADK tool for inviting project members.
- `create_project_summary_tool`: Create ADK tool for saving project summaries.
- `list_project_assignments_tool`: List Project Assignments
- `plan_project_phases_tool`: Create ADK tool for AI phase/milestone planning.

### メモリ・スキル

- `search_work_memory_tool`: Create ADK tool for searching work memories.
- `add_to_memory_tool`: Create ADK tool for adding memories.

### フェーズ・マイルストーン

- `propose_phase_breakdown_tool`: Create ADK tool for proposing phase breakdowns (with auto-approve option).
- `list_phases_tool`: Create ADK tool for listing phases.
- `get_phase_tool`: Create ADK tool for getting phase details.
- `update_phase_tool`: Create ADK tool for updating phases.
- `create_phase_tool`: Create ADK tool for simple phase creation (no AI).
- `delete_phase_tool`: Create ADK tool for phase deletion.

### 会議・アジェンダ

- `create_meeting_tool`: Create ADK tool for creating meetings.
- `fetch_meeting_context_tool`: Create ADK tool for fetching meeting context.
- `list_recurring_meetings_tool`: Create ADK tool for listing recurring meetings.

### その他

- `list_kpi_templates_tool`: Create ADK tool for listing KPI templates.
- `search_memories_tool`: Create ADK tool for searching memories.
- `search_skills_tool`: Create ADK tool for searching Skills (WorkMemory).
- `refresh_user_profile_tool`: Create ADK tool for refreshing user profile summary.
- `create_skill_tool`: Create ADK tool for creating skills.
- `get_current_datetime_tool`: Create ADK tool for getting current datetime.
- `create_milestone_tool`: Create ADK tool for simple milestone creation (no AI).
- `update_milestone_tool`: Create ADK tool for milestone update.
- `delete_milestone_tool`: Create ADK tool for milestone deletion.
- `add_agenda_item_tool`: Create ADK tool for adding agenda items.
- `update_agenda_item_tool`: Create ADK tool for updating agenda items.
- `delete_agenda_item_tool`: Create ADK tool for deleting agenda items.
- `list_agenda_items_tool`: Create ADK tool for listing agenda items.
- `reorder_agenda_items_tool`: Create ADK tool for reordering agenda items.

## 6. 技術スタック

### バックエンド
- Python 3.11+
- FastAPI
- SQLAlchemy (SQLite)
- Google ADK (Agent Development Kit)
- Gemini API / Vertex AI

### フロントエンド
- React 18
- TypeScript
- Vite
- TailwindCSS
