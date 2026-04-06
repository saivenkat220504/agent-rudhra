from langchain_core.documents import Document
from langchain_openai import OpenAIEmbeddings
from langchain_community.vectorstores import FAISS
import os
from dotenv import load_dotenv

load_dotenv()
api_key_val = os.getenv("OPENROUTER_API_KEY") or os.getenv("OPENAI_API_KEY")
embeddings = OpenAIEmbeddings(openai_api_key=str(api_key_val), base_url="https://openrouter.ai/api/v1", model="text-embedding-3-small", check_embedding_ctx_length=False)

bdf_hash = "bdfaa68d8984f0dc02beaca527b76f207d99b666d31d1da728ee0728182df697"
unit_hash = "7803dda0eda727fed35994e62bc1051b953bb66804426becded8dd0cb6c158f1"

from ingest_service import process_and_ingest

try:
    process_and_ingest("attension.pdf", "attension.pdf", bdf_hash)
    print("attension.pdf restored!")
except Exception as e:
    print("Could not ingest attension.pdf fully:", e)

try:
    docs2 = [Document(page_content="Content missing! Please reprocess UNIT-3-3.pdf locally.", metadata={"source": "UNIT-3-3.pdf", "page": 1, "chunk": 0, "hash": unit_hash})]
    db2 = FAISS.from_documents(docs2, embeddings)
    db2.save_local(os.path.join("index", unit_hash))
    print("UNIT-3-3.pdf dummy index restored!")
except Exception as e:
    pass

print("Finished restoring Vector Databases.")
