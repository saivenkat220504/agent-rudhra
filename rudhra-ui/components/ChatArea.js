"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import MessageBubble from "./MessageBubble";
import VoiceRecorder from "./VoiceRecorder";
import { sendMessage, getMessages, uploadImage, sendRagQuery, setPdfPath, getPdfPath, getDefaultPdfPath } from "@/lib/api";

const TIMEOUT_MS = 90000; // 90 seconds max wait

export default function ChatArea({ threadId, onTitleGenerated, ragMode, ragHash }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [imageBase64, setImageBase64] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [waitSeconds, setWaitSeconds] = useState(0);
  const [pdfPath, setPdfPathState] = useState(null);
  const [defaultDesktopPath, setDefaultDesktopPath] = useState("");

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const timeoutRef = useRef(null);
  const timerRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => {
    if (!threadId) return;
    setMessages([]);
    setStreamText("");
    getMessages(threadId)
      .then((msgs) => setMessages(msgs || []))
      .catch(() => {});
    
    // Fetch PDF export path
    getPdfPath(threadId).then(res => setPdfPathState(res.pdf_path)).catch(() => {});
    
    // Fetch default desktop path once
    if (!defaultDesktopPath) {
      getDefaultPdfPath().then(res => setDefaultDesktopPath(res.default_path)).catch(() => {});
    }
  }, [threadId, defaultDesktopPath]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamText]);

  useEffect(() => {
    const handleCustomPathSet = async (e) => {
      const { threadId: tid, path: p } = e.detail;
      if (tid === threadId) {
        const res = await setPdfPath(tid, p);
        if (res.status === "success") {
          setPdfPathState(p);
          alert("✅ PDF Output Path Set! Try saving again.");
        }
      }
    };
    window.addEventListener("set-pdf-path", handleCustomPathSet);
    return () => window.removeEventListener("set-pdf-path", handleCustomPathSet);
  }, [threadId]);

  // Handle auto-scroll to search results
  useEffect(() => {
    const handleSearchJump = (e) => {
      const { threadId: tid, preview } = e.detail;
      if (tid === threadId) {
        // Strip <b> tags and ellipsis for matching
        const cleanPreview = preview.replace(/<b>|<\/b>/g, "").replace(/\.\.\./g, "").trim();
        const foundIdx = messages.findIndex(m => m.content && m.content.toLowerCase().includes(cleanPreview.toLowerCase().slice(0, 20)));
        
        if (foundIdx !== -1) {
          setTimeout(() => {
            const bubbles = document.querySelectorAll(".message-bubble-wrapper");
            const target = bubbles[foundIdx];
            if (target) {
              target.scrollIntoView({ behavior: "smooth", block: "center" });
              target.classList.add("search-highlight-flash");
              setTimeout(() => target.classList.remove("search-highlight-flash"), 3000);
            }
          }, 500); // Give time for message list to render
        }
      }
    };
    window.addEventListener("search-jump", handleSearchJump);
    return () => window.removeEventListener("search-jump", handleSearchJump);
  }, [threadId, messages]);


  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const newHeight = Math.min(el.scrollHeight, 160);
    el.style.height = (newHeight > 44 ? newHeight : 44) + "px";
  }, [input]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearTimeout(timeoutRef.current);
      clearInterval(timerRef.current);
      abortRef.current?.abort();
    };
  }, []);

  const stopStreaming = useCallback((errorMsg = null) => {
    clearTimeout(timeoutRef.current);
    clearInterval(timerRef.current);
    setWaitSeconds(0);
    setStreamText("");
    setStreaming(false);
    if (errorMsg) {
      setMessages((prev) => [...prev, { role: "assistant", content: errorMsg }]);
    }
  }, []);

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setImagePreview(ev.target.result);
    reader.readAsDataURL(file);
    const b64 = await uploadImage(file);
    setImageBase64(b64);
  };

  const clearImage = () => {
    setImageBase64(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const startTimer = () => {
    setWaitSeconds(0);
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setWaitSeconds((s) => s + 1);
    }, 1000);
  };

  const handleSetPath = async () => {
    const p = prompt(
      `Enter filename or full path for PDF export.\nDefault location: ${defaultDesktopPath}`,
      pdfPath || "My_Archived_Chat.pdf"
    );
    if (p) {
      const res = await setPdfPath(threadId, p);
      if (res.status === "success") {
        setPdfPathState(res.pdf_path);
        alert(`✅ PDF Output Path Set!\nLocation: ${res.pdf_path}`);
      }
    }
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text && !imageBase64 || streaming) return;

    const userMsg = {
      role: "user",
      content: text || "(image attached)",
      previewImage: imagePreview  // store local preview for display
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setStreamText("");
    setStreaming(true);
    startTimer();

    const sentImageB64 = imageBase64;
    clearImage();

    // Set a hard timeout in case the backend never responds
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      stopStreaming("⚠️ Request timed out. The server is taking too long. Please try again.");
    }, TIMEOUT_MS);

    try {
      if (ragMode && ragHash) {
        let ragResponse = "";
        await sendRagQuery(
          threadId,
          text,
          ragHash,
          (chunk) => {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = setTimeout(() => {
              stopStreaming("⚠️ Request timed out. The server is taking too long. Please try again.");
            }, TIMEOUT_MS);
            ragResponse += chunk;
            setStreamText(ragResponse);
          },
          () => {
            clearTimeout(timeoutRef.current);
            clearInterval(timerRef.current);
            setWaitSeconds(0);
            if (ragResponse) {
              setMessages((prev) => [...prev, { role: "assistant", content: ragResponse }]);
            }
            setStreamText("");
            setStreaming(false);
          },
          (title) => onTitleGenerated?.(title),
          (err) => {
            stopStreaming(`❌ PDF Chat Error: ${err}`);
          }
        );
        return;
      }

      let fullResponse = "";
      await sendMessage(
        threadId,
        text,
        sentImageB64,
        (chunk) => {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = setTimeout(() => {
            stopStreaming("⚠️ Request timed out. The server is taking too long. Please try again.");
          }, TIMEOUT_MS);
          fullResponse += chunk;
          setStreamText(fullResponse);
        },
        () => {
          clearTimeout(timeoutRef.current);
          clearInterval(timerRef.current);
          setWaitSeconds(0);
          if (fullResponse) {
            setMessages((prev) => [...prev, { role: "assistant", content: fullResponse }]);
          }
          setStreamText("");
          setStreaming(false);
        },
        (imageId) => {
          clearTimeout(timeoutRef.current);
          clearInterval(timerRef.current);
          setWaitSeconds(0);
          setMessages((prev) => [...prev, { role: "assistant", content: "", image_id: imageId }]);
          setStreamText("");
          setStreaming(false);
        },
        (title) => onTitleGenerated?.(title),
        (err) => {
          stopStreaming(`❌ Error: ${err}`);
        }
      );
    } catch (err) {
      stopStreaming(`❌ Network Error: Could not reach the server. Make sure the backend is running on port 8000.`);
    }
  };

  const handleGenerateImage = async () => {
    const promptText = prompt("Describe the image you want to generate:", input || "");
    if (!promptText) return;

    setStreaming(true);
    startTimer();
    setMessages((prev) => [...prev, { role: "user", content: `🎨 Generate image: ${promptText}` }]);
    
    try {
      const res = await import("@/lib/api").then(m => m.generateImage(promptText));
      if (res.image_base64) {
        // We'll simulate receiving an image_id by creating a temporal data URL or similar
        // but the backend `img_gen` returns base64. Let's adjust MessageBubble to handle base64 or add it to messages.
        setMessages((prev) => [...prev, { 
          role: "assistant", 
          content: "", 
          image_base64: res.image_base64 
        }]);
      }
    } catch (err) {
      alert("❌ Image generation failed: " + err.message);
    } finally {
      stopStreaming();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="chat-area-main">
      {/* Dynamic Header */}
      <div className="chat-header-modern">
        <div className="header-left" style={{ display: "flex", alignItems: "center", width: "100%", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <span className="header-icon">{ragMode ? "📄" : "💬"}</span>
            <span className="header-title">{ragMode ? "PDF Chat" : "Agent"}</span>
            <span className="status-badge">
              <span className="dot" />
              {ragMode ? "RAG Mode" : "Online"}
            </span>
          </div>
          
           {!ragMode && (
            <button 
              className="pdf-config-btn" 
              onClick={handleSetPath} 
              title="Set PDF Export Path"
              style={{
                background: "#0a0f1d",
                border: "1px solid #2196f3",
                borderRadius: "8px",
                padding: "6px 14px",
                fontSize: "0.85rem",
                fontWeight: "700",
                color: "#2196f3",
                boxShadow: "0 0 15px rgba(33, 150, 243, 0.2)",
                cursor: "pointer"
              }}
            >
              {pdfPath ? "📁 Path Set" : "⚙️ Set PDF Path"}
            </button>
          )}
        </div>
      </div>

      {/* Message List */}
      <div className="messages-viewport">
        <div className="messages-stack">
          {messages.length === 0 && !streaming && (
            <div className="center-empty-state">
              <div className="empty-icon-large">{ragMode ? "📄" : "🧠"}</div>
              <h1 className="empty-title-large">
                {ragMode ? "PDF Chat Mode" : "Rudhra AI"}
              </h1>
              <p className="empty-subtitle-large">
                {ragMode
                  ? "Ask questions about your connected PDF document."
                  : "Start a conversation — ask anything, generate images, search the web."}
              </p>
            </div>
          )}

          {messages.map((msg, idx) => (
            <MessageBubble
              key={idx}
              role={msg.role}
              content={msg.content}
              imageId={msg.image_id}
              image_base64={msg.image_base64}
              threadId={threadId}
              previewImage={msg.previewImage}
              question={idx > 0 && messages[idx-1].role === "user" ? messages[idx-1].content : null}
            />
          ))}

          {streaming && streamText && (
            <MessageBubble 
              role="assistant" 
              content={streamText} 
              threadId={threadId} 
              question={messages.length > 0 && messages[messages.length-1].role === "user" ? messages[messages.length-1].content : null}
            />
          )}

          {streaming && !streamText && (
            <div className="message assistant loading-state">
              <div className="message-body">
                <div className="dots-indicator">
                  <span>.</span><span>.</span><span>.</span>
                </div>
                {waitSeconds > 5 && (
                  <div className="wait-timer">⏳ Thinking... {waitSeconds}s</div>
                )}
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Pill */}
      <div className="input-strip">
        <div className="input-pill">
          {imagePreview && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }}>
              <img
                src={imagePreview}
                alt="attachment"
                style={{
                  width: 56,
                  height: 56,
                  objectFit: "cover",
                  borderRadius: 8,
                  border: "2px solid #2196f3",
                  flexShrink: 0,
                }}
              />
              <button
                onClick={clearImage}
                style={{
                  background: "#ef4444",
                  color: "white",
                  border: "none",
                  borderRadius: "50%",
                  width: 22,
                  height: 22,
                  cursor: "pointer",
                  fontSize: "0.75rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >✕</button>
            </div>
          )}

          <textarea
            ref={textareaRef}
            className="slim-textarea"
            placeholder={ragMode ? "Ask about your PDF..." : "Type message..."}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={streaming}
          />

          <div className="input-pill-actions">
            <VoiceRecorder
              onTranscription={(t) => setInput((prev) => (prev ? prev + " " + t : t))}
              disabled={streaming}
            />
            {!ragMode && (
              <>
                <button className="pill-action-btn" title="Generate Image" onClick={handleGenerateImage}>🎨</button>
                <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleImageUpload} />
                <button className="pill-action-btn" title="Analyze Image" onClick={() => fileInputRef.current?.click()}>🖼️</button>
              </>
            )}
            <button
              className="pill-send-btn"
              onClick={handleSend}
              disabled={(!input.trim() && !imageBase64) || streaming}
            >
              ➤
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
