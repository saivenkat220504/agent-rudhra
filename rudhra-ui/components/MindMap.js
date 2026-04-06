"use client";

import { useState } from "react";

export default function MindMap({ onClose }) {
  const handleLaunch = () => {
    window.open("/mindmap", "_blank", "noopener,noreferrer");
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" style={{ width: 440, padding: 32, textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: "4.5rem", marginBottom: 20 }}>🧠</div>
        <h2 className="modal-title" style={{ marginTop: 0, fontSize: "1.8rem" }}>MindMap Architect</h2>
        <p className="auth-subtitle" style={{ marginBottom: 32 }}>
          Step into a focused environment to visualize complex topics, brainstorm ideas, and decompose your learning materials.
        </p>

        <div className="info-card" style={{
          background: "rgba(33, 150, 243, 0.08)",
          border: "1px solid rgba(33, 150, 243, 0.2)",
          padding: 16,
          borderRadius: 8,
          marginBottom: 32,
          fontSize: "0.85rem",
          color: "var(--text-secondary)",
          textAlign: "left"
        }}>
          ✨ <strong>Interactive Portal:</strong> Opens in a new tab with full support for 1-click PDF-to-Map and Topic-to-Map generation.
        </div>

        <div style={{ display: "flex", gap: 12 }}>
          <button className="modal-btn cancel" style={{ flex: 1 }} onClick={onClose}>Not Now</button>
          <button className="auth-btn" style={{ flex: 2, padding: "14px 0" }} onClick={handleLaunch}>
            🚀 Launch Portal
          </button>
        </div>
      </div>
    </div>
  );
}
