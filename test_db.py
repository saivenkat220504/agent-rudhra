import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()
DB_URL = os.getenv("DATABASE_URL")

def test():
    print(f"Connecting to {DB_URL}...")
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    
    # 1. Check table existence and size
    cur.execute("SELECT COUNT(*) FROM chat_messages;")
    count = cur.fetchone()[0]
    print(f"Total Messages in Search Table: {count}")
    
    # 2. Check for the word 'attention' or 'self'
    cur.execute("SELECT content FROM chat_messages WHERE content ILIKE '%attention%';")
    matches = cur.fetchall()
    print(f"Found {len(matches)} messages with 'attention'.")
    
    # 3. Check for the word 'attension'
    cur.execute("SELECT content FROM chat_messages WHERE content ILIKE '%attension%';")
    typo_matches = cur.fetchall()
    print(f"Found {len(typo_matches)} messages with 'attension'.")
    
    # 4. Sample a few rows
    cur.execute("SELECT thread_id, role, LEFT(content, 50) FROM chat_messages LIMIT 5;")
    rows = cur.fetchall()
    print("Sample Rows:")
    for r in rows:
        print(f"  {r}")
        
    conn.close()

if __name__ == "__main__":
    test()
