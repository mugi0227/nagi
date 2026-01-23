"""
Task dependency validation utilities.

Validates task dependencies to prevent circular dependencies and ensure consistency.
"""

from typing import Optional
from uuid import UUID

from app.core.exceptions import BusinessLogicError


class DependencyValidator:
    """Validator for task dependencies."""

    def __init__(self, task_repo):
        """
        Initialize validator with task repository.

        Args:
            task_repo: Task repository for fetching task data
        """
        self.task_repo = task_repo

    async def validate_dependencies(
        self,
        task_id: UUID,
        dependency_ids: list[UUID],
        user_id: str,
        parent_id: Optional[UUID] = None,
        project_id: Optional[UUID] = None,
    ) -> None:
        """
        Validate task dependencies.

        Args:
            task_id: ID of the task being validated
            dependency_ids: List of dependency task IDs
            user_id: User ID for authorization
            parent_id: Parent task ID if this is a subtask
            project_id: Project ID for project-based access

        Raises:
            BusinessLogicError: If dependencies are invalid
        """
        if not dependency_ids:
            return

        # 1. Check for self-dependency
        if task_id in dependency_ids:
            raise BusinessLogicError("タスクは自分自身に依存できません")

        # 2. Check for duplicate dependencies
        if len(dependency_ids) != len(set(dependency_ids)):
            raise BusinessLogicError("依存関係に重複があります")

        # 3. Fetch all dependency tasks
        dep_tasks = []
        for dep_id in dependency_ids:
            # Try personal access first, then project-based
            dep_task = await self.task_repo.get(user_id, dep_id)
            if not dep_task and project_id:
                dep_task = await self.task_repo.get(user_id, dep_id, project_id=project_id)
            if not dep_task:
                raise BusinessLogicError(f"依存先タスク {dep_id} が見つかりません")
            dep_tasks.append(dep_task)

        # 4. If this is a subtask, validate subtask-specific rules
        if parent_id:
            await self._validate_subtask_dependencies(
                task_id, parent_id, dep_tasks, user_id
            )

        # 5. Check for circular dependencies
        await self._check_circular_dependency(task_id, dependency_ids, user_id, project_id=project_id)

    async def _validate_subtask_dependencies(
        self,
        subtask_id: UUID,
        parent_id: UUID,
        dep_tasks: list,
        user_id: str,
    ) -> None:
        """
        Validate subtask-specific dependency rules.

        Args:
            subtask_id: Subtask ID
            parent_id: Parent task ID
            dep_tasks: List of dependency tasks
            user_id: User ID for authorization

        Raises:
            BusinessLogicError: If subtask dependencies are invalid
        """
        # Subtasks can only depend on:
        # 1. Other subtasks of the same parent
        # 2. Tasks outside the parent-child hierarchy

        for dep_task in dep_tasks:
            dep_parent_id = dep_task.parent_id

            # If dependency has a parent
            if dep_parent_id:
                # It must be a sibling (same parent)
                if dep_parent_id != parent_id:
                    raise BusinessLogicError(
                        "サブタスクは同じ親タスクのサブタスクにのみ依存できます"
                    )
            # If dependency has no parent (it's a parent task)
            else:
                # Check if it's the parent itself
                if dep_task.id == parent_id:
                    raise BusinessLogicError(
                        "サブタスクは親タスクに依存できません（親タスクはサブタスク完了後に完了します）"
                    )
                # Other parent tasks are allowed (for cross-project dependencies)

    async def _check_circular_dependency(
        self,
        task_id: UUID,
        dependency_ids: list[UUID],
        user_id: str,
        visited: Optional[set[UUID]] = None,
        project_id: Optional[UUID] = None,
    ) -> None:
        """
        Check for circular dependencies using DFS.

        Args:
            task_id: Starting task ID
            dependency_ids: Direct dependencies of the task
            user_id: User ID for authorization
            visited: Set of visited task IDs (for recursion)
            project_id: Project ID for project-based access

        Raises:
            BusinessLogicError: If circular dependency is detected
        """
        if visited is None:
            visited = {task_id}

        for dep_id in dependency_ids:
            # If we've seen this task before, it's a circular dependency
            if dep_id in visited:
                raise BusinessLogicError(
                    f"循環依存が検出されました: タスク {dep_id} はすでに依存チェーン内に存在します"
                )

            # Fetch the dependency task (try personal access first, then project-based)
            dep_task = await self.task_repo.get(user_id, dep_id)
            if not dep_task and project_id:
                dep_task = await self.task_repo.get(user_id, dep_id, project_id=project_id)
            if not dep_task:
                continue

            # Recursively check dependencies of this task
            if dep_task.dependency_ids:
                new_visited = visited | {dep_id}
                await self._check_circular_dependency(
                    dep_id, dep_task.dependency_ids, user_id, new_visited, project_id=project_id
                )

    async def validate_parent_child_consistency(
        self,
        task_id: UUID,
        new_parent_id: Optional[UUID],
        user_id: str,
    ) -> None:
        """
        Validate that setting a parent doesn't create dependency conflicts.

        Args:
            task_id: Task ID being updated
            new_parent_id: New parent task ID (or None)
            user_id: User ID for authorization

        Raises:
            BusinessLogicError: If parent-child relationship is invalid
        """
        if not new_parent_id:
            return

        # 1. Check if parent exists
        parent_task = await self.task_repo.get(user_id, new_parent_id)
        if not parent_task:
            raise BusinessLogicError(f"親タスク {new_parent_id} が見つかりません")

        # 2. Parent cannot have a parent (no nested subtasks)
        if parent_task.parent_id:
            raise BusinessLogicError("サブタスクを親タスクに設定することはできません")

        # 3. Check if task depends on the parent
        task = await self.task_repo.get(user_id, task_id)
        if task and new_parent_id in task.dependency_ids:
            raise BusinessLogicError(
                "親タスクに依存しているタスクを、その親タスクのサブタスクにすることはできません"
            )

        # 4. Check if parent depends on this task (would create a cycle)
        if parent_task.dependency_ids and task_id in parent_task.dependency_ids:
            raise BusinessLogicError(
                "このタスクに依存している親タスクを設定することはできません（循環依存）"
            )
