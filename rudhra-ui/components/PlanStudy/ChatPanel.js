"use client";

import { useState, useEffect, useRef } from "react";

export default function ChatPanel({ threadId, subjectName, onClose }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const endRef = useRef(null);

  useEffect(() => {
    fetch(`/api/threads/${threadId}/messages`)
      .then((r) => r.json())
      .then((msgs) => setMessages(msgs || []))
      .catch(() => {});
  }, [threadId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamText]);

  const send = async () => {
    const text = input.trim();
    if (!text || streaming) return;
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setInput("");
    setStreaming(true);
    setStreamText("");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thread_id: threadId, message: text }),
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let full = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === "chunk") { full += data.content; setStreamText(full); }
            if (data.type === "done") {
              setMessages((prev) => [...prev, { role: "assistant", content: full }]);
              setStreamText("");
              setStreaming(false);
            }
          } catch {}
        }
      }
    } catch {
      setStreaming(false);
    }
  };

  return (
    <div className="plan-chat-inner">
      <div className="plan-chat-header">
        <div className="plan-chat-title">💬 {subjectName}</div>
        <button className="plan-close-btn" onClick={onClose}>✕</button>
      </div>
      <div className="plan-chat-messages">
        {messages.map((m, i) => (
          <div key={i} className={`plan-msg ${m.role}`}>
            <div className="plan-msg-bubble">{m.content}</div>
          </div>
        ))}
        {streamText && (
          <div className="plan-msg assistant">
            <div className="plan-msg-bubble">{streamText}</div>
          </div>
        )}
        {streaming && !streamText && (
          <div className="plan-msg assistant">
            <div className="plan-msg-bubble plan-typing">
              <span /><span /><span />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>
      <div className="plan-chat-input-row">
        <input
          className="plan-chat-input"
          placeholder="Ask about this subject..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
          disabled={streaming}
        />
        <button className="plan-send-btn" onClick={send} disabled={!input.trim() || streaming}>➤</button>
      </div>
    </div>
  );
}
