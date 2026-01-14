"""
Database schema migration helpers.

This module provides utilities for managing SQLite database schema migrations.
"""

import re
from sqlalchemy import text

from app.infrastructure.local.database import get_engine


async def run_migrations():
    """
    Run all pending migrations.

    This function checks the current database schema and applies any missing
    columns or indexes to bring the database up to date.
    """
    engine = get_engine()

    async with engine.begin() as conn:
        # Check existing columns
        result = await conn.execute(text("PRAGMA table_info(tasks)"))
        columns = {row[1] for row in result}

        # Add new columns if they don't exist
        if "start_time" not in columns:
            await conn.execute(text("ALTER TABLE tasks ADD COLUMN start_time DATETIME"))

        if "end_time" not in columns:
            await conn.execute(text("ALTER TABLE tasks ADD COLUMN end_time DATETIME"))

        if "is_fixed_time" not in columns:
            await conn.execute(text("ALTER TABLE tasks ADD COLUMN is_fixed_time BOOLEAN DEFAULT 0"))
            # Create index for efficient filtering
            await conn.execute(text("CREATE INDEX idx_tasks_is_fixed_time ON tasks(is_fixed_time)"))

        if "location" not in columns:
            await conn.execute(text("ALTER TABLE tasks ADD COLUMN location VARCHAR(500)"))

        if "attendees" not in columns:
            await conn.execute(text("ALTER TABLE tasks ADD COLUMN attendees JSON"))

        if "meeting_notes" not in columns:
            await conn.execute(text("ALTER TABLE tasks ADD COLUMN meeting_notes TEXT"))

        if "start_not_before" not in columns:
            await conn.execute(text("ALTER TABLE tasks ADD COLUMN start_not_before DATETIME"))

        if "progress" not in columns:
            await conn.execute(text("ALTER TABLE tasks ADD COLUMN progress INTEGER DEFAULT 0 NOT NULL"))

        if "order_in_parent" not in columns:
            await conn.execute(text("ALTER TABLE tasks ADD COLUMN order_in_parent INTEGER"))

        if "recurring_meeting_id" not in columns:
            await conn.execute(text("ALTER TABLE tasks ADD COLUMN recurring_meeting_id VARCHAR(36)"))
            await conn.execute(
                text("CREATE INDEX IF NOT EXISTS idx_tasks_recurring_meeting_id ON tasks(recurring_meeting_id)")
            )

        # Check checkins table for checkin_type
        checkin_result = await conn.execute(text("PRAGMA table_info(checkins)"))
        checkin_columns = {row[1] for row in checkin_result}
        if "checkin_type" not in checkin_columns:
            await conn.execute(
                text("ALTER TABLE checkins ADD COLUMN checkin_type VARCHAR(20) DEFAULT 'weekly'")
            )

        # Check users table for local auth fields
        user_result = await conn.execute(text("PRAGMA table_info(users)"))
        user_columns = {row[1] for row in user_result}
        if "username" not in user_columns:
            await conn.execute(text("ALTER TABLE users ADD COLUMN username VARCHAR(255)"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)"))
        if "password_hash" not in user_columns:
            await conn.execute(text("ALTER TABLE users ADD COLUMN password_hash VARCHAR(255)"))

        # Create recurring_meetings table if missing
        recurring_result = await conn.execute(
            text("SELECT name FROM sqlite_master WHERE type='table' AND name='recurring_meetings'")
        )
        if not recurring_result.scalar():
            await conn.execute(
                text(
                    """
                    CREATE TABLE recurring_meetings (
                        id VARCHAR(36) PRIMARY KEY,
                        user_id VARCHAR(255) NOT NULL,
                        project_id VARCHAR(36),
                        title VARCHAR(500) NOT NULL,
                        frequency VARCHAR(20) NOT NULL,
                        weekday INTEGER NOT NULL,
                        start_time VARCHAR(10) NOT NULL,
                        duration_minutes INTEGER NOT NULL,
                        location VARCHAR(500),
                        attendees JSON,
                        agenda_window_days INTEGER NOT NULL DEFAULT 7,
                        anchor_date DATE NOT NULL,
                        last_occurrence DATETIME,
                        is_active BOOLEAN DEFAULT 1,
                        created_at DATETIME,
                        updated_at DATETIME
                    )
                    """
                )
            )
            await conn.execute(
                text("CREATE INDEX idx_recurring_meetings_user_id ON recurring_meetings(user_id)")
            )
            await conn.execute(
                text("CREATE INDEX idx_recurring_meetings_project_id ON recurring_meetings(project_id)")
            )

        # check for meeting_agenda_items table
        agenda_result = await conn.execute(
            text("SELECT name FROM sqlite_master WHERE type='table' AND name='meeting_agenda_items'")
        )
        if not agenda_result.scalar():
            await conn.execute(
                text(
                    """
                    CREATE TABLE meeting_agenda_items (
                        id VARCHAR(36) PRIMARY KEY,
                        meeting_id VARCHAR(36) NOT NULL,
                        user_id VARCHAR(255) NOT NULL,
                        title VARCHAR(500) NOT NULL,
                        description TEXT,
                        duration_minutes INTEGER,
                        order_index INTEGER DEFAULT 0,
                        is_completed BOOLEAN DEFAULT 0,
                        event_date DATE,
                        created_at DATETIME,
                        updated_at DATETIME
                    )
                    """
                )
            )
            await conn.execute(
                text("CREATE INDEX idx_meeting_agenda_items_meeting_id ON meeting_agenda_items(meeting_id)")
            )
            await conn.execute(
                text("CREATE INDEX idx_meeting_agenda_items_user_id ON meeting_agenda_items(user_id)")
            )
            await conn.execute(
                text("CREATE INDEX idx_meeting_agenda_items_event_date ON meeting_agenda_items(event_date)")
            )
        else:
            # Check for event_date column
            agenda_cols_result = await conn.execute(text("PRAGMA table_info(meeting_agenda_items)"))
            agenda_columns = {row[1] for row in agenda_cols_result}
            
            if "event_date" not in agenda_columns:
                await conn.execute(text("ALTER TABLE meeting_agenda_items ADD COLUMN event_date DATE"))
                await conn.execute(
                    text("CREATE INDEX idx_meeting_agenda_items_event_date ON meeting_agenda_items(event_date)")
                )

        # Ensure chat session primary key is scoped by user_id.
        await _ensure_chat_sessions_composite_pk(conn)

        # Migrate existing [1], [2], [3] patterns to order_in_parent
        await _migrate_step_numbers_to_order(conn)

        # Ensure task_assignments supports multiple assignees per task.
        await _ensure_task_assignment_unique(conn)


async def _ensure_chat_sessions_composite_pk(conn):
    """
    Ensure chat_sessions uses a composite primary key (session_id, user_id).

    Older schemas used session_id as the sole primary key, which caused
    collisions across users. This migration rebuilds chat_sessions and
    chat_messages to reference the composite key.
    """
    table_result = await conn.execute(
        text("SELECT name FROM sqlite_master WHERE type='table' AND name='chat_sessions'")
    )
    if not table_result.scalar():
        return

    info_result = await conn.execute(text("PRAGMA table_info('chat_sessions')"))
    rows = info_result.fetchall()
    pk_columns = [row[1] for row in rows if row[5] > 0]
    if set(pk_columns) == {"session_id", "user_id"}:
        return

    await conn.execute(text("PRAGMA foreign_keys=OFF"))

    messages_table = await conn.execute(
        text("SELECT name FROM sqlite_master WHERE type='table' AND name='chat_messages'")
    )
    has_messages = bool(messages_table.scalar())
    if has_messages:
        await conn.execute(text("ALTER TABLE chat_messages RENAME TO chat_messages_old"))

    await conn.execute(text("ALTER TABLE chat_sessions RENAME TO chat_sessions_old"))

    await conn.execute(
        text(
            """
            CREATE TABLE chat_sessions (
                session_id VARCHAR(100) NOT NULL,
                user_id VARCHAR(255) NOT NULL,
                title VARCHAR(200),
                created_at DATETIME,
                updated_at DATETIME,
                PRIMARY KEY (session_id, user_id)
            )
            """
        )
    )
    await conn.execute(
        text("CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id ON chat_sessions(user_id)")
    )
    await conn.execute(
        text(
            """
            INSERT INTO chat_sessions (session_id, user_id, title, created_at, updated_at)
            SELECT session_id, user_id, title, created_at, updated_at
            FROM chat_sessions_old
            """
        )
    )

    await conn.execute(
        text(
            """
            CREATE TABLE chat_messages (
                id VARCHAR(36) PRIMARY KEY,
                session_id VARCHAR(100) NOT NULL,
                user_id VARCHAR(255) NOT NULL,
                role VARCHAR(20) NOT NULL,
                content TEXT NOT NULL DEFAULT '',
                created_at DATETIME,
                FOREIGN KEY (session_id, user_id)
                    REFERENCES chat_sessions(session_id, user_id)
                    ON DELETE CASCADE
            )
            """
        )
    )
    await conn.execute(
        text("CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON chat_messages(session_id)")
    )
    await conn.execute(
        text("CREATE INDEX IF NOT EXISTS idx_chat_messages_user_id ON chat_messages(user_id)")
    )
    await conn.execute(
        text("CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at)")
    )

    if has_messages:
        await conn.execute(
            text(
                """
                INSERT INTO chat_messages (
                    id, session_id, user_id, role, content, created_at
                )
                SELECT id, session_id, user_id, role, content, created_at
                FROM chat_messages_old
                """
            )
        )
        await conn.execute(text("DROP TABLE chat_messages_old"))

    await conn.execute(text("DROP TABLE chat_sessions_old"))
    await conn.execute(text("PRAGMA foreign_keys=ON"))


async def _ensure_task_assignment_unique(conn):
    """
    Ensure task_assignments has a UNIQUE constraint on (task_id, user_id, assignee_id).

    Older schemas used (task_id, user_id), which blocks multiple assignees.
    """
    result = await conn.execute(
        text("SELECT name FROM sqlite_master WHERE type='table' AND name='task_assignments'")
    )
    if not result.scalar():
        return

    desired = ["task_id", "user_id", "assignee_id"]
    index_list = await conn.execute(text("PRAGMA index_list('task_assignments')"))
    for row in index_list.fetchall():
        if not row[2]:
            continue
        index_name = row[1]
        index_info = await conn.execute(text(f"PRAGMA index_info('{index_name}')"))
        columns = [info_row[2] for info_row in index_info.fetchall()]
        if columns == desired:
            return

    await conn.execute(text("ALTER TABLE task_assignments RENAME TO task_assignments_old"))
    await conn.execute(
        text(
            """
            CREATE TABLE task_assignments (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(255) NOT NULL,
                task_id VARCHAR(36) NOT NULL,
                assignee_id VARCHAR(255) NOT NULL,
                status VARCHAR(20),
                progress INTEGER,
                created_at DATETIME,
                updated_at DATETIME,
                CONSTRAINT uq_task_assignment UNIQUE (task_id, user_id, assignee_id)
            )
            """
        )
    )
    await conn.execute(
        text(
            """
            INSERT INTO task_assignments (
                id, user_id, task_id, assignee_id, status, progress, created_at, updated_at
            )
            SELECT
                id, user_id, task_id, assignee_id, status, progress, created_at, updated_at
            FROM task_assignments_old
            """
        )
    )
    await conn.execute(text("DROP TABLE task_assignments_old"))
    await conn.execute(
        text("CREATE INDEX IF NOT EXISTS idx_task_assignments_user_id ON task_assignments(user_id)")
    )
    await conn.execute(
        text("CREATE INDEX IF NOT EXISTS idx_task_assignments_task_id ON task_assignments(task_id)")
    )
    await conn.execute(
        text("CREATE INDEX IF NOT EXISTS idx_task_assignments_assignee_id ON task_assignments(assignee_id)")
    )


async def _migrate_step_numbers_to_order(conn):
    """
    Migrate existing [1], [2], [3] step numbers from titles to order_in_parent field.

    Extracts step numbers from task titles like "[1] タスク名" and populates order_in_parent.
    Also removes the [N] prefix from the title for cleaner display.
    """
    # Get all tasks with parent_id (subtasks only)
    result = await conn.execute(
        text("SELECT id, title, parent_id FROM tasks WHERE parent_id IS NOT NULL AND order_in_parent IS NULL")
    )
    tasks = result.fetchall()

    step_number_pattern = re.compile(r'^\[(\d+)\]\s*')

    for task_id, title, parent_id in tasks:
        match = step_number_pattern.match(title)
        if match:
            step_number = int(match.group(1))
            # Remove [N] prefix from title
            clean_title = step_number_pattern.sub('', title)

            # Update order_in_parent and clean title
            await conn.execute(
                text("UPDATE tasks SET order_in_parent = :order, title = :title WHERE id = :id"),
                {"order": step_number, "title": clean_title, "id": task_id}
            )
