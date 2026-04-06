import os
import psycopg2
from psycopg2.extras import RealDictCursor
from langgraph.checkpoint.postgres import PostgresSaver
from dotenv import load_dotenv

load_dotenv()

# Get the verified URL from your .env
DB_URL = os.getenv("DATABASE_URL")

class DatabaseManager:
    def __init__(self):
        self.url = DB_URL
        self._initialize_schema()

    def _initialize_schema(self):
        """Creates required tables if they don't exist and migrates types."""
        try:
            with self.get_connection() as conn:
                with conn.cursor() as cur:
                    # 1. DROP ALL POTENTIAL CONSTRAINTS (Prevent UUID vs TEXT conflicts)
                    constraints_to_drop = [
                        ("chat_download_configs", "chat_download_configs_thread_id_fkey"),
                        ("chat_attachments", "chat_attachments_thread_id_fkey"),
                        ("chat_messages", "chat_messages_thread_id_fkey")
                    ]
                    for table, constr in constraints_to_drop:
                        try:
                            cur.execute(f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS {constr};")
                            conn.commit()
                        except Exception:
                            conn.rollback()

                    # 2. CONVERT ALL thread_id COLUMNS TO TEXT (Aggressive Cast)
                    tables_to_migrate = ["chat_threads", "chat_download_configs", "chat_attachments", "chat_messages"]
                    for table in tables_to_migrate:
                        try:
                            # Check if table exists first
                            cur.execute(f"SELECT 1 FROM information_schema.tables WHERE table_name = '{table}';")
                            if cur.fetchone():
                                cur.execute(f"ALTER TABLE {table} ALTER COLUMN thread_id TYPE TEXT USING thread_id::text;")
                                conn.commit()
                        except Exception:
                            conn.rollback() 
                    
                    # 3. ENSURE TABLES EXIST
                    cur.execute("""
                        CREATE TABLE IF NOT EXISTS chat_download_configs (
                            thread_id TEXT PRIMARY KEY,
                            pdf_path TEXT NOT NULL,
                            last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                        );
                    """)
                    cur.execute("""
                        CREATE TABLE IF NOT EXISTS chat_threads (
                            thread_id TEXT PRIMARY KEY,
                            title TEXT,
                            user_id TEXT,
                            last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                        );
                    """)
                    # 4. CHAT MESSAGES FOR FULL-TEXT SEARCH
                    cur.execute("""
                        CREATE TABLE IF NOT EXISTS chat_messages (
                            id SERIAL PRIMARY KEY,
                            thread_id TEXT REFERENCES chat_threads(thread_id) ON DELETE CASCADE,
                            role TEXT,
                            content TEXT,
                            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                        );
                    """)
                    cur.execute("CREATE INDEX IF NOT EXISTS idx_chat_messages_content_fts ON chat_messages USING GIN (to_tsvector('english', content));")
                    conn.commit()
                print("[DB] Database Schema Initialized & Migrated.")
        except Exception as e:
            print(f"!! DB Schema Warning: {e}")

    def get_connection(self):
        """Returns a standard psycopg2 connection for synchronous tasks."""
        return psycopg2.connect(self.url)

    # --------------------------------------------------
    # THREAD & SIDEBAR LOGIC
    # --------------------------------------------------
    def save_chat_thread(self, thread_id, title, user_id="default_user"):
        """Registers or updates a chat thread in the 'chat_threads' table."""
        query = """
        INSERT INTO chat_threads (thread_id, title, user_id, last_updated)
        VALUES (%s, %s, %s, CURRENT_TIMESTAMP)
        ON CONFLICT (thread_id) 
        DO UPDATE SET title = EXCLUDED.title, last_updated = CURRENT_TIMESTAMP;
        """
        try:
            with self.get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(query, (thread_id, title, user_id))
                conn.commit()
        except Exception as e:
            print(f"Error saving chat thread: {e}")

    def get_all_threads(self, user_id="default_user"):
        """Fetches all threads for the sidebar."""
        query = "SELECT thread_id, title FROM chat_threads WHERE user_id = %s ORDER BY last_updated DESC;"
        try:
            with self.get_connection() as conn:
                with conn.cursor(cursor_factory=RealDictCursor) as cur:
                    cur.execute(query, (user_id,))
                    return cur.fetchall()
        except Exception as e:
            print(f"Error fetching threads: {e}")
            return []

    def get_chat_history(self, user_id="default_user"):
        """Alias for get_all_threads for backward compatibility."""
        return self.get_all_threads(user_id)

    def get_chat_messages(self, thread_id):
        """Fallback: Return empty list to prevent crash. Actual history handled via LangGraph."""
        return []

    def update_chat_title(self, thread_id, new_title):
        """Updates the title of an existing chat thread."""
        query = "UPDATE chat_threads SET title = %s, last_updated = CURRENT_TIMESTAMP WHERE thread_id = %s;"
        try:
            with self.get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(query, (new_title, thread_id))
                conn.commit()
                print(f"✅ Thread {thread_id} renamed to: {new_title}")
        except Exception as e:
            print(f"Error updating chat title: {e}")

    def delete_chat_thread(self, thread_id):
        """Deletes a thread and all its associated data (cascading cleanup)."""
        try:
            with self.get_connection() as conn:
                with conn.cursor() as cur:
                    # 1. Delete associated images/attachments
                    cur.execute("DELETE FROM chat_attachments WHERE thread_id = %s;", (thread_id,))
                    
                    # 2. Delete Download Configs (the PDF paths)
                    cur.execute("DELETE FROM chat_download_configs WHERE thread_id = %s;", (thread_id,))

                    # 3. Delete LangGraph checkpoints (history)
                    cur.execute("DELETE FROM checkpoints WHERE thread_id = %s;", (thread_id,))
                    cur.execute("DELETE FROM checkpoint_blobs WHERE thread_id = %s;", (thread_id,))
                    cur.execute("DELETE FROM checkpoint_writes WHERE thread_id = %s;", (thread_id,))
                    
                    # 4. Delete the search index messages
                    cur.execute("DELETE FROM chat_messages WHERE thread_id = %s;", (thread_id,))

                    # 5. Delete the thread record itself
                    cur.execute("DELETE FROM chat_threads WHERE thread_id = %s;", (thread_id,))
                    
                conn.commit()
                print(f"🗑️ Thread {thread_id} and all associated data deleted.")
        except Exception as e:
            print(f"Error deleting chat thread: {e}")

    # --------------------------------------------------
    # FULL-TEXT SEARCH LOGIC
    # --------------------------------------------------
    def save_plain_text_message(self, thread_id, role, content):
        """Saves a message to the plain-text table for search indexing."""
        if not content: return
        query = "INSERT INTO chat_messages (thread_id, role, content) VALUES (%s, %s, %s);"
        try:
            with self.get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(query, (thread_id, role, content))
                conn.commit()
        except Exception as e:
            print(f"Error indexing message: {e}")

    def search_messages(self, search_query, limit=20):
        """Final, rock-solid search with word-splitting and rank support."""
        if not search_query.strip(): return []
        
        # 1. Clean and tokenize search words
        words = [w.strip().lower() for w in search_query.split() if len(w.strip()) > 1]
        if not words: words = [search_query.strip().lower()]
        
        # 2. Build multi-word ILIKE conditions for foolproof fallback
        ilike_clauses = " OR ".join(["m.content ILIKE %s" for _ in words])
        ilike_params = [f"%{w}%" for w in words]
        
        query = f"""
        SELECT 
            m.thread_id, t.title, m.role,
            COALESCE(
              ts_headline('english', m.content, plainto_tsquery('english', %s), 'StartSel=<b>, StopSel=</b>, MaxWords=30, MinWords=15'),
              substring(m.content from 1 for 150) || '...'
            ) as preview,
            ts_rank(to_tsvector('english', m.content), plainto_tsquery('english', %s)) as rank,
            m.created_at
        FROM chat_messages m
        JOIN chat_threads t ON m.thread_id = t.thread_id
        WHERE to_tsvector('english', m.content) @@ plainto_tsquery('english', %s)
           OR t.title ILIKE %s
           OR ({ilike_clauses})
        ORDER BY rank DESC, m.created_at DESC
        LIMIT %s;
        """
        
        wildcard_query = f"%{search_query}%"
        try:
            with self.get_connection() as conn:
                with conn.cursor(cursor_factory=RealDictCursor) as cur:
                    # Headline [1], Rank [2], FTS Match [3], Title ILIKE [4], Word ILIKES [5..], LIMIT [6]
                    params = [search_query, search_query, search_query, wildcard_query] + ilike_params + [limit]
                    cur.execute(query, params)
                    return cur.fetchall()
        except Exception as e:
            print(f"Final search fail-safe error: {e}")
            return []
            print(f"Search error: {e}")
            return []

    # --------------------------------------------------
    # DOWNLOAD PATH LOGIC
    # --------------------------------------------------
    def get_chat_download_path(self, thread_id):
        """Retrieves the persistent PDF path for a specific thread."""
        query = "SELECT pdf_path FROM chat_download_configs WHERE thread_id = %s;"
        try:
            with self.get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(query, (thread_id,))
                    result = cur.fetchone()
                    return result[0] if result else None
        except Exception as e:
            print(f"Error fetching download path: {e}")
            return None

    def save_chat_download_path(self, thread_id, pdf_path):
        """Saves or updates the persistent PDF path for a thread."""
        query = """
        INSERT INTO chat_download_configs (thread_id, pdf_path, last_updated)
        VALUES (%s, %s, CURRENT_TIMESTAMP)
        ON CONFLICT (thread_id) 
        DO UPDATE SET pdf_path = EXCLUDED.pdf_path, last_updated = CURRENT_TIMESTAMP;
        """
        try:
            with self.get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(query, (thread_id, pdf_path))
                conn.commit()
                print(f"💾 PDF Path saved for thread {thread_id}: {pdf_path}")
        except Exception as e:
            print(f"❌ Error saving download path: {e}")
            raise e

    # --------------------------------------------------
    # IMAGE / ATTACHMENT LOGIC
    # --------------------------------------------------
    def save_image_attachment(self, thread_id, image_bytes, mime_type="image/png"):
        """Stores binary image data into BYTEA column."""
        query = """
        INSERT INTO chat_attachments (thread_id, file_data, mime_type)
        VALUES (%s, %s, %s)
        RETURNING attachment_id;
        """
        try:
            with self.get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(query, (thread_id, psycopg2.Binary(image_bytes), mime_type))
                    attachment_id = cur.fetchone()[0]
                    conn.commit()
                    return attachment_id
        except Exception as e:
            print(f"Error saving image: {e}")
            return None

    def get_image_by_id(self, attachment_id):
        """Retrieves image binary data for the frontend."""
        query = "SELECT file_data, mime_type FROM chat_attachments WHERE attachment_id = %s;"
        try:
            with self.get_connection() as conn:
                with conn.cursor(cursor_factory=RealDictCursor) as cur:
                    cur.execute(query, (attachment_id,))
                    return cur.fetchone()
        except Exception as e:
            print(f"Error fetching image {attachment_id}: {e}")
            return None

# --------------------------------------------------
# LANGGRAPH PERSISTENCE FACTORY
# --------------------------------------------------
def get_checkpointer():
    """
    Returns the PostgresSaver context manager.
    """
    return PostgresSaver.from_conn_string(DB_URL)