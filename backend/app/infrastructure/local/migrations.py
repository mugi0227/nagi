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

        if "progress" not in columns:
            await conn.execute(text("ALTER TABLE tasks ADD COLUMN progress INTEGER DEFAULT 0 NOT NULL"))

        if "order_in_parent" not in columns:
            await conn.execute(text("ALTER TABLE tasks ADD COLUMN order_in_parent INTEGER"))

        # Migrate existing [1], [2], [3] patterns to order_in_parent
        await _migrate_step_numbers_to_order(conn)


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
