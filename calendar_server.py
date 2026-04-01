from mcp.server.fastmcp import FastMCP
from typing import Dict
import uuid
import json
import os
from datetime import datetime, timedelta
import psycopg2

# Initialize MCP Server
mcp = FastMCP("LocalCalendar")

# =====================================================
# ENV + DB CONFIG
# =====================================================
RAIL_DB = "postgresql://postgres:GFRjPEYImcWwwfcSArNMJdabKtSVTfkj@caboose.proxy.rlwy.net:30023/railway"

current_dir = os.path.dirname(os.path.abspath(__file__))
DB_FILE = os.path.join(current_dir, "calendar_db.json")

# =====================================================
# ✅ FIXED POSTGRES SYNC (NO RESET BUG)
# =====================================================
def sync_to_postgres():
    if not RAIL_DB:
        print("⚠️ RAIL_DB not set, skipping sync")
        return

    try:
        conn = psycopg2.connect(RAIL_DB)
        cur = conn.cursor()

        # Ensure table exists
        cur.execute("""
        CREATE TABLE IF NOT EXISTS events (
            id SERIAL PRIMARY KEY,
            title TEXT,
            event_time TIMESTAMP,
            description TEXT,
            reminded BOOLEAN DEFAULT FALSE
        );
        """)

        if not os.path.exists(DB_FILE):
            return

        with open(DB_FILE, "r") as f:
            db_data = json.load(f)

        # 🔥 Insert ONLY new events (no delete)
        for _, info in db_data.items():

            cur.execute("""
            SELECT id FROM events
            WHERE title = %s AND event_time = %s;
            """, (info["title"], info["event_time"]))

            exists = cur.fetchone()

            if not exists:
                cur.execute("""
                INSERT INTO events (title, event_time, description, reminded)
                VALUES (%s, %s, %s, %s);
                """, (
                    info["title"],
                    info["event_time"],
                    info.get("description", ""),
                    False
                ))

        conn.commit()
        cur.close()
        conn.close()

        print("☁️ Synced safely (no reminder reset) ✅")

    except Exception as e:
        print("❌ Postgres Sync Error:", e)

# =====================================================
# PERSISTENT DATABASE LOGIC
# =====================================================
def prune_db():
    if not os.path.exists(DB_FILE):
        return

    try:
        with open(DB_FILE, "r") as f:
            db = json.load(f)
    except:
        return

    now = datetime.now()
    threshold = now - timedelta(days=2)

    pruned_db = {}

    for eid, info in db.items():
        try:
            event_time = datetime.strptime(info['event_time'], "%Y-%m-%d %H:%M:%S")
            if event_time >= threshold:
                pruned_db[eid] = info
        except:
            pruned_db[eid] = info

    with open(DB_FILE, "w") as f:
        json.dump(pruned_db, f, indent=4)

def load_db() -> Dict[str, dict]:
    prune_db()
    if os.path.exists(DB_FILE):
        try:
            with open(DB_FILE, "r") as f:
                return json.load(f)
        except:
            return {}
    return {}

def save_db(data: Dict[str, dict]):
    with open(DB_FILE, "w") as f:
        json.dump(data, f, indent=4)

    prune_db()
    sync_to_postgres()

# =====================================================
# SMART TOOLS
# =====================================================
@mcp.tool()
def add_event(title: str, event_time: str, description: str = "") -> str:
    db = load_db()

    try:
        datetime.strptime(event_time, "%Y-%m-%d %H:%M:%S")
    except:
        return "❌ Invalid format. Use YYYY-MM-DD HH:MM:SS"

    event_id = str(uuid.uuid4())[:8]

    db[event_id] = {
        "title": title,
        "event_time": event_time,
        "description": description
    }

    save_db(db)
    return f"✅ Event '{title}' added at {event_time}"

@mcp.tool()
def get_events() -> str:
    db = load_db()
    if not db:
        return "No events available."

    sorted_items = sorted(db.items(), key=lambda x: x[1]['event_time'])

    lines = []
    for eid, info in sorted_items:
        lines.append(f"{eid} | {info['event_time']} | {info['title']}")

    return "\n".join(lines)

@mcp.tool()
def delete_event(event_id: str) -> str:
    db = load_db()

    if event_id in db:
        title = db[event_id]['title']
        del db[event_id]
        save_db(db)
        return f"🗑️ Deleted: {title}"

    return "❌ Not found"

@mcp.tool()
def update_event(event_id: str, title: str = None, event_time: str = None, description: str = None) -> str:
    db = load_db()

    if event_id not in db:
        return "❌ Not found"

    if title:
        db[event_id]['title'] = title

    if event_time:
        try:
            datetime.strptime(event_time, "%Y-%m-%d %H:%M:%S")
            db[event_id]['event_time'] = event_time
        except:
            return "❌ Invalid time format"

    if description:
        db[event_id]['description'] = description

    save_db(db)
    return "✅ Updated"

# =====================================================
# RUN SERVER
# =====================================================
if __name__ == "__main__":
    prune_db()
    sync_to_postgres()
    mcp.run(transport='stdio')