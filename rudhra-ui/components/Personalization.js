"use client";

import { useState, useEffect } from "react";
import { getUserContext, saveUserContext } from "@/lib/api";

export default function Personalization({ onClose }) {
  const [context, setContext] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    getUserContext().then((data) => setContext(data.raw_text || ""));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage("");
    try {
      await saveUserContext(context);
      setMessage("✅ Preferences saved successfully!");
      setTimeout(() => setMessage(""), 3000);
    } catch (err) {
      setMessage("❌ Error saving preferences");
    }
    setSaving(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" style={{ width: 600, padding: 32 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h2 className="auth-title" style={{ margin: 0, fontSize: "1.4rem", textAlign: "left" }}>🎯 Personalization</h2>
          <button className="thread-action-btn" onClick={onClose} style={{ fontSize: "1.2rem", width: 36, height: 36 }}>✕</button>
        </div>

        <p className="auth-subtitle" style={{ textAlign: "left", marginBottom: 20 }}>
          Tell Rudhra about your background, interests, and how you prefer to learn.
        </p>

        <textarea
          className="auth-input"
          style={{ height: 300, resize: "none", padding: 20, lineHeight: 1.6 }}
          placeholder="Example: My name is Nitish. I'm an AI researcher. I prefer concise answers and technical explanations with Python code examples..."
          value={context}
          onChange={(e) => setContext(e.target.value)}
        />

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12 }}>
          <span style={{ fontSize: "0.85rem", color: "var(--neon-green)" }}>{message}</span>
          <div style={{ display: "flex", gap: 12 }}>
            <button className="modal-btn cancel" onClick={onClose}>Cancel</button>
            <button className="auth-btn" style={{ width: 120, padding: "10px 0" }} onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "💾 Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
