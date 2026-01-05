import json
import os
import sqlite3
from collections import defaultdict, deque
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Iterable


@dataclass
class TaskRow:
    task_id: str
    parent_id: str
    title: str
    order_in_parent: int | None
    dependency_ids: list[str]
    created_at: str | None


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


def parse_dependency_ids(raw: object) -> list[str]:
    if raw is None:
        return []
    if isinstance(raw, list):
        return [str(item) for item in raw]
    if isinstance(raw, str) and raw.strip() == "":
        return []
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            return [str(item) for item in parsed]
    except Exception:
        return []
    return []


def created_at_key(value: str | None) -> tuple:
    if not value:
        return (1, "")
    try:
        parsed = datetime.fromisoformat(value)
        return (0, parsed.isoformat())
    except Exception:
        return (0, value)


def topo_sort_missing(
    missing_tasks: dict[str, TaskRow],
    dependency_map: dict[str, list[str]],
) -> list[str]:
    indegree = {task_id: 0 for task_id in missing_tasks}
    adjacency: dict[str, list[str]] = defaultdict(list)
    sort_keys = {
        task_id: (
            created_at_key(task.created_at),
            task.title,
            task_id,
        )
        for task_id, task in missing_tasks.items()
    }

    for task_id, deps in dependency_map.items():
        for dep_id in deps:
            if dep_id not in missing_tasks:
                continue
            adjacency[dep_id].append(task_id)
            indegree[task_id] += 1

    ready = sorted([task_id for task_id, count in indegree.items() if count == 0], key=lambda tid: sort_keys[tid])
    ordered: list[str] = []
    ready_queue = deque(ready)

    while ready_queue:
        current = ready_queue.popleft()
        ordered.append(current)
        for neighbor in sorted(adjacency.get(current, [])):
            indegree[neighbor] -= 1
            if indegree[neighbor] == 0:
                ready_queue.append(neighbor)
        if ready_queue:
            ready_queue = deque(sorted(ready_queue, key=lambda tid: sort_keys[tid]))

    if len(ordered) != len(missing_tasks):
        remaining = [task_id for task_id in missing_tasks.keys() if task_id not in ordered]
        remaining.sort(key=lambda tid: sort_keys[tid])
        ordered.extend(remaining)

    return ordered


def assign_order_numbers(
    ordered_missing: Iterable[str],
    existing_orders: dict[str, int],
    dependency_map: dict[str, list[str]],
) -> dict[str, int]:
    assigned: dict[str, int] = {}
    used_numbers = set(existing_orders.values())
    existing_max = max(used_numbers, default=0)
    ordered_missing = list(ordered_missing)
    target_max = existing_max + len(ordered_missing)
    available = [n for n in range(1, target_max + 1) if n not in used_numbers]
    available.sort()
    next_extra = target_max + 1

    for task_id in ordered_missing:
        dependency_max = 0
        for dep_id in dependency_map.get(task_id, []):
            if dep_id in existing_orders:
                dependency_max = max(dependency_max, existing_orders[dep_id])
            elif dep_id in assigned:
                dependency_max = max(dependency_max, assigned[dep_id])
        candidate_index = None
        for idx, number in enumerate(available):
            if number > dependency_max:
                candidate_index = idx
                break
        if candidate_index is not None:
            number = available.pop(candidate_index)
        else:
            number = max(dependency_max + 1, next_extra)
            next_extra = number + 1
        assigned[task_id] = number
    return assigned


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

    cur.execute(
        "SELECT id, parent_id, title, order_in_parent, dependency_ids, created_at "
        "FROM tasks WHERE parent_id IS NOT NULL"
    )
    rows = cur.fetchall()
    tasks: list[TaskRow] = []
    for task_id, parent_id, title, order_in_parent, dependency_ids, created_at in rows:
        tasks.append(TaskRow(
            task_id=task_id,
            parent_id=parent_id,
            title=title or "",
            order_in_parent=order_in_parent,
            dependency_ids=parse_dependency_ids(dependency_ids),
            created_at=created_at,
        ))

    tasks_by_parent: dict[str, list[TaskRow]] = defaultdict(list)
    for task in tasks:
        tasks_by_parent[task.parent_id].append(task)

    updated = 0
    for parent_id, group in tasks_by_parent.items():
        existing = {task.task_id: task.order_in_parent for task in group if task.order_in_parent is not None}
        missing = {task.task_id: task for task in group if task.order_in_parent is None}
        if not missing:
            continue
        dependency_map = {task.task_id: [dep for dep in task.dependency_ids if dep in {t.task_id for t in group}]
                          for task in group}
        ordered_missing = topo_sort_missing(missing, dependency_map)
        assignments = assign_order_numbers(ordered_missing, existing, dependency_map)
        for task_id, order_number in assignments.items():
            cur.execute(
                "UPDATE tasks SET order_in_parent = ? WHERE id = ?",
                (order_number, task_id),
            )
            updated += 1

    conn.commit()
    conn.close()
    print(f"Backfilled order_in_parent for {updated} subtasks.")


if __name__ == "__main__":
    main()
