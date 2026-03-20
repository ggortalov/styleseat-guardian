"""
One-time migration: strip leading TestRail IDs (e.g. 'C1647217 ') from all test case titles.
"""
import re
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "app.db")
PATTERN = re.compile(r"^C\d+\s*")


def main():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    cur.execute("SELECT id, title FROM test_cases WHERE title LIKE 'C%'")
    rows = cur.fetchall()

    updated = 0
    for case_id, title in rows:
        new_title = PATTERN.sub("", title).strip()
        if new_title != title:
            cur.execute("UPDATE test_cases SET title = ? WHERE id = ?", (new_title, case_id))
            updated += 1

    conn.commit()
    conn.close()
    print(f"Stripped TestRail IDs from {updated} / {len(rows)} test case titles.")


if __name__ == "__main__":
    main()