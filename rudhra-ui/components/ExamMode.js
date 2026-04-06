"use client";

import { useState, useEffect, useRef } from "react";
import { processExamFiles, startExam, evaluateExamText, evaluateExamImage } from "@/lib/api";

export default function ExamMode({ onClose }) {
  const [step, setStep] = useState("upload"); // upload, config, exam, report
  const [files, setFiles] = useState([]);
  const [totalPages, setTotalPages] = useState(0);
  const [config, setConfig] = useState({
    numQuestions: 5,
    timeLimit: 2, // minutes per question
    evalMode: "Text",
  });

  const [questions, setQuestions] = useState([]);
  const [mcqQuestions, setMcqQuestions] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [results, setResults] = useState([]);
  const [startTime, setStartTime] = useState(null);
  const [timer, setTimer] = useState(0);
  const [userAnswer, setUserAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [error, setError] = useState("");
  const [isCameraOpen, setIsCameraOpen] = useState(false);

  const timerRef = useRef(null);
  const fileInputRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    if (isCameraOpen && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [isCameraOpen]);

  // ── STEP 1: UPLOAD ───────────────────────────────────

  const handleUploadFiles = async (e) => {
    const selectedFiles = Array.from(e.target.files);
    if (selectedFiles.length === 0) return;
    setLoading(true);
    setError("");
    try {
      const data = await processExamFiles(selectedFiles);
      setFiles(selectedFiles);
      setTotalPages(data.total_pages);
      setStep("config");
      setConfig((prev) => ({
        ...prev,
        numQuestions: Math.min(5, data.total_pages),
      }));
    } catch (err) {
      setError("❌ Failed to process files. Ensure they are valid PDF/Docx/PPT.");
    }
    setLoading(false);
  };

  // ── STEP 2: CONFIG ───────────────────────────────────

  const handleStartExam = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await startExam(files, config.numQuestions, config.evalMode);
      setQuestions(data.questions);
      setMcqQuestions(data.mcq_questions || []);
      setResults([]);
      setCurrentIdx(0);
      setStep("exam");
      startQuestionTimer();
    } catch (err) {
      setError("❌ Failed to generate questions. Please try again.");
    }
    setLoading(false);
  };

  // ── STEP 3: EXAM LOOP ────────────────────────────────

  const startQuestionTimer = () => {
    const limit = config.timeLimit * 60;
    setTimer(limit);
    setStartTime(Date.now());
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimer((t) => {
        if (t <= 1) {
          clearInterval(timerRef.current);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
  };

  const handleNext = async (skip = false) => {
    if (loading) return;
    setLoading(true);
    const currQ = questions[currentIdx];
    let evaluation = "";
    let score = "Score: 0/10";

    if (skip || timer === 0) {
      evaluation = "Score: 0/10\nFeedback: No answer submitted or time expired.";
    } else if (config.evalMode === "MCQ") {
      const mcq = mcqQuestions[currentIdx];
      const correct = mcq.correct;
      const correctText = mcq.options[correct];
      if (userAnswer === correct) {
        score = "Score: 10/10";
        evaluation = `Correct! The answer is ${correct}) ${correctText}`;
      } else {
        evaluation = `Incorrect. You selected ${userAnswer}. The correct answer was ${correct}) ${correctText}`;
      }
    } else if (config.evalMode === "Image (Handwritten)") {
      evaluation = await evaluateExamText(currQ, userAnswer);
      score = evaluation.evaluation.split("\n")[0];
      evaluation = evaluation.evaluation;
    } else {
      const res = await evaluateExamText(currQ, userAnswer);
      score = res.evaluation.split("\n")[0];
      evaluation = res.evaluation;
    }

    const newResult = {
      n: currentIdx + 1,
      question: currQ,
      score,
      feedback: evaluation,
    };

    setResults((prev) => [...prev, newResult]);
    setUserAnswer("");

    if (currentIdx + 1 < questions.length) {
      setCurrentIdx(currentIdx + 1);
      startQuestionTimer();
    } else {
      setStep("report");
      if (timerRef.current) clearInterval(timerRef.current);
    }
    setLoading(false);
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const currQ = questions[currentIdx];
    setIsExtracting(true);
    setLoading(true);
    setError("");
    try {
      const res = await evaluateExamImage(file, currQ);
      setUserAnswer(res.cleaned_answer);
    } catch (err) {
      setError("❌ Image extraction failed. Please try again.");
    }
    setIsExtracting(false);
    setLoading(false);
  };

  const startCamera = async () => {
    setError("");
    try {
      // Compatibility constraints: first try environment/rear, then any video
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: { ideal: "environment" } } 
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
      }
      
      streamRef.current = stream;
      setIsCameraOpen(true);
    } catch (err) {
      setError("❌ Could not access camera. Please ensure permissions are granted.");
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setIsCameraOpen(false);
  };

  const capturePhoto = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0);
    
    canvas.toBlob(async (blob) => {
      const file = new File([blob], "capture.png", { type: "image/png" });
      const currQ = questions[currentIdx];
      setIsExtracting(true);
      setLoading(true);
      try {
        const res = await evaluateExamImage(file, currQ);
        setUserAnswer(res.cleaned_answer);
        stopCamera();
      } catch (err) {
        setError("❌ Live photo extraction failed.");
      }
      setIsExtracting(false);
      setLoading(false);
    }, "image/png");
  };

  // ── UI HELPERS ───────────────────────────────────────

  const formatTime = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec < 10 ? "0" : ""}${sec}`;
  };

  const renderCurrentStep = () => {
    switch (step) {
      case "upload":
        return (
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <div style={{ fontSize: "4rem", marginBottom: 20 }}>📁</div>
            <h3 className="modal-title">Step 1: Upload Study Material</h3>
            <p className="auth-subtitle" style={{ marginBottom: 30 }}>
              Upload PDF, Docx, or PPT files to generate exam questions.
            </p>
            <input ref={fileInputRef} type="file" multiple accept=".pdf,.docx,.doc,.pptx,.ppt" onChange={handleUploadFiles} style={{ display: "none" }} />
            <button className="new-chat-btn" onClick={() => fileInputRef.current.click()} disabled={loading}>
              {loading ? (
                <span>
                  <span style={{ display: "inline-block", animation: "spin 1s linear infinite", marginRight: 8 }}>⏳</span>
                  {error || "Analyzing document..."}
                </span>
              ) : "📂 Select Study Materials"}
            </button>
            {loading && (
              <div style={{ marginTop: 20, padding: "12px 20px", background: "rgba(33,150,243,0.1)", borderRadius: 8, border: "1px solid rgba(33,150,243,0.2)" }}>
                <div style={{ fontSize: "0.85rem", color: "var(--accent-secondary)" }}>
                  🔄 Reading file and counting pages... This may take 10–30 seconds.
                </div>
              </div>
            )}
            {!loading && error && <p style={{ color: "var(--error)", fontSize: "0.85rem", marginTop: 12 }}>{error}</p>}
            <button 
              className="modal-btn cancel" 
              style={{ width: "100%", marginTop: 12, border: "1px solid var(--glass-border)", background: "transparent", color: "#fff" }} 
              onClick={onClose}
            >
              💬 Back to Chat
            </button>
          </div>
        );

      case "config":
        return (
          <div>
            <h3 className="modal-title" style={{ marginBottom: 20 }}>Step 2: Exam Rules</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 20, marginBottom: 32 }}>
              <div>
                <label style={{ fontSize: "0.8rem", color: "var(--text-muted)", display: "block", marginBottom: 8 }}>Evaluation Mode</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {["Text", "Image (Handwritten)", "MCQ"].map((m) => (
                    <button
                      key={m}
                      className={`modal-btn ${config.evalMode === m ? "confirm" : "cancel"}`}
                      style={{ flex: 1, padding: "10px" }}
                      onClick={() => setConfig((p) => ({ ...p, evalMode: m }))}
                    >
                      {m === "Image (Handwritten)" ? "🖊️ Handwriting" : m === "MCQ" ? "✅ MCQ" : "⌨️ Text"}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", gap: 20 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: "0.8rem", color: "var(--text-muted)", display: "block", marginBottom: 8 }}>Total Questions (Max {totalPages})</label>
                  <input
                    type="number"
                    className="modal-input"
                    value={config.numQuestions || ""}
                    min={1}
                    max={totalPages}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      setConfig((p) => ({ ...p, numQuestions: isNaN(val) ? 0 : val }));
                    }}
                    style={{ marginBottom: 0 }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: "0.8rem", color: "var(--text-muted)", display: "block", marginBottom: 8 }}>Minutes Per Question</label>
                  <input
                    type="number"
                    className="modal-input"
                    value={config.timeLimit || ""}
                    min={1}
                    max={30}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      setConfig((p) => ({ ...p, timeLimit: isNaN(val) ? 0 : val }));
                    }}
                    style={{ marginBottom: 0 }}
                  />
                </div>
              </div>
            </div>

            <button className="auth-btn" onClick={handleStartExam} disabled={loading}>
              {loading ? "🤖 AI is generating your questions..." : "🚀 Start Examination"}
            </button>
            {loading && (
              <div style={{ marginTop: 12, padding: "10px 16px", background: "rgba(33,150,243,0.08)", borderRadius: 8, border: "1px solid rgba(33,150,243,0.2)" }}>
                <div style={{ fontSize: "0.8rem", color: "var(--accent-secondary)" }}>
                  ⚙️ Analyzing {totalPages} pages and creating {config.numQuestions} questions via AI... Please wait (30–60s).
                </div>
              </div>
            )}
            <button className="modal-btn cancel" style={{ width: "100%", marginTop: 10, border: "none" }} onClick={() => setStep("upload")}>⬅ Back to Upload</button>
          </div>
        );

      case "exam":
        const timeUp = timer === 0;
        return (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Question {currentIdx + 1} of {questions.length}</span>
              <span
                style={{
                  fontSize: "1rem",
                  fontWeight: 700,
                  color: timer < 10 ? "var(--error)" : "var(--neon-green)",
                  background: "rgba(0, 0, 0, 0.4)",
                  padding: "4px 12px",
                  borderRadius: 20,
                  border: `1px solid ${timer < 10 ? "var(--error)" : "var(--glass-border)"}`,
                }}
              >
                ⏱ {formatTime(timer)}
              </span>
            </div>

            <div style={{ background: "rgba(255, 255, 255, 0.03)", padding: 20, borderRadius: 8, border: "1px solid var(--glass-border)", marginBottom: 20 }}>
              <p style={{ margin: 0, lineHeight: 1.6, color: "var(--text-primary)" }}>{questions[currentIdx]}</p>
            </div>

            {config.evalMode === "MCQ" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
                {Object.entries(mcqQuestions[currentIdx]?.options || {}).map(([key, val]) => (
                  <button
                    key={key}
                    onClick={() => !timeUp && setUserAnswer(key)}
                    style={{
                      textAlign: "left",
                      padding: "14px 18px",
                      background: userAnswer === key ? "rgba(74, 144, 226, 0.15)" : "rgba(15, 23, 42, 0.5)",
                      border: `1px solid ${userAnswer === key ? "var(--accent-primary)" : "var(--glass-border)"}`,
                      borderRadius: 8,
                      cursor: timeUp ? "not-allowed" : "pointer",
                      transition: "0.2s",
                      fontSize: "0.9rem",
                      color: "var(--text-primary)",
                      opacity: timeUp && userAnswer !== key ? 0.3 : 1,
                    }}
                    disabled={timeUp}
                  >
                    <span style={{ fontWeight: 700, color: "var(--accent-primary)", marginRight: 10 }}>{key})</span>
                    {val}
                  </button>
                ))}
              </div>
            ) : (
              <div style={{ marginBottom: 24 }}>
                {config.evalMode === "Image (Handwritten)" && (
                  <div style={{ marginBottom: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <input type="file" accept="image/*" style={{ display: "none" }} id="image-upload" onChange={handleImageUpload} />
                    <label
                      htmlFor="image-upload"
                      className="new-chat-btn"
                      style={{ cursor: "pointer", display: "inline-flex", width: "auto", padding: "8px 20px" }}
                    >
                      📸 Upload Handwritten Photo
                    </label>
                    <button
                      className="new-chat-btn"
                      onClick={isCameraOpen ? stopCamera : startCamera}
                      style={{ cursor: "pointer", display: "inline-flex", width: "auto", padding: "8px 20px", background: isCameraOpen ? "var(--error)" : "var(--accent-primary)" }}
                      disabled={loading}
                    >
                      {isCameraOpen ? "✕ Close Camera" : "📷 Take Photo Live"}
                    </button>
                  </div>
                )}

                {isExtracting && (
                  <div style={{ marginBottom: 16, padding: "8px 12px", background: "rgba(74, 144, 226, 0.1)", borderRadius: 8, border: "1px solid var(--accent-primary)", fontSize: "0.85rem", color: "var(--accent-primary)" }}>
                    <span style={{ display: "inline-block", animation: "spin 1s linear infinite", marginRight: 8 }}>⏳</span>
                    AI is extracting text from your handwritten photo...
                  </div>
                )}

                {isCameraOpen && (
                  <div style={{ position: "relative", marginBottom: 20, borderRadius: 12, overflow: "hidden", border: "2px solid var(--accent-primary)" }}>
                    <video ref={videoRef} autoPlay playsInline style={{ width: "100%", display: "block" }} />
                    <canvas ref={canvasRef} style={{ display: "none" }} />
                    <div style={{ position: "absolute", bottom: 20, left: 0, right: 0, textAlign: "center" }}>
                      <button 
                        onClick={capturePhoto}
                        disabled={loading}
                        style={{ 
                          width: 60, 
                          height: 60, 
                          borderRadius: "50%", 
                          border: "4px solid white", 
                          background: "var(--accent-primary)",
                          boxShadow: "0 0 20px rgba(0,0,0,0.5)",
                          cursor: "pointer"
                        }}
                      >
                        {loading ? "⌛" : "📸"}
                      </button>
                    </div>
                  </div>
                )}
                <textarea
                  className="auth-input"
                  style={{ height: 180, resize: "none", fontSize: "0.9rem" }}
                  placeholder={timeUp ? "Time Expired" : "Type your answer here..."}
                  value={userAnswer}
                  onChange={(e) => setUserAnswer(e.target.value)}
                  disabled={timeUp}
                />
              </div>
            )}

            <button className="auth-btn" onClick={() => handleNext()} disabled={loading}>
              {loading ? "Submitting..." : currentIdx + 1 === questions.length ? "🏁 Finish Exam" : "⏩ Submit & Next"}
            </button>
          </div>
        );

      case "report":
        return (
          <div style={{ maxWidth: "100%", overflowX: "auto" }}>
            <h3 className="modal-title" style={{ marginBottom: 20 }}>🎓 Final Exam Report</h3>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
              <thead>
                <tr style={{ background: "rgba(74, 144, 226, 0.1)" }}>
                  <th style={{ padding: 12, border: "1px solid var(--glass-border)", textAlign: "center", width: 40 }}>#</th>
                  <th style={{ padding: 12, border: "1px solid var(--glass-border)", textAlign: "left" }}>Question</th>
                  <th style={{ padding: 12, border: "1px solid var(--glass-border)", textAlign: "center", width: 80 }}>Score</th>
                  <th style={{ padding: 12, border: "1px solid var(--glass-border)", textAlign: "left" }}>Feedback</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--glass-border)" }}>
                    <td style={{ padding: 12, textAlign: "center", color: "var(--text-muted)" }}>{r.n}</td>
                    <td style={{ padding: 12, color: "var(--text-secondary)" }}>{r.question}</td>
                    <td style={{ padding: 12, textAlign: "center", fontWeight: 700, color: r.score.includes("10/10") ? "var(--neon-green)" : "var(--error)" }}>
                      {r.score.replace("Score: ", "")}
                    </td>
                    <td style={{ padding: 12, color: "var(--text-muted)", whiteSpace: "pre-wrap", maxWidth: 300 }}>{r.feedback}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="auth-btn" style={{ marginTop: 24 }} onClick={() => setStep("upload")}>⬅ Back to Upload</button>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" style={{ width: step === "report" ? 1000 : 540, maxHeight: "90vh", overflow: "auto", transition: "width 0.3s" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: "1.5rem" }}>📝</span>
            <h2 className="auth-title" style={{ margin: 0, fontSize: "1.2rem", textAlign: "left" }}>Proctor Exam Mode</h2>
          </div>
          <button 
            className="thread-action-btn" 
            onClick={onClose} 
            style={{ 
              fontSize: "1.5rem", 
              width: 32, 
              height: 32, 
              color: "var(--text-muted)",
              transition: "0.2s"
            }}
          >✕</button>
        </div>
        {renderCurrentStep()}
      </div>
    </div>
  );
}
