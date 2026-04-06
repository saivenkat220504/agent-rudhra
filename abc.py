import psycopg2

db_url = "postgresql://postgres:IYxgKIqlovTWPaXxCdaUhGtGRZrARVIy@gondola.proxy.rlwy.net:42551/railway"

conn = psycopg2.connect(db_url)
cur = conn.cursor()

cur.execute("""
    INSERT INTO events (id, title, event_time, description, reminded)
    VALUES (%s, %s, %s, %s, %s)
""", (
    25,
    "test 1",
    "2026-04-01 16:05:00",
    "",
    False
))

conn.commit()

print("Row inserted successfully")

cur.close()
conn.close()