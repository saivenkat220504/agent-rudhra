"use client";

import { useState } from "react";

export default function SubjectNode({ subject, onOpenChat, onRefresh }) {
  const [expanded, setExpanded] = useState(false);
  const [addChapter, setAddChapter] = useState(false);
  const [newChName, setNewChName] = useState("");
  const [newChDeadline, setNewChDeadline] = useState("");
  const [errors, setErrors] = useState({});
  const [confirmChapter, setConfirmChapter] = useState(null); // chapter to confirm delete
  const [submitting, setSubmitting] = useState(false);
  const [chapters, setChapters] = useState(subject.chapters || []);

  const deleteSubject = async () => {
    if (!window.confirm(`Delete subject "${subject.subject_name}" and all its chapters?`)) return;
    await fetch(`/api/subjects/${subject.id}`, { method: "DELETE" });
    onRefresh?.();
  };

  const completeChapter = async (chapter) => {
    await fetch(`/api/chapters/${chapter.id}`, { method: "DELETE" });
    setChapters((prev) => prev.filter((c) => c.id !== chapter.id));
    setConfirmChapter(null);
  };

  const addChapterToSubject = async () => {
    const errs = {};
    if (!newChName.trim()) errs.name = "Chapter name is required";
    if (!newChDeadline) {
      errs.deadline = "Deadline is required";
    } else if (new Date(newChDeadline) < new Date()) {
      errs.deadline = "Deadline must be in the future";
    }
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/chapters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject_id: subject.id,
          chapter_name: newChName,
          deadline: newChDeadline,
        }),
      });
      const data = await res.json();
      setChapters((prev) => [...prev, data]);
      setNewChName("");
      setNewChDeadline("");
      setAddChapter(false);
      setErrors({});
    } catch (e) {
      console.error("Failed to add chapter", e);
    } finally {
      setSubmitting(false);
    }
  };

  const formatDeadline = (dl) => {
    if (!dl) return "";
    const d = new Date(dl);
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  const isOverdue = (dl) => dl && new Date(dl) < new Date();

  return (
    <div className="subject-node">
      {/* Subject Row */}
      <div className="subject-row" onClick={() => setExpanded((v) => !v)}>
        <span className="plan-chevron">{expanded ? "▼" : "▶"}</span>
        <span className="subject-name">{subject.subject_name}</span>
        <div className="plan-row-actions" onClick={(e) => e.stopPropagation()}>
          <button
            className="tree-action-btn chat"
            title="Chat about this subject"
            onClick={() => onOpenChat(subject.chat_thread_id, subject.subject_name)}
          >💬</button>
          <button
            className="tree-action-btn add"
            title="Add Chapter"
            onClick={() => { setAddChapter(true); setExpanded(true); }}
          >➕</button>
          <button
            className="tree-action-btn delete"
            title="Delete Subject"
            onClick={deleteSubject}
          >🗑</button>
        </div>
      </div>

      {/* Chapters */}
      {expanded && (
        <div className="chapter-list">
          {chapters.map((ch) => (
            <div key={ch.id} className="chapter-row">
              <input
                type="checkbox"
                className="chapter-checkbox"
                onChange={() => setConfirmChapter(ch)}
                checked={false}
              />
              <span className={`chapter-name ${isOverdue(ch.deadline) ? "overdue" : ""}`}>
                {ch.chapter_name}
              </span>
              <span className={`chapter-deadline ${isOverdue(ch.deadline) ? "overdue" : ""}`}>
                {isOverdue(ch.deadline) ? "⚠️ " : "🕐 "}{formatDeadline(ch.deadline)}
              </span>
              <button
                className="tree-action-btn delete"
                title="Delete Chapter"
                onClick={() => setConfirmChapter(ch)}
              >🗑</button>
            </div>
          ))}

          {addChapter && (
            <div className="add-chapter-inline">
              <div className="form-field">
                <input
                  className={`plan-input ${errors.name ? "input-error" : ""}`}
                  placeholder="Chapter Name *"
                  value={newChName}
                  onChange={(e) => setNewChName(e.target.value)}
                />
                {errors.name && <span className="field-error">{errors.name}</span>}
              </div>
              <div className="form-field">
                <input
                  type="datetime-local"
                  className={`plan-input ${errors.deadline ? "input-error" : ""}`}
                  value={newChDeadline}
                  onChange={(e) => setNewChDeadline(e.target.value)}
                />
                {errors.deadline && <span className="field-error">{errors.deadline}</span>}
              </div>
              <div className="form-actions">
                <button className="plan-ghost-btn" onClick={() => { setAddChapter(false); setErrors({}); }}>Cancel</button>
                <button className="plan-save-btn" onClick={addChapterToSubject} disabled={submitting}>
                  {submitting ? "Saving..." : "Add Chapter"}
                </button>
              </div>
            </div>
          )}

          {chapters.length === 0 && !addChapter && (
            <div className="chapter-empty">No chapters yet. Click ➕ to add one.</div>
          )}
        </div>
      )}

      {/* Completion Confirm Modal */}
      {confirmChapter && (
        <div className="modal-overlay" onClick={() => setConfirmChapter(null)}>
          <div className="modal-card confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">✅ Mark as Complete?</div>
            <p className="confirm-text">
              Are you sure you have completed <strong>"{confirmChapter.chapter_name}"</strong>?
              This will permanently delete it.
            </p>
            <div className="confirm-actions">
              <button className="plan-ghost-btn" onClick={() => setConfirmChapter(null)}>No, not yet</button>
              <button className="plan-save-btn" onClick={() => completeChapter(confirmChapter)}>Yes, I'm done!</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
