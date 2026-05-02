"use client";

import { useState } from "react";

const makeChapter = () => ({ name: "", deadline: "" });
const makeSubject = () => ({ name: "", chapters: [makeChapter()] });

export default function AddPlanModal({ onClose, onSuccess }) {
  const [planName, setPlanName] = useState("");
  const [numDays, setNumDays] = useState("");
  const [subjects, setSubjects] = useState([makeSubject()]);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const validate = () => {
    const errs = {};
    if (!planName.trim()) errs.planName = "Plan name is required";
    if (!numDays || Number(numDays) <= 0) errs.numDays = "Number of days must be > 0";
    subjects.forEach((sub, si) => {
      if (!sub.name.trim()) errs[`sub_${si}`] = "Subject name is required";
      sub.chapters.forEach((ch, ci) => {
        if (!ch.name.trim()) errs[`ch_name_${si}_${ci}`] = "Chapter name required";
        if (!ch.deadline) errs[`ch_dl_${si}_${ci}`] = "Deadline required";
        else if (new Date(ch.deadline) < new Date()) errs[`ch_dl_${si}_${ci}`] = "Deadline must be future";
      });
    });
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const updateChapter = (si, ci, field, val) =>
    setSubjects((prev) =>
      prev.map((s, i) =>
        i === si ? { ...s, chapters: s.chapters.map((ch, j) => (j === ci ? { ...ch, [field]: val } : ch)) } : s
      )
    );

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan_name: planName,
          num_days: Number(numDays),
          subjects: subjects.map((s) => ({
            subject_name: s.name,
            chapters: s.chapters.map((ch) => ({ chapter_name: ch.name, deadline: ch.deadline })),
          })),
        }),
      });
      if (!res.ok) throw new Error("Failed");
      onSuccess?.();
    } catch {
      alert("Failed to create plan. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card add-plan-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close-btn" onClick={onClose}>✕</button>
        <div className="modal-title">📚 Create Study Plan</div>
        <div className="add-plan-scroll">
          <div className="plan-form-section">
            <div className="form-field">
              <label className="form-label">Plan Name *</label>
              <input className={`plan-input ${errors.planName ? "input-error" : ""}`} placeholder="e.g. Physics Revision" value={planName} onChange={(e) => setPlanName(e.target.value)} />
              {errors.planName && <span className="field-error">{errors.planName}</span>}
            </div>
            <div className="form-field">
              <label className="form-label">Number of Days *</label>
              <input type="number" min="1" className={`plan-input ${errors.numDays ? "input-error" : ""}`} placeholder="e.g. 30" value={numDays} onChange={(e) => setNumDays(e.target.value)} />
              {errors.numDays && <span className="field-error">{errors.numDays}</span>}
            </div>
          </div>

          {subjects.map((sub, si) => (
            <div key={si} className="plan-form-section subject-section">
              <div className="subject-section-header">
                <h3 className="plan-form-heading">Subject {si + 1}</h3>
                {subjects.length > 1 && <button className="tree-action-btn delete" onClick={() => setSubjects((p) => p.filter((_, i) => i !== si))}>🗑</button>}
              </div>
              <div className="form-field">
                <input className={`plan-input ${errors[`sub_${si}`] ? "input-error" : ""}`} placeholder="Subject Name *" value={sub.name} onChange={(e) => setSubjects((p) => p.map((s, i) => i === si ? { ...s, name: e.target.value } : s))} />
                {errors[`sub_${si}`] && <span className="field-error">{errors[`sub_${si}`]}</span>}
              </div>
              <p className="form-section-label">Chapters</p>
              {sub.chapters.map((ch, ci) => (
                <div key={ci} className="chapter-form-row">
                  <div className="form-field" style={{ flex: 1 }}>
                    <input className={`plan-input ${errors[`ch_name_${si}_${ci}`] ? "input-error" : ""}`} placeholder={`Chapter ${ci + 1} *`} value={ch.name} onChange={(e) => updateChapter(si, ci, "name", e.target.value)} />
                    {errors[`ch_name_${si}_${ci}`] && <span className="field-error">{errors[`ch_name_${si}_${ci}`]}</span>}
                  </div>
                  <div className="form-field" style={{ flex: 1 }}>
                    <input type="datetime-local" className={`plan-input ${errors[`ch_dl_${si}_${ci}`] ? "input-error" : ""}`} value={ch.deadline} onChange={(e) => updateChapter(si, ci, "deadline", e.target.value)} />
                    {errors[`ch_dl_${si}_${ci}`] && <span className="field-error">{errors[`ch_dl_${si}_${ci}`]}</span>}
                  </div>
                  {sub.chapters.length > 1 && <button className="tree-action-btn delete" onClick={() => setSubjects((p) => p.map((s, i) => i === si ? { ...s, chapters: s.chapters.filter((_, j) => j !== ci) } : s))}>✕</button>}
                </div>
              ))}
              <button className="plan-ghost-btn" onClick={() => setSubjects((p) => p.map((s, i) => i === si ? { ...s, chapters: [...s.chapters, makeChapter()] } : s))}>➕ Add Chapter</button>
            </div>
          ))}
          <button className="plan-ghost-btn add-subject-btn" onClick={() => setSubjects((p) => [...p, makeSubject()])}>➕ Add Another Subject</button>
        </div>
        <div className="modal-footer">
          <button className="plan-ghost-btn" onClick={onClose}>Cancel</button>
          <button className="plan-save-btn" onClick={handleSubmit} disabled={submitting}>{submitting ? "Creating..." : "✅ Create Plan"}</button>
        </div>
      </div>
    </div>
  );
}
