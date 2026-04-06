"use client";

import { useState, useEffect, useCallback } from "react";
import AuthScreen from "@/components/AuthScreen";
import Sidebar from "@/components/Sidebar";
import ChatArea from "@/components/ChatArea";
import MaterialLibrary from "@/components/MaterialLibrary";
import ExamMode from "@/components/ExamMode";
import MindMap from "@/components/MindMap";
import Personalization from "@/components/Personalization";
import { getThreads, renameThread, deleteThread } from "@/lib/api";

function generateId() {
  return crypto.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export default function HomePage() {
  const [authenticated, setAuthenticated] = useState(false);
  const [threads, setThreads] = useState([]);
  const [activeThread, setActiveThread] = useState(null);

  // Phase 2: RAG state
  const [ragMode, setRagMode] = useState(false);
  const [ragHash, setRagHash] = useState(null);
  const [ragName, setRagName] = useState(null);
  const [showLibrary, setShowLibrary] = useState(false);
  const [showExam, setShowExam] = useState(false);
  const [showMindMap, setShowMindMap] = useState(false);
  const [showPersonalization, setShowPersonalization] = useState(false);

  // Load threads after auth
  const refreshThreads = useCallback(async () => {
    const data = await getThreads();
    setThreads(data || []);
  }, []);

  useEffect(() => {
    if (authenticated) {
      refreshThreads();
    }
  }, [authenticated, refreshThreads]);

  // ── Thread actions ──

  const handleNewChat = () => {
    const newId = generateId();
    setActiveThread(newId);
  };

  const handleSelectThread = async (threadId) => {
    setActiveThread(threadId);
  };

  const handleRenameThread = async (threadId, newTitle) => {
    await renameThread(threadId, newTitle);
    refreshThreads();
  };

  const handleDeleteThread = async (threadId) => {
    await deleteThread(threadId);
    if (activeThread === threadId) {
      setActiveThread(null);
    }
    refreshThreads();
  };

  const handleLogout = () => {
    setAuthenticated(false);
    setActiveThread(null);
    setThreads([]);
  };

  const handleTitleGenerated = () => {
    refreshThreads();
  };

  // ── RAG actions ──

  const handleToggleRag = (enabled) => {
    if (enabled && !ragHash) {
      // No material connected — open library
      setShowLibrary(true);
      return;
    }
    setRagMode(enabled);
  };

  const handleConnectMaterial = (hash, name) => {
    setRagHash(hash);
    setRagName(name);
    setRagMode(true);
    setShowLibrary(false);
  };

  // ── Auth Gate ──
  if (!authenticated) {
    return <AuthScreen onAuthenticated={() => setAuthenticated(true)} />;
  }

  // Ensure a thread is active
  if (!activeThread) {
    const defaultId = threads.length > 0 ? threads[0].thread_id : generateId();
    setActiveThread(defaultId);
    return null;
  }

  return (
    <>
      <div className="app-layout">
        <Sidebar
          threads={threads}
          activeThreadId={activeThread}
          onSelectThread={handleSelectThread}
          onNewChat={handleNewChat}
          onRenameThread={handleRenameThread}
          onDeleteThread={handleDeleteThread}
          onLogout={handleLogout}
          ragMode={ragMode}
          onToggleRag={handleToggleRag}
          ragName={ragName}
          onOpenLibrary={() => setShowLibrary(true)}
          onOpenExam={() => setShowExam(true)}
          onOpenMindMap={() => setShowMindMap(true)}
          onOpenPersonalization={() => setShowPersonalization(true)}
        />
        <ChatArea
          threadId={activeThread}
          onTitleGenerated={handleTitleGenerated}
          ragMode={ragMode}
          ragHash={ragHash}
        />
      </div>

      {/* Modals - Outside app-layout for perfect centering */}
      {showLibrary && (
        <MaterialLibrary
          onClose={() => setShowLibrary(false)}
          onConnect={handleConnectMaterial}
          activeHash={ragHash}
        />
      )}

      {showExam && (
        <ExamMode onClose={() => setShowExam(false)} />
      )}

      {showMindMap && (
        <MindMap onClose={() => setShowMindMap(false)} />
      )}

      {showPersonalization && (
        <Personalization onClose={() => setShowPersonalization(false)} />
      )}
    </>
  );
}
