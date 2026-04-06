"use client";

import { useState, useEffect, useRef } from "react";
import { getMaterials, uploadMaterial } from "@/lib/api";

export default function MaterialLibrary({ onClose, onConnect, activeHash }) {
  const [materials, setMaterials] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const fileRef = useRef(null);

  useEffect(() => {
    loadMaterials();
  }, []);

  const loadMaterials = async () => {
    const data = await getMaterials();
    setMaterials(data || []);
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadStatus("Processing PDF and generating embeddings...");

    try {
      const result = await uploadMaterial(file);

      if (result.status === "exists") {
        setUploadStatus(`⚠️ Already exists as "${result.source_filename}"`);
        onConnect(result.content_hash, result.source_filename);
      } else {
        setUploadStatus("✅ Ingested successfully!");
        onConnect(result.content_hash, result.source_filename);
      }

      await loadMaterials();
    } catch (err) {
      setUploadStatus(`❌ ${err.message}`);
    }

    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card"
        style={{ width: 520, maxHeight: "80vh", overflow: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 className="modal-title" style={{ margin: 0 }}>📚 Material Library</h3>
          <button
            className="thread-action-btn"
            onClick={onClose}
            style={{ fontSize: "1.1rem", width: 32, height: 32 }}
          >
            ✕
          </button>
        </div>

        {/* Existing materials */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1.2, color: "var(--text-muted)", marginBottom: 12 }}>
            Available Materials
          </div>

          {materials.length === 0 ? (
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
              No materials ingested yet. Upload a PDF below.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {materials.map((m) => {
                const isActive = activeHash === m.content_hash;
                return (
                  <div
                    key={m.content_hash}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "10px 14px",
                      background: isActive ? "rgba(74, 144, 226, 0.12)" : "rgba(15, 23, 42, 0.5)",
                      border: `1px solid ${isActive ? "rgba(74, 144, 226, 0.3)" : "var(--glass-border)"}`,
                      borderRadius: "var(--radius-sm)",
                    }}
                  >
                    <span>📄</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "0.88rem", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {m.source_filename}
                      </div>
                      <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                        {m.upload_date}
                      </div>
                    </div>
                    <button
                      className="modal-btn confirm"
                      style={{
                        padding: "5px 12px",
                        fontSize: "0.78rem",
                        opacity: isActive ? 0.5 : 1,
                      }}
                      disabled={isActive}
                      onClick={() => onConnect(m.content_hash, m.source_filename)}
                    >
                      {isActive ? "Connected" : "Connect"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Upload new */}
        <div style={{ borderTop: "1px solid var(--glass-border)", paddingTop: 20 }}>
          <div style={{ fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1.2, color: "var(--text-muted)", marginBottom: 12 }}>
            Upload New Material
          </div>

          <input
            ref={fileRef}
            type="file"
            accept=".pdf"
            style={{ display: "none" }}
            onChange={handleUpload}
          />

          <button
            className="new-chat-btn"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            style={{ marginBottom: 12 }}
          >
            {uploading ? "⏳ Processing..." : "📁 Select PDF File"}
          </button>

          {uploadStatus && (
            <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", marginTop: 8 }}>
              {uploadStatus}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
