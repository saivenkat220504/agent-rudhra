import asyncio
import os
import sys

# Ensure we can import from the current directory
sys.path.append(os.getcwd())

from api_server import db, agent_core
from langchain_core.messages import HumanMessage, AIMessage

async def restore_search():
    print("\n🔎 [RESTORE] Starting Full History Indexing...")
    
    # 1. Initialize the agent (if not already)
    if not agent_core.ready:
        print("🧠 [RESTORE] Initializing Agent Core (First-time setup)...")
        await agent_core.initialize()
    
    if not agent_core.ready or not agent_core.chatbot:
        print("❌ [RESTORE] Failed to initialize Agent. Search cannot be restored.")
        return

    # 2. Force Fix Schema (IDs)
    print("🛠️ [RESTORE] Standardizing Database Schema...")
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_thread_id_fkey;")
                cur.execute("ALTER TABLE chat_threads ALTER COLUMN thread_id TYPE TEXT USING thread_id::text;")
                cur.execute("ALTER TABLE chat_messages ALTER COLUMN thread_id TYPE TEXT USING thread_id::text;")
                cur.execute("ALTER TABLE chat_messages ADD CONSTRAINT chat_messages_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES chat_threads(thread_id) ON DELETE CASCADE;")
                conn.commit()
    except Exception as e:
        print(f"⚠️ [RESTORE] Schema Note: {e}")

    # 3. Clear existing index
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM chat_messages;")
                conn.commit()
    except Exception: pass

    # 4. Deep Index Threads
    threads = db.get_all_threads()
    print(f"📚 [RESTORE] Found {len(threads)} chat threads.")
    
    total_indexed = 0
    for t in threads:
        tid = t["thread_id"]
        title = t["title"]
        try:
            # Use LangGraph's actual state retriever
            state = agent_core.chatbot.get_state(config={"configurable": {"thread_id": tid}})
            messages = state.values.get("messages", [])
            
            count = 0
            for m in messages:
                m_type = getattr(m, "type", "assistant")
                role = "user" if m_type == "human" else "assistant"
                content = getattr(m, "content", "")
                
                # Handle multimodal content
                if isinstance(content, list):
                    content = " ".join([c.get("text", "") for c in content if isinstance(c, dict) and c.get("type") == "text"])
                
                if not content or not isinstance(content, str): continue
                
                db.save_plain_text_message(tid, role, content)
                count += 1
            
            total_indexed += count
            print(f"   ✅ Thread [{title[:20]}...]: {count} messages indexed.")
        except Exception as e:
            print(f"   ❌ Thread [{tid}] Failed: {e}")

    print(f"\n✨ [RESTORE COMPLETE] {total_indexed} messages are now searchable!")
    print("💡 TIP: You can now search for your previous chats in the sidebar.")

if __name__ == "__main__":
    asyncio.run(restore_search())
