"""
Backfill script to inherit assignees from parent tasks to subtasks.

Run this script to assign parent task's assignees to existing subtasks
that don't have any assignees.
"""

import os
import sqlite3
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path


def parse_sqlite_path(database_url: str | None, base_dir: Path) -> Path | None:
    if not database_url:
        return None
    if database_url.startswith("sqlite+aiosqlite:///"):
        path = Path(database_url.replace("sqlite+aiosqlite:///", "", 1))
        return (base_dir / path).resolve() if not path.is_absolute() else path.resolve()
    if database_url.startswith("sqlite:///"):
        path = Path(database_url.replace("sqlite:///", "", 1))
        return (base_dir / path).resolve() if not path.is_absolute() else path.resolve()
    if database_url.startswith("sqlite://"):
        path = Path(database_url.replace("sqlite://", "", 1))
        return (base_dir / path).resolve() if not path.is_absolute() else path.resolve()
    return None


def load_env_database_url() -> str | None:
    env_path = Path(__file__).resolve().parents[1] / ".env"
    if not env_path.exists():
        return os.getenv("DATABASE_URL")
    with env_path.open("r", encoding="utf-8") as handle:
        for line in handle:
            if line.startswith("DATABASE_URL="):
                return line.strip().split("=", 1)[1]
    return os.getenv("DATABASE_URL")


def main() -> None:
    database_url = load_env_database_url()
    base_dir = Path(__file__).resolve().parents[1]
    db_path = parse_sqlite_path(database_url, base_dir) if database_url else None
    if db_path is None:
        db_path = base_dir / "secretary.db"
    if not db_path.exists():
        raise SystemExit(f"Database not found: {db_path}")

    conn = sqlite3.connect(str(db_path))
    cur = conn.cursor()

    # Get all subtasks (tasks with parent_id) with their user_id
    cur.execute(
        "SELECT id, parent_id, user_id FROM tasks WHERE parent_id IS NOT NULL"
    )
    subtasks = cur.fetchall()

    # Group subtasks by parent_id (store subtask_id and user_id)
    subtasks_by_parent: dict[str, list[tuple[str, str]]] = defaultdict(list)
    for subtask_id, parent_id, user_id in subtasks:
        subtasks_by_parent[parent_id].append((subtask_id, user_id))

    # Get all task assignments
    cur.execute("SELECT task_id, assignee_id FROM task_assignments")
    assignments = cur.fetchall()

    # Build assignment maps
    assignees_by_task: dict[str, list[str]] = defaultdict(list)
    for task_id, assignee_id in assignments:
        assignees_by_task[task_id].append(assignee_id)

    created = 0
    now = datetime.now(timezone.utc).isoformat()

    for parent_id, subtask_infos in subtasks_by_parent.items():
        parent_assignees = assignees_by_task.get(parent_id, [])
        if not parent_assignees:
            continue

        for subtask_id, user_id in subtask_infos:
            subtask_assignees = set(assignees_by_task.get(subtask_id, []))

            for assignee_id in parent_assignees:
                if assignee_id in subtask_assignees:
                    continue

                # Create new assignment
                assignment_id = str(uuid.uuid4())
                cur.execute(
                    """
                    INSERT INTO task_assignments (id, user_id, task_id, assignee_id, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (assignment_id, user_id, subtask_id, assignee_id, now, now),
                )
                created += 1
                # Track for deduplication within this run
                assignees_by_task[subtask_id].append(assignee_id)

    conn.commit()
    conn.close()
    print(f"Created {created} assignee inheritances for subtasks.")


if __name__ == "__main__":
    main()
