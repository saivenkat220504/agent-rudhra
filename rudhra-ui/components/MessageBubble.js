"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { atomDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { getImageUrl, appendChatToPdf } from "@/lib/api";

export default function MessageBubble({ role, content, imageId, image_base64, style, threadId, previewImage, question, ragMode, onExplain }) {
  const isUser = role === "user";
  const isImage = !!imageId || !!image_base64;

  const [translatedContent, setTranslatedContent] = useState(null);
  const [isTranslating, setIsTranslating] = useState(false);

  const handleDownload = async () => {
    if (!content) return;
    try {
      const res = await appendChatToPdf(threadId, content, question);
      if (res.status === "success") {
        alert("📥 Appended to PDF!");
      } else {
        if (res.detail && res.detail.includes("path not set")) {
          const newPath = prompt(
            "⚠️ PDF path not set. Enter a filename (e.g. My_Chat.pdf) to save it to your Desktop:",
            "My_Archived_Chat.pdf"
          );
          if (newPath) {
            window.dispatchEvent(new CustomEvent("set-pdf-path", { detail: { threadId, path: newPath } }));
          }
        } else {
          alert("⚠️ " + res.detail);
        }
      }
    } catch (err) {
      alert("❌ Failed to append. Please use the 'Set PDF Path' button at the top-right first.");
    }
  };

  const handleTranslate = async (lang) => {
    if (!content) return;
    setIsTranslating(true);
    try {
      const res = await fetch("/api/chat/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: content, target_language: lang }),
      });
      const data = await res.json();
      if (res.ok && data.translated_text) {
        setTranslatedContent(data.translated_text);
      } else {
        alert("Translation failed: " + (data.detail || "Unknown error"));
      }
    } catch (err) {
      alert("Error: " + err.message);
    }
    setIsTranslating(false);
  };

  let displayContent = translatedContent || content;
  if (isUser && displayContent && typeof displayContent === 'string' && displayContent.includes("You MUST ensure the response is:")) {
    displayContent = displayContent.split("You MUST ensure the response is:")[0].trim();
  }

  return (
    <div className={`message ${isUser ? "user" : "assistant"} message-bubble-wrapper`} style={style}>
      <div className="message-body">
        {isImage ? (
          <div className="message-content">
            <p style={{ marginBottom: 8, fontSize: "0.85rem", opacity: 0.7 }}>🖼️ Image generated:</p>
            <img
              src={image_base64 ? `data:image/png;base64,${image_base64}` : getImageUrl(imageId)}
              alt="Generated"
              loading="lazy"
              style={{
                maxWidth: "450px", maxHeight: "350px", width: "100%",
                objectFit: "contain", borderRadius: "12px",
                border: "2px solid #2196f3",
                boxShadow: "0 10px 40px rgba(0,0,0,0.6)",
                display: "block", marginTop: "12px"
              }}
            />
          </div>
        ) : (
          <div className="message-content" style={{ position: "relative" }}>
            {/* Show attached image in user bubble */}
            {previewImage && (
              <img
                src={previewImage}
                alt="attached"
                style={{
                  maxWidth: "260px", maxHeight: "220px",
                  objectFit: "cover", borderRadius: "10px",
                  display: "block", marginBottom: "8px",
                  border: "1px solid rgba(255,255,255,0.2)"
                }}
              />
            )}
            {isTranslating ? (
               <div style={{ padding: "20px 0", fontStyle: "italic", opacity: 0.7 }}>
                 Translating... Please wait...
               </div>
            ) : (
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  code({ node, inline, className, children, ...props }) {
                    const match = /language-(\w+)/.exec(className || "");
                    return !inline && match ? (
                      <SyntaxHighlighter
                        style={atomDark}
                        language={match[1]}
                        PreTag="div"
                        {...props}
                      >
                        {String(children).replace(/\n$/, "")}
                      </SyntaxHighlighter>
                    ) : (
                      <code className={className} {...props}>
                        {children}
                      </code>
                    );
                  },
                  // Improved typography for high-premium look
                  h1: ({ children }) => <h1 style={{ margin: "16px 0 8px", fontSize: "1.4rem" }}>{children}</h1>,
                  h2: ({ children }) => <h2 style={{ margin: "14px 0 7px", fontSize: "1.2rem" }}>{children}</h2>,
                  h3: ({ children }) => <h3 style={{ margin: "12px 0 6px", fontSize: "1.05rem" }}>{children}</h3>,
                  p: ({ children }) => <p style={{ marginBottom: "12px" }}>{children}</p>,
                  ul: ({ children }) => <ul style={{ paddingLeft: "20px", marginBottom: "12px" }}>{children}</ul>,
                  li: ({ children }) => <li style={{ marginBottom: "4px" }}>{children}</li>,
                  img: ({ src, alt }) => (
                    <img 
                      src={src} 
                      alt={alt} 
                      style={{
                        maxWidth: "450px",
                        maxHeight: "350px",
                        width: "100%",
                        objectFit: "contain",
                        borderRadius: "12px",
                        border: "2px solid #2196f3",
                        boxShadow: "0 10px 40px rgba(0,0,0,0.6)",
                        display: "block",
                        marginTop: "12px",
                        marginBottom: "12px"
                      }} 
                    />
                  )
                }}
              >
                {displayContent}
              </ReactMarkdown>
            )}
            
            {!isUser && content && (
              <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.1)", gap: "8px" }}>
                <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                  <span style={{ fontSize: "0.75rem", opacity: 0.7, marginRight: "4px" }}>Translate to:</span>
                  <button 
                    onClick={() => handleTranslate('Telugu')}
                    disabled={isTranslating}
                    style={{
                      background: translatedContent && translatedContent !== content && !isTranslating ? "rgba(33, 150, 243, 0.05)" : "rgba(33, 150, 243, 0.1)",
                      border: "1px solid rgba(33, 150, 243, 0.3)",
                      borderRadius: "6px",
                      color: "#2196f3",
                      padding: "4px 8px",
                      fontSize: "0.75rem",
                      cursor: isTranslating ? "wait" : "pointer",
                      transition: "all 0.2s"
                    }}
                  >
                    Telugu
                  </button>
                  <button 
                    onClick={() => handleTranslate('Hindi')}
                    disabled={isTranslating}
                    style={{
                      background: translatedContent && translatedContent !== content && !isTranslating ? "rgba(33, 150, 243, 0.05)" : "rgba(33, 150, 243, 0.1)",
                      border: "1px solid rgba(33, 150, 243, 0.3)",
                      borderRadius: "6px",
                      color: "#2196f3",
                      padding: "4px 8px",
                      fontSize: "0.75rem",
                      cursor: isTranslating ? "wait" : "pointer",
                      transition: "all 0.2s"
                    }}
                  >
                    Hindi
                  </button>
                  {translatedContent && (
                    <button 
                      onClick={() => setTranslatedContent(null)}
                      style={{
                        background: "transparent",
                        border: "1px solid rgba(255, 255, 255, 0.2)",
                        borderRadius: "6px",
                        color: "inherit",
                        opacity: 0.8,
                        padding: "4px 8px",
                        fontSize: "0.75rem",
                        cursor: "pointer",
                        marginLeft: "4px",
                        transition: "all 0.2s"
                      }}
                    >
                      Reset (English)
                    </button>
                  )}
                </div>
                <button 
                  className="download-icon-btn" 
                  onClick={handleDownload}
                  title="Append to your Archive PDF"
                  style={{
                    background: "rgba(33, 150, 243, 0.1)",
                    border: "1px solid #2196f3",
                    borderRadius: "6px",
                    color: "#2196f3",
                    padding: "4px 8px",
                    fontSize: "0.8rem",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center"
                  }}
                >
                  📥 <span style={{ fontSize: "0.7rem", marginLeft: 4 }}>Save to PDF</span>
                </button>
              </div>
            )}
            {!isUser && content && ragMode && (
              <div style={{ marginTop: 12, display: "flex", gap: "8px", alignItems: "center" }}>
                <input
                  type="text"
                  placeholder="Deep Dive Keyword"
                  style={{
                    flex: 1,
                    background: "rgba(0,0,0,0.2)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "6px",
                    color: "white",
                    padding: "6px 12px",
                    fontSize: "0.8rem",
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const val = e.target.value.trim();
                      if (val && onExplain) onExplain(val);
                      e.target.value = "";
                    }
                  }}
                />
                <button
                  onClick={(e) => {
                    const inputEl = e.target.previousSibling;
                    const val = inputEl.value.trim();
                    if (val && onExplain) onExplain(val);
                    inputEl.value = "";
                  }}
                  style={{
                    background: "#2196f3",
                    border: "none",
                    borderRadius: "6px",
                    color: "white",
                    padding: "6px 12px",
                    fontSize: "0.8rem",
                    cursor: "pointer",
                    fontWeight: "bold"
                  }}
                >
                  Explain
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
