import os
import sys
from dotenv import load_dotenv

# Ensure current dir is in path
sys.path.append(os.getcwd())

load_dotenv()
from db_bck import DatabaseManager

def test():
    print("🔎 [FINAL TEST] Checking Search for 'self attension'...")
    db = DatabaseManager()
    
    # This specifically tests the new tokenized logic
    results = db.search_messages("self attension")
    
    print(f"📊 Results found: {len(results)}")
    for i, r in enumerate(results):
        print(f"  [{i+1}] {r['title']} -> {r['preview']}")
    
    if not results:
        print("❌ [TEST FAILED] Still no results. Checking database raw table...")
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT content FROM chat_messages WHERE content ILIKE '%attension%' LIMIT 3;")
                raw = cur.fetchall()
                print(f"   Raw search for 'attension' found: {len(raw)} records.")
    else:
        print("✅ [TEST PASSED] Search is now returning results.")

if __name__ == "__main__":
    test()
