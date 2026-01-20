"""
Migration: Make meeting_id nullable in meeting_agenda_items.

This allows agenda items to be associated with either:
- RecurringMeeting (via meeting_id)
- Standalone meeting task (via task_id)
"""
import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent / "secretary.db"


def migrate():
    """Make meeting_id nullable in meeting_agenda_items table."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    try:
        # Start transaction
        cursor.execute("BEGIN TRANSACTION")

        # Step 1: Create backup table
        print("Creating backup table...")
        cursor.execute("""
            CREATE TABLE meeting_agenda_items_backup AS
            SELECT * FROM meeting_agenda_items
        """)

        # Step 2: Drop original table
        print("Dropping original table...")
        cursor.execute("DROP TABLE meeting_agenda_items")

        # Step 3: Create new table with meeting_id nullable
        print("Creating new table with nullable meeting_id...")
        cursor.execute("""
            CREATE TABLE meeting_agenda_items (
                id VARCHAR(36) NOT NULL,
                meeting_id VARCHAR(36),
                task_id VARCHAR(36),
                user_id VARCHAR(255) NOT NULL,
                title VARCHAR(500) NOT NULL,
                description TEXT,
                duration_minutes INTEGER,
                order_index INTEGER NOT NULL,
                is_completed BOOLEAN,
                event_date DATE,
                created_at DATETIME,
                updated_at DATETIME,
                PRIMARY KEY (id)
            )
        """)

        # Step 4: Create indexes
        print("Creating indexes...")
        cursor.execute("CREATE INDEX ix_meeting_agenda_items_meeting_id ON meeting_agenda_items (meeting_id)")
        cursor.execute("CREATE INDEX ix_meeting_agenda_items_task_id ON meeting_agenda_items (task_id)")
        cursor.execute("CREATE INDEX ix_meeting_agenda_items_user_id ON meeting_agenda_items (user_id)")

        # Step 5: Migrate data
        print("Migrating data...")
        cursor.execute("""
            INSERT INTO meeting_agenda_items
            SELECT * FROM meeting_agenda_items_backup
        """)

        # Step 6: Drop backup table
        print("Dropping backup table...")
        cursor.execute("DROP TABLE meeting_agenda_items_backup")

        # Commit transaction
        conn.commit()
        print("Migration completed successfully!")

        # Verify new schema
        cursor.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='meeting_agenda_items'")
        result = cursor.fetchone()
        print("\nNew schema:")
        print(result[0])

    except Exception as e:
        print(f"Migration failed: {e}")
        conn.rollback()
        raise

    finally:
        conn.close()


if __name__ == "__main__":
    migrate()
