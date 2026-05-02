"use client";

import { useState, useEffect } from "react";
import SubjectNode from "./SubjectNode";

export default function PlanTree({ onOpenChat, onRefresh }) {
  const [plans, setPlans] = useState([]);
  const [expandedPlans, setExpandedPlans] = useState({});
  const [loading, setLoading] = useState(true);
  const [addSubjectPlanId, setAddSubjectPlanId] = useState(null);
  const [newSubjectName, setNewSubjectName] = useState("");
  const [newSubjectChapters, setNewSubjectChapters] = useState([{ name: "", deadline: "" }]);
  const [subjectErrors, setSubjectErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const fetchPlans = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/plans");
      const data = await res.json();
      setPlans(data || []);
    } catch (e) {
      console.error("Failed to fetch plans", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlans();
  }, []);

  const togglePlan = (planId) => {
    setExpandedPlans((prev) => ({ ...prev, [planId]: !prev[planId] }));
  };

  const deletePlan = async (planId) => {
    if (!window.confirm("Delete this plan and all its subjects and chapters?")) return;
    await fetch(`/api/plans/${planId}`, { method: "DELETE" });
    fetchPlans();
    onRefresh?.();
  };

  const validateSubjectForm = () => {
    const errors = {};
    if (!newSubjectName.trim()) errors.name = "Subject name is required";
    newSubjectChapters.forEach((ch, i) => {
      if (!ch.name.trim()) errors[`ch_name_${i}`] = "Chapter name required";
      if (!ch.deadline) {
        errors[`ch_dl_${i}`] = "Deadline required";
      } else if (new Date(ch.deadline) < new Date()) {
        errors[`ch_dl_${i}`] = "Deadline must be in the future";
      }
    });
    setSubjectErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const addSubject = async (planId) => {
    if (!validateSubjectForm()) return;
    setSubmitting(true);
    try {
      await fetch("/api/subjects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan_id: planId,
          subject_name: newSubjectName,
          chapters: newSubjectChapters,
        }),
      });
      setAddSubjectPlanId(null);
      setNewSubjectName("");
      setNewSubjectChapters([{ name: "", deadline: "" }]);
      setSubjectErrors({});
      fetchPlans();
    } catch (e) {
      console.error("Failed to add subject", e);
    } finally {
      setSubmitting(false);
    }
  };

  const addChapterRow = () => {
    setNewSubjectChapters((prev) => [...prev, { name: "", deadline: "" }]);
  };

  const updateChapter = (i, field, val) => {
    setNewSubjectChapters((prev) =>
      prev.map((ch, idx) => (idx === i ? { ...ch, [field]: val } : ch))
    );
  };

  const removeChapterRow = (i) => {
    if (newSubjectChapters.length === 1) return;
    setNewSubjectChapters((prev) => prev.filter((_, idx) => idx !== i));
  };

  if (loading) {
    return (
      <div className="plan-loading">
        <div className="plan-spinner" /> Loading plans...
      </div>
    );
  }

  if (plans.length === 0) {
    return (
      <div className="plan-empty">
        <div className="plan-empty-icon">📋</div>
        <p>No study plans yet.</p>
        <p className="plan-empty-hint">Click <strong>➕ Add New Plan</strong> to get started.</p>
      </div>
    );
  }

  return (
    <div className="plan-tree">
      {plans.map((plan) => (
        <div key={plan.id} className="plan-node">
          {/* Plan Row */}
          <div className="plan-row" onClick={() => togglePlan(plan.id)}>
            <span className="plan-chevron">{expandedPlans[plan.id] ? "▼" : "▶"}</span>
            <span className="plan-name">{plan.plan_name}</span>
            <span className="plan-meta">{plan.num_days}d · {plan.subjects?.length || 0} subjects</span>
            <div className="plan-row-actions" onClick={(e) => e.stopPropagation()}>
              <button
                className="tree-action-btn add"
                title="Add Subject"
                onClick={() => {
                  setAddSubjectPlanId(plan.id);
                  setExpandedPlans((prev) => ({ ...prev, [plan.id]: true }));
                }}
              >➕</button>
              <button
                className="tree-action-btn delete"
                title="Delete Plan"
                onClick={() => deletePlan(plan.id)}
              >🗑</button>
            </div>
          </div>

          {/* Subjects */}
          {expandedPlans[plan.id] && (
            <div className="plan-children">
              {(plan.subjects || []).map((subject) => (
                <SubjectNode
                  key={subject.id}
                  subject={subject}
                  onOpenChat={onOpenChat}
                  onRefresh={fetchPlans}
                />
              ))}

              {/* Add Subject Inline Form */}
              {addSubjectPlanId === plan.id && (
                <div className="add-subject-form">
                  <div className="form-field">
                    <input
                      className={`plan-input ${subjectErrors.name ? "input-error" : ""}`}
                      placeholder="Subject Name *"
                      value={newSubjectName}
                      onChange={(e) => setNewSubjectName(e.target.value)}
                    />
                    {subjectErrors.name && <span className="field-error">{subjectErrors.name}</span>}
                  </div>
                  <p className="form-section-label">Chapters</p>
                  {newSubjectChapters.map((ch, i) => (
                    <div key={i} className="chapter-form-row">
                      <div className="form-field" style={{ flex: 1 }}>
                        <input
                          className={`plan-input ${subjectErrors[`ch_name_${i}`] ? "input-error" : ""}`}
                          placeholder={`Chapter ${i + 1} Name *`}
                          value={ch.name}
                          onChange={(e) => updateChapter(i, "name", e.target.value)}
                        />
                        {subjectErrors[`ch_name_${i}`] && (
                          <span className="field-error">{subjectErrors[`ch_name_${i}`]}</span>
                        )}
                      </div>
                      <div className="form-field" style={{ flex: 1 }}>
                        <input
                          type="datetime-local"
                          className={`plan-input ${subjectErrors[`ch_dl_${i}`] ? "input-error" : ""}`}
                          value={ch.deadline}
                          onChange={(e) => updateChapter(i, "deadline", e.target.value)}
                        />
                        {subjectErrors[`ch_dl_${i}`] && (
                          <span className="field-error">{subjectErrors[`ch_dl_${i}`]}</span>
                        )}
                      </div>
                      <button className="tree-action-btn delete" onClick={() => removeChapterRow(i)}>✕</button>
                    </div>
                  ))}
                  <button className="plan-ghost-btn" onClick={addChapterRow}>➕ Add Chapter</button>
                  <div className="form-actions">
                    <button className="plan-ghost-btn" onClick={() => { setAddSubjectPlanId(null); setSubjectErrors({}); }}>
                      Cancel
                    </button>
                    <button className="plan-save-btn" onClick={() => addSubject(plan.id)} disabled={submitting}>
                      {submitting ? "Saving..." : "Save Subject"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
