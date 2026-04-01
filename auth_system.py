import streamlit as st
import os
import pickle
import hashlib
import time
import base64

DATA_FILE = "auth_data.pkl"

# ---------------- PASSWORD ----------------
def hash_password(password):
    return hashlib.sha256(password.encode()).hexdigest()

# ---------------- STORAGE ----------------
def save_auth_data(data):
    with open(DATA_FILE, "wb") as f:
        pickle.dump(data, f)

def load_auth_data():
    if not os.path.exists(DATA_FILE):
        return None
    with open(DATA_FILE, "rb") as f:
        return pickle.load(f)

# ---------------- FIXED AUDIO ENGINE ----------------
def play_activation_sound():
    if not os.path.exists("activated.mp3"):
        return

    with open("activated.mp3", "rb") as f:
        audio_bytes = f.read()

    b64 = base64.b64encode(audio_bytes).decode()
    unique_id = "rudhra_audio_player" # Static ID to prevent multiple triggers
    
    # We place this in a container that doesn't get wiped immediately
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

# ---------------- CINEMATIC ----------------
def cinematic_sequence():
    placeholder = st.empty()
    steps = ["🔍 Analyzing Key...", "🧠 Matching Credentials...", "🛡️ Verifying...", "⚡ Initializing...", "🔥 Rudhra Activated"]
    for step in steps:
        placeholder.markdown(f"<h2 style='text-align: center; color: red;'>{step}</h2>", unsafe_allow_html=True)
        time.sleep(0.7) # Slightly longer to let audio breathe
    placeholder.empty()

# ---------------- MAIN AUTH FLOW ----------------
def run_auth_system():
    if "auth_step" not in st.session_state: 
        st.session_state.auth_step = "login"

    data = load_auth_data()

    # --- STEP 1: LOGIN PAGE ---
    if st.session_state.auth_step == "login":
        _, col2, _ = st.columns([1, 2, 1])
        with col2:
            st.markdown("<h2 style='text-align: center;'>🧠 RUDHRA OS LOGIN</h2>", unsafe_allow_html=True)
            if data is None:
                pwd = st.text_input("Set Admin Password", type="password")
                if st.button("Save & Encrypt"):
                    save_auth_data({"password": hash_password(pwd)})
                    st.rerun()
            else:
                pwd = st.text_input("Access Key", type="password")
                if st.button("Unlock 🔑", use_container_width=True, type="primary"):
                    if hash_password(pwd) == data["password"]:
                        st.session_state.auth_step = "activating"
                        st.rerun()
                    else:
                        st.error("Invalid Key")
        return False

    # --- STEP 2: ACTIVATING (CINEMATIC) ---
    if st.session_state.auth_step == "activating":
        # Trigger audio here
        play_activation_sound()
        st.markdown("<h1 style='text-align: center; color: #00FF00;'>SYSTEM ONLINE</h1>", unsafe_allow_html=True)
        cinematic_sequence()
        
        # Transition
        st.session_state.auth_step = "ready"
        st.rerun()

    # --- STEP 3: START BUTTON PAGE (AUDIO CONTINUES) ---
    if st.session_state.auth_step == "ready":
        # IMPORTANT: Keep the audio component present so it doesn't cut off!
        play_activation_sound() 
        
        _, col2, _ = st.columns([1, 2, 1])
        with col2:
            st.markdown("<br><br>", unsafe_allow_html=True)
            st.markdown("<h1 style='text-align: center; color: #4A90E2;'>welcome to rudhra labs</h1>", unsafe_allow_html=True)
            
            img_path = "ChatGPT Image Mar 29, 2026, 09_35_46 PM.png"
            if os.path.exists(img_path):
                # Using columns for strict centering of moderate size
                _, mid, _ = st.columns([0.5, 2, 0.5])
                mid.image(img_path, width=350)
            
            st.markdown("<br>", unsafe_allow_html=True)
            if st.button("🚀 start rudhra", use_container_width=True, type="primary"):
                st.session_state.auth_step = "enter_app"
                st.rerun()
        return False

    if st.session_state.auth_step == "enter_app":
        return True

# --- EXECUTION ---
if run_auth_system():
    st.title("💬 Main Agent Interface")
    st.write("Welcome, Admin.")
    if st.sidebar.button("Secure Logout"):
        st.session_state.auth_step = "login"
        st.rerun()