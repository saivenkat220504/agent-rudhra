"use client";

import { useState, useRef } from "react";
import { transcribeVoice } from "@/lib/api";

export default function VoiceRecorder({ onTranscription, disabled }) {
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const mediaRecorder = useRef(null);
  const chunks = useRef([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorder.current = recorder;
      chunks.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks.current, { type: "audio/webm" });
        setProcessing(true);

        try {
          const text = await transcribeVoice(blob);
          if (text) {
            onTranscription?.(text);
          }
        } catch (err) {
          console.error("Transcription error:", err);
        }

        setProcessing(false);
      };

      recorder.start();
      setRecording(true);
    } catch (err) {
      console.error("Microphone access denied:", err);
    }
  };

  const stopRecording = () => {
    mediaRecorder.current?.stop();
    setRecording(false);
  };

  if (processing) {
    return (
      <button className="input-action-btn" disabled title="Transcribing...">
        <span style={{ animation: "typingBounce 1s ease-in-out infinite" }}>⏳</span>
      </button>
    );
  }

  if (recording) {
    return (
      <button
        className="input-action-btn"
        onClick={stopRecording}
        title="Stop Recording"
        style={{
          color: "var(--error)",
          animation: "statusPulse 1s ease-in-out infinite",
        }}
      >
        🛑
      </button>
    );
  }

  return (
    <button
      className="input-action-btn"
      onClick={startRecording}
      disabled={disabled}
      title="Record Voice"
    >
      🎤
    </button>
  );
}
