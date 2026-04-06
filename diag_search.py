import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()
DB_URL = os.getenv("DATABASE_URL")

def diag():
    print("🔎 [DIAG] Checking Search Infrastructure...")
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    
    # 1. Search Path
    cur.execute("SHOW search_path;")
    print(f"   [SEARCH PATH]: {cur.fetchone()[0]}")
    
    # 2. pg_trgm location
    cur.execute("SELECT n.nspname FROM pg_extension e JOIN pg_namespace n ON e.extnamespace = n.oid WHERE e.extname = 'pg_trgm';")
    ext_schema = cur.fetchone()
    print(f"   [PG_TRGM SCHEMA]: {ext_schema[0] if ext_schema else 'NOT FOUND'}")
    
    # 3. List similarity functions
    try:
        cur.execute("SELECT routine_schema, routine_name FROM information_schema.routines WHERE routine_name = 'similarity';")
        routines = cur.fetchall()
        print(f"   [SIMILARITY FUNCTIONS]: {routines}")
    except Exception as e:
        print(f"   [SIMILARITY CHECK ERR]: {e}")
        conn.rollback()

    # 4. Test similarity call with explicit schema
    if ext_schema:
        schema = ext_schema[0]
        try:
            cur.execute(f"SELECT {schema}.similarity('test', 'test');")
            print(f"   ✅ {schema}.similarity() works: {cur.fetchone()[0]}")
        except Exception as e:
            print(f"   ❌ {schema}.similarity() failed: {e}")
            conn.rollback()

    # 5. Check if search term actually exists in chat_messages
    cur.execute("SELECT COUNT(*) FROM chat_messages WHERE content ILIKE '%attention%';")
    print(f"   [DATA]: Records with 'attention': {cur.fetchone()[0]}")
    cur.execute("SELECT COUNT(*) FROM chat_messages WHERE content ILIKE '%attension%';")
    print(f"   [DATA]: Records with 'attension': {cur.fetchone()[0]}")

    conn.close()

if __name__ == "__main__":
    diag()
