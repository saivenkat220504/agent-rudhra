import os
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_community.vectorstores import FAISS

# --------------------------------------------------
# Load environment variables
# --------------------------------------------------
load_dotenv()

api_key_val = os.getenv("OPENROUTER_API_KEY") or os.getenv("OPENAI_API_KEY")

if not api_key_val:
    raise ValueError("API Key (OPENROUTER_API_KEY or OPENAI_API_KEY) not found in .env file.")

# --------------------------------------------------
# LLM (OpenRouter — for RAG answer generation)
# --------------------------------------------------
llm = ChatOpenAI(
    api_key=str(api_key_val),
    base_url="https://openrouter.ai/api/v1",
    model="openai/gpt-4o-mini",
    temperature=0.1,
    max_tokens=1024
)

# --------------------------------------------------
# Embeddings — MUST match ingest_service.py exactly
# ingest_service uses OpenAI text-embedding-3-small via OpenRouter
# --------------------------------------------------
embeddings = OpenAIEmbeddings(
    openai_api_key=str(api_key_val),
    base_url="https://openrouter.ai/api/v1",
    model="text-embedding-3-small",
    check_embedding_ctx_length=False
)

# --------------------------------------------------
# Query normalizer (no extra LLM call — saves latency)
# --------------------------------------------------
def normalize_query(query: str) -> str:
    return query.strip()

# --------------------------------------------------
# Placeholder (FAISS loading handled in api_server.py)
# --------------------------------------------------
def ask_pdf(question: str) -> str:
    pass