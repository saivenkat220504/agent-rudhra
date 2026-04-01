import streamlit as st
import asyncio
import uuid
import time
import base64
import os
import io
import hashlib
import pickle
from PIL import Image
from datetime import datetime

# PDF Handling
from PyPDF2 import PdfReader, PdfWriter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, HRFlowable
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib import colors

# Internal modules
from backend import UnifiedAgent, generate_chat_title
from rag import ask_pdf
from db_bck import DatabaseManager  
from langchain_core.messages import HumanMessage, AIMessage

# UI Components
from streamlit_mic_recorder import mic_recorder 
from streamlit_paste_button import paste_image_button
import tkinter as tk
from tkinter import filedialog

from rag_pages import render_material_library
from exam_mode import run_exam_mode
from personalization_ui import render_personalization_page
from mind import render_mind_map_page, open_mindmap  # ✅ Imported required functions

# --------------------------------------------------
# 1. AUTHENTICATION & LANDING LOGIC
# --------------------------------------------------
DATA_FILE = "auth_data.pkl"

def hash_password(password):
    return hashlib.sha256(password.encode()).hexdigest()

def save_auth_data(data):
    with open(DATA_FILE, "wb") as f:
        pickle.dump(data, f)

def load_auth_data():
    if not os.path.exists(DATA_FILE): return None
    with open(DATA_FILE, "rb") as f: return pickle.load(f)

def play_activation_sound():
    if not os.path.exists("activated.mp3"): return
    with open("activated.mp3", "rb") as f:
        audio_bytes = f.read()
    b64 = base64.b64encode(audio_bytes).decode()
    audio_html = f"""
        <script>
            if (!window.audioPlayed) {{
                var audio = new Audio("data:audio/mp3;base64,{b64}");
                audio.play();
                window.audioPlayed = true;
            }}
        </script>
    """
    st.components.v1.html(audio_html, height=0)

def cinematic_sequence():
    placeholder = st.empty()
    steps = ["🔍 Analyzing Key...", "🧠 Matching Credentials...", "🛡️ Verifying...", "⚡ Initializing...", "🔥 Rudhra Activated"]
    for step in steps:
        placeholder.markdown(f"<h2 style='text-align: center; color: red;'>{step}</h2>", unsafe_allow_html=True)
        time.sleep(0.7)
    placeholder.empty()

def run_auth_system():
    if "auth_step" not in st.session_state: 
        st.session_state.auth_step = "login"

    data = load_auth_data()

    if st.session_state.auth_step == "login":
        _, col2, _ = st.columns([1, 2, 1])
        with col2:
            st.markdown("<h2 style='text-align: center;'>🧠 RUDHRA OS LOGIN</h2>", unsafe_allow_html=True)
            if data is None:
                pwd = st.text_input("Set Admin Password", type="password")
                if st.button("Save Credentials", use_container_width=True):
                    save_auth_data({"password": hash_password(pwd)})
                    st.rerun()
            else:
                pwd = st.text_input("Access Key", type="password")
                if st.button("Unlock 🔑", use_container_width=True, type="primary"):
                    if hash_password(pwd) == data["password"]:
                        st.session_state.auth_step = "activating"
                        st.rerun()
                    else: st.error("Invalid Key")
        return False

    if st.session_state.auth_step == "activating":
        play_activation_sound()
        st.markdown("<h1 style='text-align: center; color: #00FF00;'>SYSTEM ONLINE</h1>", unsafe_allow_html=True)
        cinematic_sequence()
        st.session_state.auth_step = "ready"
        st.rerun()

    if st.session_state.auth_step == "ready":
        play_activation_sound()
        _, col2, _ = st.columns([1, 2, 1])
        with col2:
            st.markdown("<br><br>", unsafe_allow_html=True)
            st.markdown("<h1 style='text-align: center; color: #4A90E2; font-family: sans-serif;'>welcome to rudhra labs</h1>", unsafe_allow_html=True)
            
            img_path = "ChatGPT Image Mar 29, 2026, 09_35_46 PM.png"
            if os.path.exists(img_path):
                _, mid_img, _ = st.columns([0.2, 2, 0.2])
                mid_img.image(img_path, width=350)
            
            st.markdown("<br>", unsafe_allow_html=True)
            if st.button("🚀 start rudhra", use_container_width=True, type="primary"):
                st.session_state.auth_step = "enter_app"
                st.rerun()
        return False

    return True

# --------------------------------------------------
# 2. MAIN FRONTEND START
# --------------------------------------------------
st.set_page_config(page_title="Agent Chat", layout="wide")

if run_auth_system():
    db = DatabaseManager()

    if "agent" not in st.session_state:
        agent = UnifiedAgent()
        asyncio.run(agent.initialize())
        st.session_state.agent = agent

    if "thread_id" not in st.session_state:
        st.session_state.thread_id = str(uuid.uuid4())

    if "pdf_responses_map" not in st.session_state:
        st.session_state.pdf_responses_map = {}

    # Initialize all routing flags
    for key in ["exam_mode", "rag_mode", "show_library", "show_personalization", "show_mindmap_page"]:
        if key not in st.session_state:
            st.session_state[key] = False

    if "uploader_key" not in st.session_state: st.session_state.uploader_key = 0
    if "voice_key" not in st.session_state: st.session_state.voice_key = 1000
    if "current_image_bytes" not in st.session_state: st.session_state.current_image_bytes = None

    active_tid = st.session_state.thread_id

    # --------------------------------------------------
    # PDF UTILS
    # --------------------------------------------------
    def choose_pdf_path():
        try:
            root = tk.Tk()
            root.withdraw()
            root.attributes("-topmost", True)
            path = filedialog.asksaveasfilename(
                title="Select PDF for this Conversation",
                defaultextension=".pdf",
                filetypes=[("PDF files", "*.pdf")]
            )
            root.destroy()
            return path if path else None
        except:
            return None

    def append_to_pdf(file_path, query, response):
        try:
            styles = getSampleStyleSheet()
            packet = io.BytesIO()
            q_style = styles["Heading4"]
            q_style.textColor = colors.HexColor("#1F618D") 
            r_style = styles["Normal"]
            
            doc = SimpleDocTemplate(packet)
            elements = []
            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
            
            elements.append(HRFlowable(width="100%", thickness=0.5, color=colors.lightgrey))
            elements.append(Spacer(1, 10))
            elements.append(Paragraph(f"<b>Time:</b> {timestamp}", styles["Italic"]))
            elements.append(Spacer(1, 8))
            elements.append(Paragraph(f"<b>Query:</b> {query}", q_style))
            elements.append(Spacer(1, 6))
            
            clean_res = response.replace('\n', '<br/>')
            elements.append(Paragraph(f"<b>Agent:</b> {clean_res}", r_style))
            elements.append(Spacer(1, 20))
            
            doc.build(elements)
            packet.seek(0)
            
            new_pdf = PdfReader(packet)
            writer = PdfWriter()

            if os.path.exists(file_path) and os.path.getsize(file_path) > 0:
                existing_pdf = PdfReader(file_path)
                for page in existing_pdf.pages:
                    writer.add_page(page)
            
            for page in new_pdf.pages:
                writer.add_page(page)

            with open(file_path, "wb") as f:
                writer.write(f)
            return True
        except Exception as e:
            st.error(f"Append Error: {e}")
            return False

    # --------------------------------------------------
    # PAGE ROUTING
    # --------------------------------------------------
    if st.session_state.exam_mode:
        if st.button("⬅ Back to Chat"):
            st.session_state.exam_mode = False
            st.rerun()
        run_exam_mode()
        st.stop()

    if st.session_state.show_mindmap_page:  
        render_mind_map_page() 
        st.stop()

    if st.session_state.show_personalization:
        render_personalization_page(user_id="default_user")
        st.stop()

    if st.session_state.show_library:
        render_material_library()
        st.stop()

    # --------------------------------------------------
    # SIDEBAR
    # --------------------------------------------------
    with st.sidebar:
        st.title("🛠️ Tools")
        
        if st.button("🎯 Personalization", use_container_width=True):
            st.session_state.show_personalization = True
            st.rerun()
        
        if st.button("📝 Exam Mode", use_container_width=True):
            st.session_state.exam_mode = True
            st.rerun()

        # ✅ Integrated Mind Map Generator Trigger
        if st.button("🧠 Mind Map Generator", use_container_width=True):
            # Calls the logic from mind.py to open the external URL
            result = open_mindmap()
            if result["status"] == "success":
                st.toast(result["message"], icon="🧠")
                # Fallback in UI
                st.info(f"Opening tool in new tab. If it doesn't open, [click here]({result.get('url', '#')})")
            else:
                st.error(result["message"])

        st.markdown("---")
        
        audio_data = mic_recorder(
            start_prompt="🎤 Record Voice",
            stop_prompt="🛑 Stop & Send",
            just_once=True,
            key=f"voice_{st.session_state.voice_key}"
        )
        
        st.markdown("---")
        
        rag_toggle = st.toggle("📄 Chat with PDF", value=st.session_state.rag_mode)
        
        if rag_toggle and "active_rag_hash" not in st.session_state:
            st.error("⚠️ No material connected!")
            st.info("Please connect a PDF in the 'Manage Material Library' below.")
            st.session_state.rag_mode = False
        else:
            st.session_state.rag_mode = rag_toggle
        
        if st.button("📚 Manage Material Library", use_container_width=True):
            st.session_state.show_library = True
            st.rerun()

        st.write("🖼️ **Image Input**")
        uploaded_file = st.file_uploader("Upload", type=["jpg", "png", "jpeg"], key=f"img_{st.session_state.uploader_key}")
        pasted_img = paste_image_button(label="📋 Paste", key=f"paste_{st.session_state.uploader_key}")

        if uploaded_file is not None:
            st.session_state.current_image_bytes = uploaded_file.getvalue()
            st.image(st.session_state.current_image_bytes, caption="Image Ready", width=250)
        elif pasted_img.image_data is not None:
            img_io = io.BytesIO()
            pasted_img.image_data.convert("RGB").save(img_io, format="JPEG")
            st.session_state.current_image_bytes = img_io.getvalue()
            st.image(st.session_state.current_image_bytes, caption="Image Pasted", width=250)
        
        if st.session_state.current_image_bytes and st.button("🗑️ Clear Image"):
            st.session_state.current_image_bytes = None
            st.rerun()

        st.markdown("<div style='height: 10vh;'></div>", unsafe_allow_html=True)
        st.markdown("---")
        st.title("Conversations")

        if st.button("➕ New Chat", use_container_width=True):
            st.session_state.thread_id = str(uuid.uuid4())
            st.session_state.current_image_bytes = None
            st.rerun()

        existing_threads = db.get_all_threads(user_id="default_user")
        for row in existing_threads:
            t_id = str(row['thread_id'])
            t_title = row['title']
            col_btn, col_opt = st.columns([0.8, 0.2])
            with col_btn:
                if st.button(f"💬 {t_title}", key=f"btn_{t_id}", use_container_width=True):
                    st.session_state.thread_id = t_id
                    st.session_state.current_image_bytes = None
                    st.rerun()
            with col_opt:
                with st.popover("⚙️"):
                    new_name = st.text_input("Rename Chat", value=t_title, key=f"rename_input_{t_id}")
                    if st.button("Save Name", key=f"save_{t_id}"):
                        if new_name.strip(): 
                            db.update_chat_title(t_id, new_name.strip())
                            st.rerun()
                    if st.button("🗑️ Delete Chat", key=f"del_{t_id}", type="primary"):
                        db.delete_chat_thread(t_id)
                        if st.session_state.thread_id == t_id:
                            st.session_state.thread_id = str(uuid.uuid4())
                        st.rerun()
                        
        if st.button("🚪 Logout System", use_container_width=True):
            st.session_state.auth_step = "login"
            st.rerun()

    # --------------------------------------------------
    # MAIN CHAT DISPLAY
    # --------------------------------------------------
    st.title("💬 Agent")

    state = st.session_state.agent.chatbot.get_state(config={"configurable": {"thread_id": active_tid}})
    messages = state.values.get("messages", [])

    for idx, msg in enumerate(messages):
        if isinstance(msg, HumanMessage):
            with st.chat_message("user"):
                st.markdown(msg.content)
        elif isinstance(msg, AIMessage):
            content = str(msg.content).strip()
            if not content: continue
            with st.chat_message("assistant"):
                if content.startswith("[IMAGE_STORED_ID:"):
                    att_id = content.replace("[IMAGE_STORED_ID:", "").replace("]", "")
                    img_record = db.get_image_by_id(att_id)
                    if img_record:
                        img_bytes = bytes(img_record['file_data'])
                        st.image(img_bytes, caption="Generated Image", width=450)
                        st.download_button(label="⬇️ Download Image", data=img_bytes, file_name=f"gen_{att_id}.png")
                else:
                    st.markdown(content)
                    if st.button("📄 Save to PDF", key=f"dl_text_{idx}"):
                        user_query = messages[idx-1].content if idx > 0 and isinstance(messages[idx-1], HumanMessage) else "Unknown Query"
                        saved_path = db.get_chat_download_path(active_tid) or choose_pdf_path()
                        if saved_path:
                            db.save_chat_download_path(active_tid, saved_path)
                            if append_to_pdf(saved_path, user_query, content):
                                st.toast(f"✅ Appended!", icon="📄")

    # --------------------------------------------------
    # INPUT FLOW
    # --------------------------------------------------
    user_input = st.chat_input("Type message...")
    final_input = (st.session_state.agent.transcribe_audio(audio_data["bytes"]) if audio_data else None) or user_input

    if final_input:
        if st.session_state.rag_mode and "active_rag_hash" not in st.session_state:
            st.error("⚠️ Connection lost. Please manage library.")
            st.session_state.rag_mode = False
            st.rerun()
        else:
            with st.chat_message("user"):
                st.markdown(final_input)

            with st.chat_message("assistant"):
                placeholder = st.empty()
                if len(messages) == 0:
                    db.save_chat_thread(active_tid, generate_chat_title(final_input))

                with st.status("Thinking...", expanded=False) as status:
                    if st.session_state.rag_mode:
                        status.update(label="Searching PDF...", state="running")
                        full_response = ask_pdf(final_input)
                        st.session_state.agent.chatbot.update_state(
                            {"configurable": {"thread_id": active_tid}}, 
                            {"messages": [HumanMessage(content=final_input), AIMessage(content=full_response)]}
                        )
                    else:
                        status.update(label="Thinking ...", state="running")
                        st.session_state.agent.chatbot.update_state(
                            {"configurable": {"thread_id": active_tid}}, 
                            {"messages": [HumanMessage(content=final_input)], "image_bytes": st.session_state.current_image_bytes}
                        )
                        new_state = st.session_state.agent.chatbot.invoke(
                            {"messages": [], "image_bytes": st.session_state.current_image_bytes}, 
                            config={"configurable": {"thread_id": active_tid}}
                        )
                        full_response = new_state["messages"][-1].content
                    status.update(label="Complete!", state="complete", expanded=False)

                if "[IMAGE_STORED_ID:" not in str(full_response):
                    out = ""
                    for ch in str(full_response):
                        out += ch
                        placeholder.markdown(out)
                        time.sleep(0.002)
                else:
                    placeholder.info("🖼️ Image generated.")

            st.session_state.current_image_bytes = None
            st.session_state.uploader_key += 1
            st.session_state.voice_key += 1
            st.rerun()