"""Migrate selected dev_user tasks/projects to another account."""
from __future__ import annotations

import argparse
import sqlite3
from pathlib import Path


PROJECT_NAMES = [
    "加西DXプロジェクト",
    "結婚プロジェクト",
]
MEETING_TITLE_TOKENS = ["1/17", "飲み会", "二次会"]


def _chunks(items: list[str], size: int = 900) -> list[list[str]]:
    return [items[i:i + size] for i in range(0, len(items), size)]


def _format_ids(ids: list[str]) -> str:
    return ", ".join(ids) if ids else "(none)"


def _select_target_user_id(con: sqlite3.Connection, email: str) -> str:
    row = con.execute(
        "SELECT id FROM users WHERE email = ?",
        (email.strip().lower(),),
    ).fetchone()
    if not row:
        raise SystemExit(f"Target user not found for email: {email}")
    return row["id"]


def _project_ids_for_user(con: sqlite3.Connection, user_id: str) -> dict[str, str]:
    rows = con.execute(
        "SELECT id, name FROM projects WHERE user_id = ?",
        (user_id,),
    ).fetchall()
    return {row["name"]: row["id"] for row in rows}


def _task_ids_by_project(con: sqlite3.Connection, user_id: str, project_ids: list[str]) -> list[str]:
    if not project_ids:
        return []
    placeholders = ",".join(["?"] * len(project_ids))
    rows = con.execute(
        f"SELECT id FROM tasks WHERE user_id = ? AND project_id IN ({placeholders})",
        (user_id, *project_ids),
    ).fetchall()
    return [row["id"] for row in rows]


def _find_meeting_task_ids(con: sqlite3.Connection, user_id: str) -> list[str]:
    rows = con.execute(
        "SELECT id, title FROM tasks WHERE user_id = ?",
        (user_id,),
    ).fetchall()
    matches = []
    for row in rows:
        title = row["title"] or ""
        if all(token in title for token in MEETING_TITLE_TOKENS):
            matches.append(row["id"])
    return matches


def _include_descendants(con: sqlite3.Connection, user_id: str, task_ids: list[str]) -> list[str]:
    all_ids = set(task_ids)
    if not all_ids:
        return []
    changed = True
    while changed:
        changed = False
        rows = con.execute(
            "SELECT id, parent_id FROM tasks WHERE user_id = ? AND parent_id IS NOT NULL",
            (user_id,),
        ).fetchall()
        for row in rows:
            if row["parent_id"] in all_ids and row["id"] not in all_ids:
                all_ids.add(row["id"])
                changed = True
    return list(all_ids)


def _count_for_ids(
    con: sqlite3.Connection,
    table: str,
    id_column: str,
    user_id: str,
    task_ids: list[str],
) -> int:
    if not task_ids:
        return 0
    count = 0
    for chunk in _chunks(task_ids):
        placeholders = ",".join(["?"] * len(chunk))
        row = con.execute(
            f"SELECT COUNT(*) as cnt FROM {table} WHERE user_id = ? AND {id_column} IN ({placeholders})",
            (user_id, *chunk),
        ).fetchone()
        count += row["cnt"]
    return count


def _update_user_id_for_ids(
    con: sqlite3.Connection,
    table: str,
    id_column: str,
    source_user: str,
    target_user: str,
    ids: list[str],
) -> int:
    if not ids:
        return 0
    updated = 0
    for chunk in _chunks(ids):
        placeholders = ",".join(["?"] * len(chunk))
        cur = con.execute(
            f"UPDATE {table} SET user_id = ? WHERE user_id = ? AND {id_column} IN ({placeholders})",
            (target_user, source_user, *chunk),
        )
        updated += cur.rowcount
    return updated


def _update_user_id_for_projects(
    con: sqlite3.Connection,
    table: str,
    source_user: str,
    target_user: str,
    project_ids: list[str],
) -> int:
    if not project_ids:
        return 0
    placeholders = ",".join(["?"] * len(project_ids))
    cur = con.execute(
        f"UPDATE {table} SET user_id = ? WHERE user_id = ? AND project_id IN ({placeholders})",
        (target_user, source_user, *project_ids),
    )
    return cur.rowcount


def _update_user_id_for_project_ids(
    con: sqlite3.Connection,
    table: str,
    source_user: str,
    target_user: str,
    project_ids: list[str],
) -> int:
    if not project_ids:
        return 0
    placeholders = ",".join(["?"] * len(project_ids))
    cur = con.execute(
        f"UPDATE {table} SET user_id = ? WHERE user_id = ? AND id IN ({placeholders})",
        (target_user, source_user, *project_ids),
    )
    return cur.rowcount


def _update_field_for_projects(
    con: sqlite3.Connection,
    table: str,
    field: str,
    source_user: str,
    target_user: str,
    project_ids: list[str],
) -> int:
    if not project_ids:
        return 0
    placeholders = ",".join(["?"] * len(project_ids))
    cur = con.execute(
        f"UPDATE {table} SET {field} = ? WHERE {field} = ? AND project_id IN ({placeholders})",
        (target_user, source_user, *project_ids),
    )
    return cur.rowcount


def _update_field_for_tasks(
    con: sqlite3.Connection,
    table: str,
    field: str,
    source_user: str,
    target_user: str,
    task_ids: list[str],
) -> int:
    if not task_ids:
        return 0
    updated = 0
    for chunk in _chunks(task_ids):
        placeholders = ",".join(["?"] * len(chunk))
        cur = con.execute(
            f"UPDATE {table} SET {field} = ? WHERE {field} = ? AND task_id IN ({placeholders})",
            (target_user, source_user, *chunk),
        )
        updated += cur.rowcount
    return updated


def main() -> None:
    parser = argparse.ArgumentParser(description="Migrate selected dev_user tasks/projects.")
    parser.add_argument("--source-user", default="dev_user")
    parser.add_argument("--target-email", default="toon227@me.com")
    parser.add_argument("--apply", action="store_true", help="Apply updates (default is dry-run).")
    args = parser.parse_args()

    db_path = Path(__file__).resolve().parents[1] / "secretary.db"
    if not db_path.exists():
        raise SystemExit(f"Database not found: {db_path}")

    con = sqlite3.connect(db_path)
    con.row_factory = sqlite3.Row

    source_user = args.source_user
    target_user_id = _select_target_user_id(con, args.target_email)

    projects_by_name = _project_ids_for_user(con, source_user)
    missing_projects = [name for name in PROJECT_NAMES if name not in projects_by_name]
    if missing_projects:
        raise SystemExit(f"Missing projects for {source_user}: {missing_projects}")

    project_ids = [projects_by_name[name] for name in PROJECT_NAMES]

    project_task_ids = _task_ids_by_project(con, source_user, project_ids)
    meeting_task_ids = _find_meeting_task_ids(con, source_user)
    if len(meeting_task_ids) != 1:
        raise SystemExit(
            f"Expected exactly one meeting task match, found {len(meeting_task_ids)}: {_format_ids(meeting_task_ids)}"
        )

    candidate_task_ids = sorted(set(project_task_ids + meeting_task_ids))
    all_task_ids = sorted(set(_include_descendants(con, source_user, candidate_task_ids)))

    print("Source user:", source_user)
    print("Target user id:", target_user_id)
    print("Project ids:", _format_ids(project_ids))
    print("Project task count:", len(project_task_ids))
    print("Meeting task id:", _format_ids(meeting_task_ids))
    print("Total task ids (with descendants):", len(all_task_ids))

    assignment_count = _count_for_ids(con, "task_assignments", "task_id", source_user, all_task_ids)
    blocker_count = _count_for_ids(con, "blockers", "task_id", source_user, all_task_ids)
    print("Related task assignments:", assignment_count)
    print("Related blockers:", blocker_count)

    if not args.apply:
        print("Dry-run only. Re-run with --apply to perform the migration.")
        con.close()
        return

    updated_projects = _update_user_id_for_project_ids(
        con,
        "projects",
        source_user,
        target_user_id,
        project_ids,
    )
    updated_phases = _update_user_id_for_projects(
        con,
        "phases",
        source_user,
        target_user_id,
        project_ids,
    )
    updated_milestones = _update_user_id_for_projects(
        con,
        "milestones",
        source_user,
        target_user_id,
        project_ids,
    )
    updated_recurring = _update_user_id_for_projects(
        con,
        "recurring_meetings",
        source_user,
        target_user_id,
        project_ids,
    )
    updated_checkins = _update_user_id_for_projects(
        con,
        "checkins",
        source_user,
        target_user_id,
        project_ids,
    )
    updated_project_members = _update_user_id_for_projects(
        con,
        "project_members",
        source_user,
        target_user_id,
        project_ids,
    )
    updated_project_invitations = _update_user_id_for_projects(
        con,
        "project_invitations",
        source_user,
        target_user_id,
        project_ids,
    )

    updated_tasks = _update_user_id_for_ids(
        con,
        "tasks",
        "id",
        source_user,
        target_user_id,
        all_task_ids,
    )
    updated_assignments = _update_user_id_for_ids(
        con,
        "task_assignments",
        "task_id",
        source_user,
        target_user_id,
        all_task_ids,
    )
    updated_blockers = _update_user_id_for_ids(
        con,
        "blockers",
        "task_id",
        source_user,
        target_user_id,
        all_task_ids,
    )

    updated_member_links = _update_field_for_projects(
        con,
        "project_members",
        "member_user_id",
        source_user,
        target_user_id,
        project_ids,
    )
    updated_checkin_members = _update_field_for_projects(
        con,
        "checkins",
        "member_user_id",
        source_user,
        target_user_id,
        project_ids,
    )
    updated_invited_by = _update_field_for_projects(
        con,
        "project_invitations",
        "invited_by",
        source_user,
        target_user_id,
        project_ids,
    )
    updated_accepted_by = _update_field_for_projects(
        con,
        "project_invitations",
        "accepted_by",
        source_user,
        target_user_id,
        project_ids,
    )

    updated_assignment_assignee = _update_field_for_tasks(
        con,
        "task_assignments",
        "assignee_id",
        source_user,
        target_user_id,
        all_task_ids,
    )

    con.commit()
    con.close()

    print("Applied updates:")
    print("  projects:", updated_projects)
    print("  phases:", updated_phases)
    print("  milestones:", updated_milestones)
    print("  recurring_meetings:", updated_recurring)
    print("  checkins:", updated_checkins)
    print("  project_members:", updated_project_members)
    print("  project_invitations:", updated_project_invitations)
    print("  tasks:", updated_tasks)
    print("  task_assignments:", updated_assignments)
    print("  blockers:", updated_blockers)
    print("  project_members.member_user_id:", updated_member_links)
    print("  checkins.member_user_id:", updated_checkin_members)
    print("  project_invitations.invited_by:", updated_invited_by)
    print("  project_invitations.accepted_by:", updated_accepted_by)
    print("  task_assignments.assignee_id:", updated_assignment_assignee)


if __name__ == "__main__":
    main()
