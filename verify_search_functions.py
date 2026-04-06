import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()
DB_URL = os.getenv("DATABASE_URL")

def check():
    print("🔍 [DEBUG] Verifying DB Search Functions...")
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    
    # 1. Check extension
    cur.execute("SELECT extname FROM pg_extension WHERE extname = 'pg_trgm';")
    if not cur.fetchone():
        print("❌ Extension pg_trgm IS NOT INSTALLED/ENABLED")
    else:
        print("✅ Extension pg_trgm is enabled.")
        
    # 2. Check similarity function signature
    try:
        cur.execute("SELECT similarity('test', 'test');")
        print(f"✅ similarity() function works: {cur.fetchone()[0]}")
    except Exception as e:
        print(f"❌ similarity() function failed: {e}")
        conn.rollback()

    # 3. Check for the specific word 'attention' in chat_messages
    cur.execute("SELECT COUNT(*) FROM chat_messages WHERE content ILIKE '%attention%';")
    print(f"✅ Records containing 'attention': {cur.fetchone()[0]}")

    # 4. Check for 'attension' (user typo)
    cur.execute("SELECT COUNT(*) FROM chat_messages WHERE content ILIKE '%attension%';")
    print(f"✅ Records containing 'attension': {cur.fetchone()[0]}")

    # 5. Check tsvector/tsquery
    try:
        cur.execute("SELECT to_tsvector('english', 'attention is all you need') @@ plainto_tsquery('english', 'attention');")
        print(f"✅ FTS (@@) works: {cur.fetchone()[0]}")
    except Exception as e:
        print(f"❌ FTS (@@) failed: {e}")
        conn.rollback()

    conn.close()

if __name__ == "__main__":
    check()
