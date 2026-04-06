/**
 * Rudhra API Client
 * All communication with the FastAPI backend
 */

const API = "/api";

// ── Auth ──────────────────────────────────────────────

export async function getAuthStatus() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(`${API}/auth/status`, { signal: controller.signal });
    clearTimeout(timer);
    return res.json();
  } catch {
    clearTimeout(timer);
    return { has_credentials: true }; // Default: show login form
  }
}

export async function setupAuth(password) {
  const res = await fetch(`${API}/auth/setup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) throw new Error("Setup failed");
  return res.json();
}

export async function login(password) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${API}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (res.status === 401) throw new Error("Invalid key — wrong password");
    if (!res.ok) throw new Error("Login failed — server error");
    return res.json();
  } catch (err) {
    clearTimeout(timer);
    if (err.name === "AbortError") throw new Error("Backend not responding. Please restart the server.");
    throw err;
  }
}

// ── Threads ───────────────────────────────────────────

export async function getThreads() {
  const res = await fetch(`${API}/threads`);
  return res.json();
}

export async function createThread(threadId, title = "New Chat") {
  const res = await fetch(`${API}/threads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ thread_id: threadId, title }),
  });
  return res.json();
}

export async function renameThread(threadId, title) {
  const res = await fetch(`${API}/threads/${threadId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  return res.json();
}

export async function deleteThread(threadId) {
  const res = await fetch(`${API}/threads/${threadId}`, {
    method: "DELETE",
  });
  return res.json();
}

// ── Messages ──────────────────────────────────────────

export async function getMessages(threadId) {
  const res = await fetch(`${API}/threads/${threadId}/messages`);
  return res.json();
}

// ── Chat (SSE) ────────────────────────────────────────

export async function sendMessage(threadId, message, imageBase64 = null, onChunk, onDone, onImage, onTitle, onError) {
  const res = await fetch(`${API}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      thread_id: threadId,
      message,
      image_base64: imageBase64,
    }),
  });

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        const data = JSON.parse(line.slice(6));
        switch (data.type) {
          case "chunk":
            onChunk?.(data.content);
            break;
          case "done":
            onDone?.();
            break;
          case "image":
            onImage?.(data.image_id);
            break;
          case "title":
            onTitle?.(data.title);
            break;
          case "error":
            onError?.(data.content);
            break;
        }
      } catch {}
    }
  }
}

// ── Images ────────────────────────────────────────────

export function getImageUrl(attachmentId) {
  return `${API}/images/${attachmentId}`;
}

// Converts image file to base64 locally — no server upload needed
export async function uploadImage(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result.split(",")[1]); // strip data:image/...;base64, prefix
    reader.readAsDataURL(file);
  });
}

// ── Materials / RAG ───────────────────────────────────

export async function getMaterials() {
  const res = await fetch(`${API}/materials`);
  return res.json();
}

export async function uploadMaterial(file) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API}/materials/upload`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Upload failed");
  }
  return res.json();
}

export async function sendRagQuery(threadId, question, contentHash, onChunk, onDone, onTitle, onError) {
  const res = await fetch(`${API}/rag/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ 
      thread_id: threadId,
      question, 
      content_hash: contentHash 
    }),
  });

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        const data = JSON.parse(line.slice(6));
        switch (data.type) {
          case "chunk":
            onChunk?.(data.content);
            break;
          case "done":
            onDone?.();
            break;
          case "title":
            onTitle?.(data.title);
            break;
          case "error":
            onError?.(data.content);
            break;
        }
      } catch {}
    }
  }
}

// ── Voice Transcription ───────────────────────────

export async function transcribeVoice(audioBlob) {
  const form = new FormData();
  form.append("file", audioBlob, "recording.wav");
  const res = await fetch(`${API}/voice/transcribe`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error("Transcription failed");
  const data = await res.json();
  return data.text;
}

// ── Personalization ────────────────────────────────────
export async function getUserContext() {
  const res = await fetch(`${API}/personalization`);
  return res.json();
}

export async function saveUserContext(rawText) {
  const res = await fetch(`${API}/personalization`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ raw_text: rawText }),
  });
  return res.json();
}

// ── Image Generation ───────────────────────────────────
export async function generateImage(prompt) {
  const res = await fetch(`${API}/image/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  if (!res.ok) throw new Error("Image generation failed");
  return res.json();
}

// ── Exam Mode ─────────────────────────────────────────

export async function processExamFiles(files) {
  const form = new FormData();
  for (const file of files) {
    form.append("files", file);
  }
  const res = await fetch(`${API}/exam/process`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error("Processing failed");
  return res.json();
}

export async function startExam(files, numQuestions, evalMode) {
  const form = new FormData();
  for (const file of files) {
    form.append("files", file);
  }
  form.append("num_questions", numQuestions);
  form.append("eval_mode", evalMode);

  const res = await fetch(`${API}/exam/start`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error("Exam generation failed");
  return res.json();
}

export async function evaluateExamText(question, answer) {
  const res = await fetch(`${API}/exam/evaluate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, answer }),
  });
  if (!res.ok) throw new Error("Evaluation failed");
  return res.json();
}

export async function evaluateExamImage(file, question) {
  const form = new FormData();
  form.append("file", file);
  form.append("question", question);
  const res = await fetch(`${API}/exam/evaluate-image`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error("Image evaluation failed");
  return res.json();
}

// ── Mind Map ──────────────────────────────────────────

export async function getMindMapUrl() {
  const res = await fetch(`${API}/mindmap/url`);
  const data = await res.json();
  return data.url;
}

export async function uploadMindMapPdf(file) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API}/mindmap/upload`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error("Mindmap generation failed");
  return res.json();
}

export async function generateMindMap(topic) {
  const res = await fetch(`${API}/mindmap/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic }),
  });
  if (!res.ok) throw new Error("Mindmap text generation failed");
  return res.json();
}

// ── PDF Archiving ──

export async function setPdfPath(threadId, pdfPath) {
  const res = await fetch(`${API}/chat/download/path`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ thread_id: threadId, pdf_path: pdfPath }),
  });
  return res.json();
}

export async function getPdfPath(threadId) {
  const res = await fetch(`${API}/chat/download/path/${threadId}`);
  return res.json();
}

export async function getDefaultPdfPath() {
  const res = await fetch(`${API}/chat/download/default-path`);
  return res.json();
}

export async function appendChatToPdf(threadId, content, question = null) {
  const res = await fetch(`${API}/chat/download/append`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ thread_id: threadId, content, question }),
  });
  return res.json();
}

export async function searchChats(q) {
  const res = await fetch(`${API}/search?q=${encodeURIComponent(q)}`);
  return res.json();
}
