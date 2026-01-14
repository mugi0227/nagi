"""
Tests for task dependency validation.

Tests circular dependency detection and parent-child consistency.
"""

import pytest
from datetime import datetime, timezone
from uuid import uuid4, UUID
from typing import Optional

from app.core.exceptions import BusinessLogicError
from app.models.task import Task
from app.models.enums import CreatedBy, TaskStatus
from app.utils.dependency_validator import DependencyValidator


def create_test_task(
    title: str,
    user_id: str,
    parent_id: Optional[UUID] = None,
    dependency_ids: Optional[list[UUID]] = None,
) -> Task:
    """Helper function to create a test task with required fields."""
    now = datetime.now(timezone.utc)
    return Task(
        id=uuid4(),
        user_id=user_id,
        title=title,
        parent_id=parent_id,
        dependency_ids=dependency_ids or [],
        created_by=CreatedBy.USER,
        status=TaskStatus.TODO,
        created_at=now,
        updated_at=now,
    )


class MockTaskRepository:
    """Mock task repository for testing."""

    def __init__(self):
        self.tasks = {}

    async def get(self, user_id: str, task_id: UUID):
        """
        Get a task by ID.

        Args:
            user_id: User ID (for authorization)
            task_id: Task ID to retrieve

        Returns:
            Task if found and owned by user, None otherwise
        """
        task = self.tasks.get(task_id)
        # Verify user owns the task
        if task and task.user_id == user_id:
            return task
        return None

    def add_task(self, task: Task):
        """Add a task to the mock repository."""
        self.tasks[task.id] = task


@pytest.fixture
def mock_repo():
    """Create a mock task repository."""
    return MockTaskRepository()


@pytest.fixture
def validator(mock_repo):
    """Create a dependency validator."""
    return DependencyValidator(mock_repo)


@pytest.fixture
def user_id():
    """Test user ID."""
    return "test-user"


@pytest.mark.asyncio
class TestDependencyValidator:
    """Test cases for dependency validation."""

    async def test_no_dependencies(self, validator, user_id):
        """Test that tasks with no dependencies are always valid."""
        task_id = uuid4()
        await validator.validate_dependencies(task_id, [], user_id)
        # Should not raise

    async def test_self_dependency_error(self, validator, user_id):
        """Test that a task cannot depend on itself."""
        task_id = uuid4()

        with pytest.raises(BusinessLogicError, match="自分自身に依存できません"):
            await validator.validate_dependencies(
                task_id, [task_id], user_id
            )

    async def test_duplicate_dependencies_error(self, validator, user_id):
        """Test that duplicate dependencies are rejected."""
        task_id = uuid4()
        dep_id = uuid4()

        with pytest.raises(BusinessLogicError, match="重複があります"):
            await validator.validate_dependencies(
                task_id, [dep_id, dep_id], user_id
            )

    async def test_missing_dependency_error(self, validator, user_id):
        """Test that dependencies must exist."""
        task_id = uuid4()
        nonexistent_id = uuid4()

        with pytest.raises(BusinessLogicError, match="が見つかりません"):
            await validator.validate_dependencies(
                task_id, [nonexistent_id], user_id
            )

    async def test_circular_dependency_direct(
        self, validator, mock_repo, user_id
    ):
        """Test direct circular dependency: A -> B -> A."""
        task_a = create_test_task("Task A", user_id)
        task_b = create_test_task("Task B", user_id, dependency_ids=[task_a.id])

        mock_repo.add_task(task_a)
        mock_repo.add_task(task_b)

        # Try to make A depend on B (which depends on A)
        with pytest.raises(BusinessLogicError, match="循環依存が検出されました"):
            await validator.validate_dependencies(
                task_a.id, [task_b.id], user_id
            )

    async def test_circular_dependency_indirect(
        self, validator, mock_repo, user_id
    ):
        """Test indirect circular dependency: A -> B -> C -> A."""
        task_a = create_test_task("Task A", user_id)
        task_b = create_test_task("Task B", user_id, dependency_ids=[task_a.id])
        task_c = create_test_task("Task C", user_id, dependency_ids=[task_b.id])

        mock_repo.add_task(task_a)
        mock_repo.add_task(task_b)
        mock_repo.add_task(task_c)

        # Try to make A depend on C (which transitively depends on A)
        with pytest.raises(BusinessLogicError, match="循環依存が検出されました"):
            await validator.validate_dependencies(
                task_a.id, [task_c.id], user_id
            )

    async def test_valid_dependency_chain(
        self, validator, mock_repo, user_id
    ):
        """Test valid linear dependency chain: A -> B -> C."""
        task_a = create_test_task("Task A", user_id)
        task_b = create_test_task("Task B", user_id, dependency_ids=[task_a.id])
        task_c = create_test_task("Task C", user_id)

        mock_repo.add_task(task_a)
        mock_repo.add_task(task_b)
        mock_repo.add_task(task_c)

        # C can depend on B (no cycle)
        await validator.validate_dependencies(
            task_c.id, [task_b.id], user_id
        )
        # Should not raise

    async def test_parent_task_dependencies_allowed(
        self, validator, mock_repo, user_id
    ):
        """Test that parent tasks can depend on each other."""
        parent_a = create_test_task("Parent A", user_id)
        parent_b = create_test_task("Parent B", user_id)

        mock_repo.add_task(parent_a)
        mock_repo.add_task(parent_b)

        # Parent A can depend on Parent B
        await validator.validate_dependencies(
            parent_a.id, [parent_b.id], user_id
        )
        # Should not raise

    async def test_subtask_sibling_dependency_allowed(
        self, validator, mock_repo, user_id
    ):
        """Test that subtasks can depend on their siblings."""
        parent = create_test_task("Parent", user_id)
        subtask_a = create_test_task("Subtask A", user_id, parent_id=parent.id)
        subtask_b = create_test_task("Subtask B", user_id, parent_id=parent.id)

        mock_repo.add_task(parent)
        mock_repo.add_task(subtask_a)
        mock_repo.add_task(subtask_b)

        # Subtask B can depend on Subtask A (same parent)
        await validator.validate_dependencies(
            subtask_b.id, [subtask_a.id], user_id, parent_id=parent.id
        )
        # Should not raise

    async def test_subtask_different_parent_error(
        self, validator, mock_repo, user_id
    ):
        """Test that subtasks cannot depend on subtasks of different parents."""
        parent_x = create_test_task("Parent X", user_id)
        parent_y = create_test_task("Parent Y", user_id)
        subtask_x = create_test_task("Subtask X", user_id, parent_id=parent_x.id)
        subtask_y = create_test_task("Subtask Y", user_id, parent_id=parent_y.id)

        mock_repo.add_task(parent_x)
        mock_repo.add_task(parent_y)
        mock_repo.add_task(subtask_x)
        mock_repo.add_task(subtask_y)

        # Subtask Y cannot depend on Subtask X (different parent)
        with pytest.raises(
            BusinessLogicError, match="同じ親タスクのサブタスクにのみ依存できます"
        ):
            await validator.validate_dependencies(
                subtask_y.id, [subtask_x.id], user_id, parent_id=parent_y.id
            )

    async def test_subtask_cannot_depend_on_parent(
        self, validator, mock_repo, user_id
    ):
        """Test that a subtask cannot depend on its parent."""
        parent = create_test_task("Parent", user_id)
        subtask = create_test_task("Subtask", user_id, parent_id=parent.id)

        mock_repo.add_task(parent)
        mock_repo.add_task(subtask)

        # Subtask cannot depend on its parent
        with pytest.raises(
            BusinessLogicError, match="サブタスクは親タスクに依存できません"
        ):
            await validator.validate_dependencies(
                subtask.id, [parent.id], user_id, parent_id=parent.id
            )

    async def test_subtask_can_depend_on_other_parent_task(
        self, validator, mock_repo, user_id
    ):
        """Test that subtasks can depend on other parent tasks (not their own parent)."""
        parent_a = create_test_task("Parent A", user_id)
        parent_b = create_test_task("Parent B", user_id)
        subtask_a = create_test_task("Subtask A", user_id, parent_id=parent_a.id)

        mock_repo.add_task(parent_a)
        mock_repo.add_task(parent_b)
        mock_repo.add_task(subtask_a)

        # Subtask A can depend on Parent B (cross-project dependency)
        await validator.validate_dependencies(
            subtask_a.id, [parent_b.id], user_id, parent_id=parent_a.id
        )
        # Should not raise

    async def test_parent_child_consistency_valid(
        self, validator, mock_repo, user_id
    ):
        """Test valid parent-child assignment."""
        parent = create_test_task("Parent", user_id)
        child = create_test_task("Child", user_id)

        mock_repo.add_task(parent)
        mock_repo.add_task(child)

        await validator.validate_parent_child_consistency(
            child.id, parent.id, user_id
        )
        # Should not raise

    async def test_parent_cannot_have_parent(
        self, validator, mock_repo, user_id
    ):
        """Test that nested subtasks are not allowed."""
        grandparent = create_test_task("Grandparent", user_id)
        parent = create_test_task("Parent (is already a subtask)", user_id, parent_id=grandparent.id)
        child = create_test_task("Child", user_id)

        mock_repo.add_task(grandparent)
        mock_repo.add_task(parent)
        mock_repo.add_task(child)

        # Cannot set a subtask as parent
        with pytest.raises(
            BusinessLogicError, match="サブタスクを親タスクに設定することはできません"
        ):
            await validator.validate_parent_child_consistency(
                child.id, parent.id, user_id
            )

    async def test_parent_depends_on_child_error(
        self, validator, mock_repo, user_id
    ):
        """Test that a parent cannot depend on its child (would create cycle)."""
        parent = create_test_task("Parent", user_id)
        child = create_test_task("Child", user_id)

        # Parent depends on child
        parent.dependency_ids = [child.id]

        mock_repo.add_task(parent)
        mock_repo.add_task(child)

        # Cannot make child a subtask of parent (parent depends on child)
        with pytest.raises(
            BusinessLogicError, match="このタスクに依存している親タスクを設定することはできません"
        ):
            await validator.validate_parent_child_consistency(
                child.id, parent.id, user_id
            )
