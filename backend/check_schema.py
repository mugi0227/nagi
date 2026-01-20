"""Check meeting_agenda_items schema and fix NOT NULL constraint."""
import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent / "secretary.db"

def check_schema():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Get table schema
    cursor.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='meeting_agenda_items'")
    result = cursor.fetchone()

    if result:
        print("Current schema:")
        print(result[0])
    else:
        print("Table 'meeting_agenda_items' not found")

    conn.close()

if __name__ == "__main__":
    check_schema()
