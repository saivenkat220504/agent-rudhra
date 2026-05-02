"""
Plan and Study — Database Layer
Syncs to both LOCAL and REMOTE PostgreSQL databases.
"""

import os
import uuid
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

load_dotenv()

# LOCAL: reads DATABASE_URL (localhost)
# REMOTE: reads RAIL_DB (Railway cloud instance)
LOCAL_DB  = os.getenv("DATABASE_URL", "postgresql://postgres:venkat@localhost:5432/DB_Rudhra")
REMOTE_DB = "postgresql://postgres:yTxVktHgveZnJMhvFdSJRoZXCztBnZZH@shinkansen.proxy.rlwy.net:29153/railway"

if not REMOTE_DB:
    print("[DB] WARNING: RAIL_DB env var not set — remote sync DISABLED")

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS tasks (
    id SERIAL PRIMARY KEY,
    subject_name VARCHAR(100) NOT NULL,
    topic_name VARCHAR(100) NOT NULL,
    deadline TIMESTAMP NOT NULL
);
"""


def _connect(url, label=""):
    if not url:
        print(f"[DB] Skipping {label} — URL is empty")
        return None
    try:
        conn = psycopg2.connect(url, connect_timeout=10)
        print(f"[DB] Connected to {label or url[:40]}")
        return conn
    except Exception as e:
        print(f"[DB] ❌ Connection FAILED for {label or url[:40]}: {e}")
        return None


def _ensure_schema(conn):
    if not conn:
        return
    try:
        with conn.cursor() as cur:
            cur.execute(SCHEMA_SQL)
        conn.commit()
    except Exception as e:
        print(f"[DB] Schema init error: {e}")
        conn.rollback()


def init_plan_schema():
    """Initialize tables on both DBs."""
    for url, label in [(LOCAL_DB, "LOCAL"), (REMOTE_DB, "REMOTE")]:
        conn = _connect(url, label)
        if conn:
            _ensure_schema(conn)
            conn.close()
            print(f"[DB] ✅ Schema ready on {label}")


# ─── Data Access Methods ──────────────────────────────────────

def db_get_all_plans():
    """Fetch all tasks and group them into a single virtual plan."""
    for url, label in [(REMOTE_DB, "REMOTE"), (LOCAL_DB, "LOCAL")]:
        conn = _connect(url, label)
        if not conn:
            continue
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("SELECT * FROM tasks ORDER BY deadline ASC;")
                tasks = [dict(r) for r in cur.fetchall()]
                
                # Group by subject_name
                subjects_map = {}
                for t in tasks:
                    sub = t["subject_name"]
                    if sub not in subjects_map:
                        subjects_map[sub] = {"id": sub, "subject_name": sub, "chat_thread_id": f"chat_{sub}", "chapters": []}
                    subjects_map[sub]["chapters"].append({
                        "id": t["id"],
                        "chapter_name": t["topic_name"],
                        "deadline": t["deadline"]
                    })
                
                if not subjects_map:
                    conn.close()
                    return []
                
                plan = {
                    "id": 1,
                    "plan_name": "My Study Plan",
                    "num_days": 30,
                    "subjects": list(subjects_map.values())
                }
            conn.close()
            return [plan]
        except Exception as e:
            print(f"[DB] get_all_plans error on {label}: {e}")
            conn.close()
    return []


def db_create_plan(plan_name: str, num_days: int, subjects: list):
    """Insert tasks for the new plan."""
    result = {"id": 1, "subjects": []}

    for url, label in [(LOCAL_DB, "LOCAL"), (REMOTE_DB, "REMOTE")]:
        conn = _connect(url, label)
        if not conn:
            continue
        try:
            with conn.cursor() as cur:
                for sub in subjects:
                    for ch in sub.get("chapters", []):
                        cur.execute(
                            "INSERT INTO tasks (subject_name, topic_name, deadline) VALUES (%s, %s, %s);",
                            (sub["subject_name"], ch["chapter_name"], ch["deadline"])
                        )
            conn.commit()
            conn.close()
        except Exception as e:
            print(f"[DB] ❌ create_plan error on {label}: {e}")
            conn.rollback()
            conn.close()

    return result


def db_delete_plan(plan_id: int):
    """Delete all tasks."""
    for url, label in [(LOCAL_DB, "LOCAL"), (REMOTE_DB, "REMOTE")]:
        conn = _connect(url, label)
        if not conn:
            continue
        try:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM tasks;")
            conn.commit()
            conn.close()
        except Exception as e:
            print(f"[DB] ❌ delete_plan error on {label}: {e}")
            conn.rollback()
            conn.close()


def db_create_subject(plan_id: int, subject_name: str, chapters: list):
    """Add tasks for a new subject."""
    result = {}
    for url, label in [(LOCAL_DB, "LOCAL"), (REMOTE_DB, "REMOTE")]:
        conn = _connect(url, label)
        if not conn:
            continue
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                for ch in chapters:
                    cur.execute(
                        "INSERT INTO tasks (subject_name, topic_name, deadline) VALUES (%s, %s, %s);",
                        (subject_name, ch["chapter_name"], ch["deadline"])
                    )
            conn.commit()
            conn.close()
        except Exception as e:
            print(f"[DB] ❌ create_subject error on {label}: {e}")
            conn.rollback()
            conn.close()
    return result


def db_delete_subject(subject_name: str):
    """Delete tasks by subject_name."""
    for url, label in [(LOCAL_DB, "LOCAL"), (REMOTE_DB, "REMOTE")]:
        conn = _connect(url, label)
        if not conn:
            continue
        try:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM tasks WHERE subject_name = %s;", (subject_name,))
            conn.commit()
            conn.close()
        except Exception as e:
            print(f"[DB] ❌ delete_subject error on {label}: {e}")
            conn.rollback()
            conn.close()


def db_create_chapter(subject_name: str, chapter_name: str, deadline: str):
    """Add a chapter task."""
    result = {}
    for url, label in [(LOCAL_DB, "LOCAL"), (REMOTE_DB, "REMOTE")]:
        conn = _connect(url, label)
        if not conn:
            continue
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    "INSERT INTO tasks (subject_name, topic_name, deadline) VALUES (%s, %s, %s) RETURNING *;",
                    (subject_name, chapter_name, deadline)
                )
                ch = dict(cur.fetchone())
                if not result:
                    result = ch
            conn.commit()
            conn.close()
        except Exception as e:
            print(f"[DB] ❌ create_chapter error on {label}: {e}")
            conn.rollback()
            conn.close()
    return result


def db_delete_chapter(chapter_id: int):
    """Delete a single task."""
    for url, label in [(LOCAL_DB, "LOCAL"), (REMOTE_DB, "REMOTE")]:
        conn = _connect(url, label)
        if not conn:
            continue
        try:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM tasks WHERE id = %s;", (chapter_id,))
            conn.commit()
            conn.close()
        except Exception as e:
            print(f"[DB] ❌ delete_chapter error on {label}: {e}")
            conn.rollback()
            conn.close()



