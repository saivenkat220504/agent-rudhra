
from mcp.server.fastmcp import FastMCP
from typing import Dict
import uuid
import json
import os
from datetime import datetime, timedelta
import psycopg2
import sys
import builtins
from dateutil import parser

# MCP-safe logging
_original_print = builtins.print
def _stderr_print(*args, **kwargs):
    kwargs.setdefault('file', sys.stderr)
    _original_print(*args, **kwargs)
builtins.print = _stderr_print

mcp = FastMCP("LocalCalendar")

RAIL_DB = "postgresql://postgres:IYxgKIqlovTWPaXxCdaUhGtGRZrARVIy@gondola.proxy.rlwy.net:42551/railway"

current_dir = os.path.dirname(os.path.abspath(__file__))
DB_FILE = os.path.join(current_dir, "calendar_db.json")

print("🚀 MCP Calendar Server Booting...")

# =====================================================
# 🔥 POSTGRES SYNC (FIXED PROPERLY)
# =====================================================
def sync_to_postgres():
    print("\n🔥 [SYNC STARTED]")

    try:
        conn = psycopg2.connect(RAIL_DB)
        cur = conn.cursor()
        print("✅ Connected to Postgres")

        # Create table if not exists
        cur.execute("""
        CREATE TABLE IF NOT EXISTS events (
            id SERIAL PRIMARY KEY,
            title TEXT,
            event_time TIMESTAMP,
            description TEXT,
            reminded BOOLEAN DEFAULT FALSE
        );
        """)

        # 🔥 Ensure UNIQUE constraint exists
        cur.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint 
                WHERE conname = 'unique_event_constraint'
            ) THEN
                ALTER TABLE events
                ADD CONSTRAINT unique_event_constraint UNIQUE (title, event_time);
            END IF;
        END$$;
        """)

        if not os.path.exists(DB_FILE):
            print("⚠️ No JSON DB found")
            return

        with open(DB_FILE, "r") as f:
            db_data = json.load(f)

        print(f"📦 Syncing {len(db_data)} events...")

        for eid, info in db_data.items():
            print(f"\n🔍 Processing: {info['title']}")

            event_time_obj = datetime.strptime(
                info["event_time"], "%Y-%m-%d %H:%M:%S"
            )

            cur.execute("""
            INSERT INTO events (title, event_time, description, reminded)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (title, event_time) DO NOTHING;
            """, (
                info["title"],
                event_time_obj,
                info.get("description", ""),
                False
            ))

            print("✅ Insert attempted")

        conn.commit()
        print("💾 Commit successful")

        cur.close()
        conn.close()

    except Exception as e:
        print("❌ POSTGRES ERROR:", e)

    print("🔥 [SYNC ENDED]\n")


# =====================================================
# DB LOGIC
# =====================================================
def prune_db():
    if not os.path.exists(DB_FILE):
        return

    with open(DB_FILE, "r") as f:
        db = json.load(f)

    now = datetime.now()
    threshold = now - timedelta(days=2)

    new_db = {}

    for eid, info in db.items():
        try:
            event_time = datetime.strptime(info['event_time'], "%Y-%m-%d %H:%M:%S")
            if event_time >= threshold:
                new_db[eid] = info
        except:
            new_db[eid] = info

    with open(DB_FILE, "w") as f:
        json.dump(new_db, f, indent=4)


def load_db():
    prune_db()
    if os.path.exists(DB_FILE):
        with open(DB_FILE, "r") as f:
            return json.load(f)
    return {}


def save_db(data):
    with open(DB_FILE, "w") as f:
        json.dump(data, f, indent=4)

    import threading
    threading.Thread(target=sync_to_postgres, daemon=True).start()


# =====================================================
# 🔥 TIME PARSER
# =====================================================
def parse_datetime(event_time: str):
    print("🧠 Parsing:", event_time)

    try:
        return datetime.strptime(event_time, "%Y-%m-%d %H:%M:%S")
    except:
        try:
            dt = parser.parse(event_time, fuzzy=True)
            dt = dt.replace(second=0)
            print("✅ Parsed NL:", dt)
            return dt
        except Exception as e:
            print("❌ Parse failed:", e)
            return None


# =====================================================
# TOOLS
# =====================================================
@mcp.tool()
def add_event(title: str, event_time: str, description: str = "") -> str:
    print("\n🚀 ADD EVENT")

    dt = parse_datetime(event_time)
    if not dt:
        return "❌ Invalid date/time format. Please use YYYY-MM-DD HH:MM:SS or natural language."

    event_time_str = dt.strftime("%Y-%m-%d %H:%M:%S")

    # 1. Update JSON DB
    db = load_db()
    for e in db.values():
        if e["title"] == title and e["event_time"] == event_time_str:
            return "⚠️ Event already exists in the calendar."

    eid = str(uuid.uuid4())[:8]
    db[eid] = {"title": title, "event_time": event_time_str, "description": description}
    with open(DB_FILE, "w") as f:
        json.dump(db, f, indent=4)

    # 2. Update PostgreSQL directly
    try:
        conn = psycopg2.connect(RAIL_DB)
        cur = conn.cursor()
        
        cur.execute("""
        CREATE TABLE IF NOT EXISTS events (
            id SERIAL PRIMARY KEY,
            title TEXT,
            event_time TIMESTAMP,
            description TEXT,
            reminded BOOLEAN DEFAULT FALSE
        );
        """)
        
        cur.execute("SELECT 1 FROM events WHERE title = %s AND event_time = %s", (title, dt))
        if not cur.fetchone():
            cur.execute("""
            INSERT INTO events (title, event_time, description, reminded)
            VALUES (%s, %s, %s, %s)
            """, (title, dt, description, False))
            conn.commit()
            pg_status = "(Synced to PostgreSQL successfully)"
        else:
            pg_status = "(Already exists in PostgreSQL)"
            
        cur.close()
        conn.close()
    except Exception as e:
        print("❌ POSTGRES ERROR:", e)
        pg_status = f"(PostgreSQL sync failed: {str(e)[:50]})"
        
    return f"✅ Event '{title}' scheduled for {event_time_str}. {pg_status}"

@mcp.tool()
def get_events() -> str:
    db = load_db()
    if not db:
        return "No events"

    return "\n".join([
        f"{eid} | {v['event_time']} | {v['title']}"
        for eid, v in db.items()
    ])


# =====================================================
# RUN
# =====================================================
if __name__ == "__main__":
    print("🚀 Starting MCP Server...")
    sync_to_postgres()
    mcp.run(transport='stdio')
