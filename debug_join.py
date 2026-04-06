import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()
DB_URL = os.getenv("DATABASE_URL")

def debug():
    print("🔍 [DEBUG] Checking Join Integrity...")
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    
    # 1. Find the attension records
    cur.execute("SELECT thread_id, content FROM chat_messages WHERE content ILIKE '%attension%';")
    rows = cur.fetchall()
    print(f"Found {len(rows)} messages with 'attension' in chat_messages.")
    
    for tid, content in rows:
        print(f"  [MSG] tid: {tid} | content: {content[:30]}...")
        # Check if this tid exists in chat_threads
        cur.execute("SELECT title FROM chat_threads WHERE thread_id = %s;", (tid,))
        thread = cur.fetchone()
        if thread:
            print(f"    ✅ MATCH FOUND in chat_threads: {thread[0]}")
        else:
            print(f"    ❌ ORPHAN: thread_id {tid} NOT FOUND in chat_threads!")
            
    conn.close()

if __name__ == "__main__":
    debug()
