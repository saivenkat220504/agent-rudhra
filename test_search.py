import os
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

load_dotenv()
DB_URL = os.getenv("DATABASE_URL")

def test_query(q):
    print(f"Testing Search for: '{q}'")
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor(cursor_factory=RealDictCursor)
    
    query = """
    SELECT 
        m.thread_id, 
        t.title,
        m.content,
        similarity(m.content, %s) as sim
    FROM chat_messages m
    JOIN chat_threads t ON m.thread_id = t.thread_id
    WHERE to_tsvector('english', m.content) @@ plainto_tsquery('english', %s)
       OR t.title ILIKE %s
       OR m.content %% %s
    ORDER BY sim DESC
    LIMIT 5;
    """
    
    wildcard_title = f"%{q}%"
    try:
        cur.execute(query, (q, q, wildcard_title, q))
        results = cur.fetchall()
        print(f"Found {len(results)} results.")
        for r in results:
            print(f"  [Thread: {r['title']}] [Sim: {r['sim']:.3f}] - {r['content'][:100]}")
            
        # If no results, try super loose ILIKE
        if not results:
            print("No results with FTS/Fuzzy. Trying loose ILIKE content...")
            cur.execute("SELECT content, similarity(content, %s) as sim FROM chat_messages WHERE content ILIKE %s LIMIT 3;", (q, f"%{q}%"))
            loose = cur.fetchall()
            for r in loose:
                print(f"  [Loose Match] [Sim: {r['sim']:.3f}] - {r['content'][:100]}")
    except Exception as e:
        print(f"Error: {e}")
        
    conn.close()

if __name__ == "__main__":
    test_query("self attension")
    print("-" * 40)
    test_query("attention")
