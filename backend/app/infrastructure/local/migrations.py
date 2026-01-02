"""
Database schema migration helpers.

This module provides utilities for managing SQLite database schema migrations.
"""

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
