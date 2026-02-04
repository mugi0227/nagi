

import pytest

# Mock deps or use real sqlite in memory?
# Using real sqlite file mechanism from conftest might be safer but harder to access.
# I will use a temporary sqlite db for this test if possible, or just the main one with cleanup?
# Better to use a separate test db.
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.infrastructure.local.database import Base
from app.infrastructure.local.phase_repository import SqlitePhaseRepository
from app.infrastructure.local.project_member_repository import SqliteProjectMemberRepository
from app.infrastructure.local.project_repository import SqliteProjectRepository
from app.infrastructure.local.task_assignment_repository import SqliteTaskAssignmentRepository
from app.infrastructure.local.task_repository import SqliteTaskRepository
from app.models.collaboration import ProjectMemberCreate
from app.models.phase import PhaseCreate, PhaseUpdate
from app.models.project import ProjectCreate, ProjectRole
from app.models.task import TaskCreate


@pytest.fixture
async def db_session():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with async_session() as session:
        yield session

    await engine.dispose()

@pytest.fixture
def session_factory(db_session):
    # Mock factory
    from contextlib import asynccontextmanager
    @asynccontextmanager
    async def factory():
        yield db_session
    return factory

@pytest.mark.asyncio
async def test_shared_project_permissions(session_factory):
    project_repo = SqliteProjectRepository(session_factory)
    task_repo = SqliteTaskRepository(session_factory)
    assignment_repo = SqliteTaskAssignmentRepository(session_factory)
    member_repo = SqliteProjectMemberRepository(session_factory)
    phase_repo = SqlitePhaseRepository(session_factory)

    owner_id = "user_owner"
    member_id = "user_member"

    # 1. Owner creates project
    project = await project_repo.create(owner_id, ProjectCreate(name="Shared Project", goal="Test collaboration"))
    assert project.user_id == owner_id

    # 2. Add member
    await member_repo.create(owner_id, project.id, ProjectMemberCreate(member_user_id=member_id, role=ProjectRole.EDITOR))

    # 3. Member creates a phase (requires permission logic in Repo?
    # Actually Repo.create usually takes user_id but PhaseRepo.create implementation:
    # `return await repo.create(user.id, phase)`
    # PhaseRepo.create: `orm = PhaseORM(..., user_id=user_id, ...)`
    # It stores creator as user_id.

    phase = await phase_repo.create(member_id, PhaseCreate(title="Phase by Member", project_id=project.id, order_in_project=1))
    assert phase.user_id == member_id
    assert phase.project_id == project.id

    # 4. Member updates phase
    # In API, we check project permission via API. Repo just updates.
    # We want to verify Repo.update allows it if we bypass API permission check or if Repo doesn't strictly block it.
    # My change to Repo removed strict user_id check if project_id is provided?
    # Wait, PhaseRepo.update signature: `update(user_id, phase_id, update, project_id=None)`
    # If project_id is provided, it should allow update regardless of user_id?
    # Let's verify that logic.

    updated_phase = await phase_repo.update(member_id, phase.id, PhaseUpdate(title="Updated by Member"), project_id=project.id)
    assert updated_phase.title == "Updated by Member"

    # 5. Task Visibility
    # Member creates task in project, assigned to Owner.
    # TaskRepo.create(user_id, task) -> ownership = member_id.
    task = await task_repo.create(member_id, TaskCreate(title="Task for Owner", project_id=project.id))

    # Assign to Owner
    from app.models.collaboration import TaskAssignmentCreate
    await assignment_repo.assign(owner_id, task.id, TaskAssignmentCreate(assignee_id=owner_id)) # owner_id here is project owner context

    # Verify Owner sees it in "My Tasks" (simulated list_for_assignee + list_personal)
    assignments = await assignment_repo.list_for_assignee(owner_id)
    assert any(a.task_id == task.id for a in assignments)

    assigned_tasks = await task_repo.get_many([a.task_id for a in assignments])
    assert any(t.id == task.id for t in assigned_tasks)

    # Verify Member does NOT see it in "My Tasks"
    member_assignments = await assignment_repo.list_for_assignee(member_id)
    assert not any(a.task_id == task.id for a in member_assignments)

    member_personal = await task_repo.list_personal_tasks(member_id)
    # Task has project_id, so it should NOT be in personal tasks
    assert not any(t.id == task.id for t in member_personal)

    print("Verification Passed!")
