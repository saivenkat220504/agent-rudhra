"use client";

import { useState } from "react";
import PlanTree from "@/components/PlanStudy/PlanTree";
import ChatPanel from "@/components/PlanStudy/ChatPanel";
import AddPlanModal from "@/components/PlanStudy/AddPlanModal";
import { useRouter } from "next/navigation";

export default function PlanStudyPage() {
  const [chatState, setChatState] = useState(null); // { threadId, subjectName }
  const [showAddPlan, setShowAddPlan] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const router = useRouter();

  const handleRefresh = () => setRefreshKey((k) => k + 1);

  return (
    <div className="plan-study-layout">
      {/* Header */}
      <div className="plan-study-header">
        <button className="plan-back-btn" onClick={() => router.push("/")}>
          ← Back to Chat
        </button>
        <div className="plan-study-title">
          <span>📚</span>
          <span>Plan &amp; Study</span>
        </div>
        <button className="plan-add-btn" onClick={() => setShowAddPlan(true)}>
          ➕ Add New Plan
        </button>
      </div>

      {/* Body */}
      <div className="plan-study-body">
        <div className={`plan-tree-panel ${chatState ? "shrunk" : ""}`}>
          <PlanTree
            key={refreshKey}
            onOpenChat={(threadId, subjectName) => setChatState({ threadId, subjectName })}
            onRefresh={handleRefresh}
          />
        </div>

        {chatState && (
          <div className="plan-chat-panel">
            <ChatPanel
              threadId={chatState.threadId}
              subjectName={chatState.subjectName}
              onClose={() => setChatState(null)}
            />
          </div>
        )}
      </div>

      {showAddPlan && (
        <AddPlanModal
          onClose={() => setShowAddPlan(false)}
          onSuccess={() => {
            setShowAddPlan(false);
            handleRefresh();
          }}
        />
      )}
    </div>
  );
}
