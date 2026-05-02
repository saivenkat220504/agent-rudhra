"""
Rudhra API Server — Corrected & Restored (Stability + RAG Handshake)
"""

import os
import asyncio
import json
import traceback
import re
from datetime import datetime
from typing import Optional, List

from fastapi import FastAPI, HTTPException, UploadFile, File, Form, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from dotenv import load_dotenv

# Initialize
load_dotenv()
app = FastAPI(title="Rudhra API")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Global Imports ─────────────────────────────
from backend import UnifiedAgent
from db_bck import DatabaseManager
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langchain_openai import ChatOpenAI
from rag import embeddings as rag_embeddings, llm as rag_llm
from langchain_community.vectorstores import FAISS
from image_gen import generate_image
from database import save_user_context, get_user_context
import base64

# ── Agent Wrapper ─────────────────────────────
class RudhraAgent:
    def __init__(self):
        self.agent = UnifiedAgent()
        self.chatbot = None
        self.ready = False

    async def initialize(self):
        try:
            await self.agent.initialize()
            self.chatbot = self.agent.chatbot
            if self.chatbot is None:
                raise Exception("Chatbot not initialized")
            self.ready = True
            print("✅ [INIT] Agent Brain Ready.")
        except Exception as e:
            print(f"❌ [INIT] Agent Init Failed: {e}")
            self.ready = False

agent_core = RudhraAgent()

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(agent_core.initialize())

db = DatabaseManager()

# ── Fast LLM ─────────────────────────────
FAST_LLM = ChatOpenAI(
    api_key=os.getenv("OPENAI_API_KEY"),
    base_url="https://openrouter.ai/api/v1",
    model="openai/gpt-4o-mini",
    temperature=0.7,
    max_tokens=1024,
    streaming=True,
    request_timeout=30.0
)

# ── API ROUTES ─────────────────────────────
api_router = APIRouter()

@api_router.get("/auth/status")
async def auth_status():
    return {"authenticated": True}

@api_router.post("/auth/login")
async def auth_login(body: dict):
    return {"authenticated": True}

@api_router.get("/threads")
async def threads():
    return db.get_all_threads()

@api_router.get("/threads/{thread_id}/messages")
async def messages(thread_id: str):
    try:
        state = await asyncio.to_thread(
            agent_core.chatbot.get_state,
            config={"configurable": {"thread_id": thread_id}}
        )
        history = state.values.get("messages", [])
        return [{"role": "user" if m.type == "human" else "assistant", "content": m.content} for m in history if hasattr(m, "content") and m.content]
    except Exception as e:
        print(f"❌ [MESSAGES ERROR]: {e}")
        return []

# ── Materials / RAG (Restore Correct Order) ──
from rag_manager import list_all_materials, check_material_exists, get_file_hash
from ingest_service import process_and_ingest

@api_router.get("/materials")
async def materials_list():
    try:
        return list_all_materials()
    except Exception as e:
        print(f"❌ [MATERIALS ERROR]: {e}")
        return []

@api_router.post("/materials/upload")
async def material_upload(file: UploadFile = File(...)):
    cnt = await file.read(); h = get_file_hash(cnt)
    if check_material_exists(h): return {"status": "exists", "content_hash": h}
    path = os.path.join("data", f"{h}.pdf")
    if not os.path.exists("data"): os.makedirs("data")
    with open(path, "wb") as f: f.write(cnt)
    await asyncio.to_thread(process_and_ingest, path, file.filename, h)
    return {"status": "success", "content_hash": h, "source_filename": file.filename}

@api_router.post("/rag/query")
async def rag_qry(body: dict):
    q, h = body.get("question", ""), body.get("hash") or body.get("content_hash", "")
    if not h: raise HTTPException(400, "No hash")
    vdb_path = f"index/{h}"
    if not os.path.exists(vdb_path): raise HTTPException(404, "VDB Not Found")
    
    async def r_stream():
        # HANDSHAKE: Instant signal to keep Proxy alive
        yield f"data: {json.dumps({'type': 'title', 'title': 'Reading PDF...'})}\n\n"
        rag_response = ""
        try:
            vdb = await asyncio.to_thread(FAISS.load_local, vdb_path, rag_embeddings, allow_dangerous_deserialization=True)
            docs = await asyncio.to_thread(vdb.similarity_search, q, k=5)
            
            web_context = ""
            tool_keywords = ["latest", "news", "today", "price", "stock", "live", "ipl", "score", "current", "real-time", "search", "find", "who is", "what is"]
            if any(k in q.lower() for k in tool_keywords) and os.getenv("TAVILY_API_KEY"):
                try:
                    from tavily import TavilyClient
                    tv_client = TavilyClient(api_key=os.getenv("TAVILY_API_KEY"))
                    # Need to search synchronously because tv_client.search is synchronous
                    tv_res = await asyncio.to_thread(
                        tv_client.search,
                        query=q,
                        search_depth="advanced",
                        max_results=3,
                        include_answer=True
                    )
                    web_ans = tv_res.get("answer", "")
                    web_res = "\n".join([f"- {r.get('title', '')}: {r.get('content', '')}" for r in tv_res.get("results", [])])
                    web_context = f"\n\n[LATEST WEB RESULTS FOR ACCURACY]:\n{web_ans}\n{web_res}"
                except Exception as e:
                    print(f"Tavily search in RAG failed: {e}")

            p = f"Context from Document: {' '.join(d.page_content for d in docs)[:2000]}{web_context}\n\nQ: {q}\n\nInstructions: Answer the question accurately using the provided context. If the document doesn't contain the answer and Web Results are available, use the Web Results to provide a 100% accurate, up-to-date answer."
            
            async for ck in rag_llm.astream(p):
                if ck.content:
                    rag_response += ck.content
                    yield f"data: {json.dumps({'type': 'chunk', 'content': ck.content})}\n\n"
            
            # Sync to FTS Table
            tid = body.get("thread_id")
            if tid:
                db.save_plain_text_message(tid, "user", q)
                db.save_plain_text_message(tid, "assistant", rag_response)
                # Ensure thread is in sidebar
                db.save_chat_thread(tid, q[:30] + ("..." if len(q) > 30 else ""))
                yield f"data: {json.dumps({'type': 'title', 'title': q[:30] + ('...' if len(q) > 30 else '')})}\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"
        yield f"data: {json.dumps({'type': 'done'})}\n\n"
        
    return StreamingResponse(r_stream(), media_type="text/event-stream")

@api_router.get("/search")
async def search_chats(q: str):
    if not q.strip(): return []
    return db.search_messages(q)

@api_router.post("/image/generate")
async def img_gen(body: dict):
    prompt = body.get("prompt")
    if not prompt: raise HTTPException(400, "No prompt")
    try:
        img_bytes = await asyncio.to_thread(generate_image, prompt)
        b64_img = base64.b64encode(img_bytes).decode("utf-8")
        return {"image_base64": b64_img}
    except Exception as e:
        raise HTTPException(500, str(e))

@api_router.post("/voice/transcribe")
async def voice_transcribe(file: UploadFile = File(...)):
    try:
        audio_bytes = await file.read()
        text = await asyncio.to_thread(agent_core.agent.transcribe_audio, audio_bytes)
        if not text:
            raise HTTPException(500, "Transcription failed")
        return {"text": text}
    except Exception as e:
        raise HTTPException(500, str(e))

@api_router.get("/personalization")
async def get_pers():
    return get_user_context("default_user")

@api_router.post("/personalization")
async def save_pers(body: dict):
    save_user_context("default_user", body)
    return {"status": "success"}

@api_router.patch("/threads/{thread_id}")
async def rename_thread(thread_id: str, body: dict):
    title = body.get("title")
    if not title: raise HTTPException(400, "No title")
    db.update_chat_title(thread_id, title)
    return {"status": "success"}

@api_router.delete("/threads/{thread_id}")
async def delete_thread(thread_id: str):
    db.delete_chat_thread(thread_id)
    return {"status": "success"}

# ── Chat Model ──
class ChatRequest(BaseModel):
    thread_id: str
    message: str
    image_base64: Optional[str] = None

@api_router.post("/chat")
async def chat(body: ChatRequest):
    print(f"💬 [CHAT] Request: {body.thread_id}")
    thread_id = body.thread_id; user_msg = body.message
    async def hybrid_stream():
        yield f"data: {json.dumps({'type': 'title', 'title': 'Thinking...'})}\n\n"
        full_rsp = ""
        tool_keywords = ["latest", "news", "today", "price", "stock", "live", "ipl", "score", "current", "real-time", "search", "find", "what is", "who is"]
        repo_keywords = ["repo", "github", "project", "structure", "codebase"]
        fs_keywords = ["save", "desktop", "file", "folder", "directory", "read", "write", "create", "move", "edit", "document"]
        cal_keywords = ["calendar", "meeting", "event", "schedule", "book", "agenda"]
        img_keywords = ["generate", "image", "draw", "picture"]
        needs_agent = any(k in user_msg.lower() for k in tool_keywords + repo_keywords + fs_keywords + cal_keywords + img_keywords)
        has_image = bool(body.image_base64)
        
        # Build the human message (with or without image)
        if has_image:
            human_input = [
                {"type": "text", "text": user_msg if user_msg.strip() else "Please analyze and explain this image."},
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{body.image_base64}"}}
            ]
            human_msg = HumanMessage(content=human_input)
        else:
            human_msg = HumanMessage(content=user_msg)
        
        # ── Get Personalization ──
        pers = get_user_context("default_user")
        user_background = pers.get("raw_text", "") or pers.get("preferences", "")
        base_sys_prompt = "You are a helpful AI assistant."
        if user_background:
            base_sys_prompt += f"\n\n**USER CONTEXT (PERSONALIZATION)**:\n{user_background}\nUse the above context to tailor your response to be more relevant to this user."

        # ── Agent Path ──
        if needs_agent and agent_core.ready and agent_core.chatbot:
            print("🧠 Using Agent Brain")
            try:
                # Wrap synchronous stream in a thread for non-blocking iteration
                def get_agent_iter():
                    return agent_core.chatbot.stream(
                        {"messages": [SystemMessage(content=base_sys_prompt), human_msg]},
                        config={"configurable": {"thread_id": thread_id}},
                        stream_mode="values"
                    )

                it = iter(get_agent_iter())
                while True:
                    event = await asyncio.to_thread(next, it, None)
                    if event is None: break
                    
                    if "messages" not in event: continue
                    msg = event["messages"][-1]
                    if isinstance(msg, AIMessage) and msg.content:
                        new_txt = msg.content[len(full_rsp):]
                        if new_txt:
                            full_rsp = msg.content
                            yield f"data: {json.dumps({'type': 'chunk', 'content': new_txt})}\n\n"
            except Exception as agent_err:
                print(f"❌ AGENT ERROR: {agent_err}")
                # Fallback
                print("⚡ Falling back to Fast LLM")
                full_rsp = ""
                try:
                    err_note = json.dumps({'type': 'chunk', 'content': '_(web search unavailable, using general knowledge)_'})
                    yield f"data: {err_note}\n\n"
                    async for chunk in FAST_LLM.astream([SystemMessage(content=base_sys_prompt), human_msg]):
                        if chunk.content:
                            full_rsp += chunk.content
                            yield f"data: {json.dumps({'type': 'chunk', 'content': chunk.content})}\n\n"
                except Exception as fallback_err:
                    err_msg = f"Agent failed: {agent_err}. Fallback also failed: {fallback_err}"
                    print(f"❌ FALLBACK ERROR: {fallback_err}")
                    yield f"data: {json.dumps({'type': 'error', 'content': err_msg})}\n\n"
        else:
            # ── Fast LLM Path (also handles images) ──
            print("⚡ Using Fast LLM" + (" + Vision" if has_image else ""))
            try:
                sys_prompt = base_sys_prompt
                if has_image:
                    sys_prompt += "\n\nIf an image is provided, analyze it carefully and describe what you see in detail."
                async for chunk in FAST_LLM.astream([SystemMessage(content=sys_prompt), human_msg]):
                    if chunk.content:
                        full_rsp += chunk.content
                        yield f"data: {json.dumps({'type': 'chunk', 'content': chunk.content})}\n\n"
            except Exception as e:
                tb = traceback.format_exc()
                print(f"❌ FAST LLM ERROR: {e}\n{tb}")
                yield f"data: {json.dumps({'type': 'error', 'content': f'LLM Error: {str(e)}'})}\n\n"

        # Save to thread history
        if full_rsp and agent_core.chatbot:
            try:
                # Sync to LangGraph
                asyncio.create_task(asyncio.to_thread(
                    agent_core.chatbot.update_state,
                    {"configurable": {"thread_id": thread_id}},
                    {"messages": [HumanMessage(content=user_msg), AIMessage(content=full_rsp)]}
                ))
                # Sync to FTS Table
                db.save_plain_text_message(thread_id, "user", user_msg)
                db.save_plain_text_message(thread_id, "assistant", full_rsp)
                # Register Thread in Sidebar (if new or name changed)
                if len(user_msg) > 0:
                    title = user_msg[:30] + ("..." if len(user_msg) > 30 else "")
                    db.save_chat_thread(thread_id, title)
                    yield f"data: {json.dumps({'type': 'title', 'title': title})}\n\n"
            except Exception:
                pass
        yield f"data: {json.dumps({'type': 'done'})}\n\n"
    return StreamingResponse(hybrid_stream(), media_type="text/event-stream")

# ── Exam Mode ──
from exam_mode import count_pages_in_files, extract_questions_from_files, extract_mcq_questions_from_files, evaluate_answer_improved
from score import evaluate_image_answer
import io

@api_router.post("/exam/process")
async def exam_proc(files: List[UploadFile] = File(...)):
    wrapped = []
    for f in files:
        b = io.BytesIO(await f.read()); b.name = f.filename; wrapped.append(b)
    return {"total_pages": count_pages_in_files(wrapped)}

@api_router.post("/exam/start")
async def exam_start(files: List[UploadFile] = File(...), num_questions: int = Form(...), eval_mode: str = Form(...)):
    wrapped = []
    for f in files:
        b = io.BytesIO(await f.read()); b.name = f.filename; wrapped.append(b)
    if eval_mode == "MCQ":
        qs = await asyncio.to_thread(extract_mcq_questions_from_files, wrapped, num_questions)
        return {"questions": [m["question"] for m in qs], "mcq_questions": qs}
    else:
        qs = await asyncio.to_thread(extract_questions_from_files, wrapped, num_questions)
        return {"questions": qs, "mcq_questions": []}

@api_router.post("/exam/evaluate")
async def exam_eval(body: dict):
    res = await asyncio.to_thread(evaluate_answer_improved, body.get("question"), body.get("answer"))
    return {"evaluation": res}

@api_router.post("/exam/evaluate-image")
async def exam_eval_img(file: UploadFile = File(...), question: str = Form(...)):
    cnt = await file.read()
    with open("temp_eval.png", "wb") as f: f.write(cnt)
    res = await asyncio.to_thread(evaluate_image_answer, "temp_eval.png", question)
    if os.path.exists("temp_eval.png"): os.remove("temp_eval.png")
    return res

# ── PDF Archiving ──
from pdf_lib import append_to_pdf

class PathRequest(BaseModel):
    thread_id: str
    pdf_path: str

@api_router.get("/chat/download/default-path")
async def get_default_pdf_path():
    """Returns the user's Desktop path as a smart default."""
    try:
        desktop = os.path.join(os.path.expanduser("~"), "Desktop")
        if not os.path.exists(desktop):
            desktop = os.path.join(os.path.expanduser("~"), "Documents")
        return {"default_path": desktop}
    except Exception:
        return {"default_path": "C:\\"}

@api_router.post("/chat/download/path")
async def set_pdf_path(body: PathRequest):
    p = body.pdf_path.strip()
    # If the user just gave a name like 'chat.pdf', put it on their Desktop
    if not os.path.isabs(p) or ("/" not in p and "\\" not in p):
        desktop = os.path.join(os.path.expanduser("~"), "Desktop")
        if not os.path.exists(desktop):
            desktop = os.path.join(os.path.expanduser("~"), "Documents")
        p = os.path.join(desktop, p)
    
    # Ensure it ends with .pdf
    if not p.lower().endswith(".pdf"):
        p += ".pdf"
        
    try:
        db.save_chat_download_path(body.thread_id, p)
        return {"status": "success", "pdf_path": p, "message": f"PDF path set to: {p}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database save failed: {str(e)}")

@api_router.get("/chat/download/path/{thread_id}")
async def get_pdf_path(thread_id: str):
    p = db.get_chat_download_path(thread_id)
    return {"pdf_path": p}

class AppendRequest(BaseModel):
    thread_id: str
    content: str
    question: Optional[str] = None

@api_router.post("/chat/download/append")
async def append_pdf(body: AppendRequest):
    p = db.get_chat_download_path(body.thread_id)
    if not p:
        raise HTTPException(400, "PDF path not set for this thread. Please configure it first.")
    
    success = await asyncio.to_thread(append_to_pdf, p, "Response", body.content, body.question)
    if success:
        return {"status": "success", "message": "Message appended to PDF."}
    else:
        raise HTTPException(500, "Failed to append to PDF.")

@api_router.post("/mindmap/upload")
async def mindmap_upload(file: UploadFile = File(...)):
    import PyPDF2
    from langchain_core.messages import HumanMessage, SystemMessage
    
    try:
        content = await file.read()
        pdf_reader = PyPDF2.PdfReader(io.BytesIO(content))
        text = ""
        for page in pdf_reader.pages[:5]: # limit to 5 pages for mindmap logic
            extracted = page.extract_text()
            if extracted: text += extracted + "\n"
            
        if not text.strip():
            return {"root": {"label": "Error: No extractable text found in PDF", "children": []}}
        
        prompt = f"Analyze the following text and create a structured JSON for a mindmap. The JSON should have a 'root' node with 'label' and 'children' (list of nodes). Each node has 'label' and 'children'. Limit to 3 levels deep.\n\nTEXT:\n{text[:4000]}"
        
        # We need to ensure we get ONLY JSON
        response = await FAST_LLM.ainvoke([
            SystemMessage(content="You are a mindmap generator. Your output MUST be valid JSON only, following the schema: { 'root': { 'label': '...', 'children': [ { 'label': '...', 'children': [...] } ] } }"),
            HumanMessage(content=prompt)
        ])
        
        text_resp = response.content
        if "```json" in text_resp:
            text_resp = text_resp.split("```json")[-1].split("```")[0]
        elif "```" in text_resp:
            text_resp = text_resp.split("```")[-1].split("```")[0]
            
        start = text_resp.find("{")
        end = text_resp.rfind("}")
        if start != -1 and end != -1 and end > start:
            clean_json = text_resp[start:end+1]
        else:
            clean_json = text_resp.strip()
            
        try:
            data = json.loads(clean_json)
        except Exception:
            # Fallback instead of throwing 500
            data = {"root": {"label": "Error: Failed to parse LLM response into format", "children": []}}
            
        return data
    except Exception as e:
        print(f"Mindmap PDF error: {str(e)}")
        raise HTTPException(500, f"Failed to generate mindmap: {str(e)}")

class MindMapRequest(BaseModel):
    topic: str

@api_router.post("/mindmap/generate")
async def mindmap_generate(body: MindMapRequest):
    from langchain_core.messages import HumanMessage, SystemMessage
    
    try:
        prompt = f"Create a detailed, structured JSON for a mindmap about the following topic: '{body.topic}'. The JSON should have a 'root' node with 'label' and 'children' (list of nodes). Each node has 'label' and 'children'. Build a deep, educational structure with at least 3 levels of depth."
        
        response = await FAST_LLM.ainvoke([
            SystemMessage(content="You are a mindmap architect. Your output MUST be valid JSON only, following the schema: { 'root': { 'label': '...', 'children': [ { 'label': '...', 'children': [...] } ] } }"),
            HumanMessage(content=prompt)
        ])
        
        import re
        m = re.search(r'\{.*\}', response.content, re.DOTALL)
        clean_json = m.group(0) if m else response.content.strip()
        data = json.loads(clean_json)
        return data
    except Exception as e:
        raise HTTPException(500, f"Failed to generate mindmap: {str(e)}")

@api_router.get("/mindmap/url")
async def get_mindmap_url():
    # Constant URL corresponding to the deployed React Frontend for the Mind Map
    return {"url": "https://mindmap-frontend-production-abc2.up.railway.app"}


class TranslateRequest(BaseModel):
    text: str
    target_language: str

@api_router.post("/chat/translate")
async def chat_translate(body: TranslateRequest):
    try:
        from langchain_core.messages import SystemMessage, HumanMessage
        sys_msg = SystemMessage(content=f"You are a professional translator. Translate the following text into {body.target_language}. Maintain the original markdown formatting. Do not add any conversational filler.")
        res = await FAST_LLM.ainvoke([sys_msg, HumanMessage(content=body.text)])
        return {"translated_text": res.content}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ── Plan & Study ──────────────────────────────────────────────────────────────
from plan_study_db import (
    init_plan_schema,
    db_get_all_plans, db_create_plan, db_delete_plan,
    db_create_subject, db_delete_subject,
    db_create_chapter, db_delete_chapter,
)

@app.on_event("startup")
async def init_plan_study_schema():
    await asyncio.to_thread(init_plan_schema)

from typing import Optional, Union, List

class PlanCreateRequest(BaseModel):
    plan_name: str
    num_days: int
    subjects: list

class SubjectCreateRequest(BaseModel):
    plan_id: Optional[Union[int, str]] = None
    subject_name: str
    chapters: list

class ChapterCreateRequest(BaseModel):
    subject_id: str
    chapter_name: str
    deadline: str

@api_router.get("/plans")
async def get_plans():
    try:
        plans = await asyncio.to_thread(db_get_all_plans)
        return plans
    except Exception as e:
        raise HTTPException(500, str(e))

@api_router.post("/plans")
async def create_plan(body: PlanCreateRequest):
    if not body.plan_name.strip():
        raise HTTPException(400, "Plan name is required")
    if body.num_days <= 0:
        raise HTTPException(400, "num_days must be > 0")
    result = await asyncio.to_thread(
        db_create_plan, body.plan_name, body.num_days, body.subjects
    )
    return result

@api_router.delete("/plans/{plan_id}")
async def delete_plan(plan_id: int):
    await asyncio.to_thread(db_delete_plan, plan_id)
    return {"status": "success"}

@api_router.post("/subjects")
async def create_subject(body: SubjectCreateRequest):
    if not body.subject_name.strip():
        raise HTTPException(400, "Subject name is required")
    result = await asyncio.to_thread(
        db_create_subject, body.plan_id, body.subject_name, body.chapters
    )
    return result

@api_router.delete("/subjects/{subject_id}")
async def delete_subject(subject_id: str):
    await asyncio.to_thread(db_delete_subject, subject_id)
    return {"status": "success"}

@api_router.post("/chapters")
async def create_chapter(body: ChapterCreateRequest):
    from datetime import datetime
    if not body.chapter_name.strip():
        raise HTTPException(400, "Chapter name is required")
    try:
        dl = datetime.fromisoformat(body.deadline)
        if dl < datetime.now():
            raise HTTPException(400, "Deadline must be in the future")
    except ValueError:
        raise HTTPException(400, "Invalid deadline format")
    result = await asyncio.to_thread(
        db_create_chapter, body.subject_id, body.chapter_name, body.deadline
    )
    return result

@api_router.delete("/chapters/{chapter_id}")
async def delete_chapter(chapter_id: int):
    await asyncio.to_thread(db_delete_chapter, chapter_id)
    return {"status": "success"}

app.include_router(api_router, prefix="/api")

@app.get("/")
async def root():
    return {"status": "success", "message": "Rudhra Live"}