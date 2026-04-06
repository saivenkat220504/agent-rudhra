import os
import psycopg2
import json
from dotenv import load_dotenv

# We import these to handle message types correctly
try:
    from langchain_core.messages import HumanMessage, AIMessage
except ImportError:
    # Fallback if langchain isn't available in this environment
    class HumanMessage: pass
    class AIMessage: pass

load_dotenv()
DB_URL = os.getenv("DATABASE_URL")

def sync():
    print("🔎 [SYNC] Starting Deep Search Indexing...")
    try:
        conn = psycopg2.connect(DB_URL)
        cur = conn.cursor()
    except Exception as e:
        print(f"❌ [SYNC] DB Connection Failed: {e}")
        return
    
    # 1. FORCE FIX SCHEMA (Final resolve for UUID vs TEXT mismatch)
    print("🛠️ [SYNC] Standardizing Schema (IDs -> TEXT)...")
    try:
        # Drop constraints first or type change will fail
        cur.execute("ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_thread_id_fkey;")
        cur.execute("ALTER TABLE chat_download_configs DROP CONSTRAINT IF EXISTS chat_download_configs_thread_id_fkey;")
        cur.execute("ALTER TABLE chat_attachments DROP CONSTRAINT IF EXISTS chat_attachments_thread_id_fkey;")
        
        # Cast all to TEXT
        cur.execute("ALTER TABLE chat_threads ALTER COLUMN thread_id TYPE TEXT USING thread_id::text;")
        cur.execute("ALTER TABLE chat_messages ALTER COLUMN thread_id TYPE TEXT USING thread_id::text;")
        cur.execute("ALTER TABLE chat_download_configs ALTER COLUMN thread_id TYPE TEXT USING thread_id::text;")
        cur.execute("ALTER TABLE chat_attachments ALTER COLUMN thread_id TYPE TEXT USING thread_id::text;")
        
        # Re-apply FK
        cur.execute("ALTER TABLE chat_messages ADD CONSTRAINT chat_messages_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES chat_threads(thread_id) ON DELETE CASCADE;")
        conn.commit()
    except Exception as e:
        print(f"⚠️ [SYNC] Schema Warning: {e}")
        conn.rollback()

    # 2. CLEAR PREVIOUS SEARCH TABLE (Prevent duplications)
    cur.execute("DELETE FROM chat_messages;")
    conn.commit()

    # 3. FETCH EXISTING THREADS
    cur.execute("SELECT thread_id FROM chat_threads;")
    threads = cur.fetchall()
    print(f"📚 [SYNC] Found {len(threads)} threads to re-index.")

    # 4. DEEP EXTRACT FROM LANGGRAPH
    from langgraph.checkpoint.postgres import PostgresSaver
    
    total_msgs = 0
    with PostgresSaver.from_conn_string(DB_URL) as saver:
        for (tid,) in threads:
            try:
                state = saver.get_state(config={"configurable": {"thread_id": tid}})
                messages = state.values.get("messages", [])
                count = 0
                for m in messages:
                    # Determine role
                    # LangGraph stores messages as objects with .type attribute
                    m_type = getattr(m, "type", "assistant")
                    role = "user" if m_type == "human" else "assistant"
                    
                    # Extract content (handle lists for vision models)
                    content = getattr(m, "content", "")
                    if isinstance(content, list):
                        # Extract the text part from multimodal inputs
                        content = " ".join([c.get("text", "") for c in content if isinstance(c, dict) and c.get("type") == "text"])
                    
                    if not content or not isinstance(content, str): continue
                    
                    cur.execute("INSERT INTO chat_messages (thread_id, role, content) VALUES (%s, %s, %s);", (tid, role, content))
                    count += 1
                
                conn.commit()
                total_msgs += count
                print(f"   ✅ Thread [{tid}]: {count} messages indexed.")
            except Exception as thread_err:
                import traceback
                print(f"   ❌ Error in Thread [{tid}]: {thread_err}")
                traceback.print_exc()
                conn.rollback()
    
    print(f"\n✨ [SYNC COMPLETE] Total Messages Searchable: {total_msgs}")
    conn.close()

if __name__ == "__main__":
    sync()
