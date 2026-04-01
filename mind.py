import webbrowser
import streamlit as st

# ✅ Constant for the deployed React Frontend
FRONTEND_URL = "https://mindmap-frontend-production-abc2.up.railway.app"

def open_mindmap():
    """
    Triggers the system's default web browser to open the Mind Map tool.
    """
    try:
        opened = webbrowser.open(FRONTEND_URL, new=2)
        if opened:
            return {"status": "success", "message": f"🚀 Opening Mind Map: {FRONTEND_URL}", "url": FRONTEND_URL}
        else:
            return {"status": "error", "message": "Browser check failed. Use the link below.", "url": FRONTEND_URL}
    except Exception as e:
        return {"status": "error", "message": f"Error: {str(e)}", "url": FRONTEND_URL}

def render_mind_map_page():
    """
    The page displayed when st.session_state.show_mindmap_page is True.
    """
    st.title("🧠 Mind Map Generator")
    
    if st.button("⬅ Back to Chat"):
        st.session_state.show_mindmap_page = False
        st.rerun()

    st.divider()
    
    st.info("The Mind Map Generator is a specialized external tool.")
    st.markdown(f"**URL:** `{FRONTEND_URL}`")
    
    if st.button("🚀 Launch Generator Now", type="primary", use_container_width=True):
        result = open_mindmap()
        if result["status"] == "success":
            st.toast(result["message"])
        else:
            st.error(result["message"])
            
    st.link_button("🔗 Direct Link (Manual)", FRONTEND_URL, use_container_width=True)