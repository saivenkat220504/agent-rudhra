"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { searchChats } from "@/lib/api";

function ThreadItem({ thread, isActive, onSelect, onRename, onDelete }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(thread.title || "");

  const handleRename = (e) => {
    e.stopPropagation();
    if (editTitle.trim() && editTitle !== thread.title) {
      onRename(thread.thread_id, editTitle);
    }
    setIsEditing(false);
  };

  const handleDelete = (e) => {
    e.stopPropagation();
    if (window.confirm("Are you sure you want to delete this conversation?")) {
      onDelete(thread.thread_id);
    }
  };

  return (
    <div
      className={`thread-item ${isActive ? "active" : ""}`}
      onClick={() => !isEditing && onSelect(thread.thread_id)}
    >
      <div className="thread-icon">💬</div>
      {isEditing ? (
        <input
          type="text"
          className="thread-rename-input"
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          onBlur={handleRename}
          onKeyDown={(e) => e.key === "Enter" && handleRename(e)}
          autoFocus
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <>
          <div className="thread-title">{thread.title || "New Conversation..."}</div>
          <div className="thread-actions">
            <button 
              className="thread-action-btn edit" 
              onClick={(e) => { e.stopPropagation(); setIsEditing(true); }}
              title="Rename"
            >
              ✏️
            </button>
            <button 
              className="thread-action-btn delete" 
              onClick={handleDelete}
              title="Delete"
            >
              🗑️
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function Sidebar({
  threads,
  activeThreadId,
  onSelectThread,
  onNewChat,
    onRenameThread,
  onDeleteThread,
  onToggleRag,
  ragMode,
  ragName,
  onOpenLibrary,
  onOpenExam,
  onOpenMindMap,
  onOpenPersonalization,
  onLogout,
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [isSearching, setIsSearching] = useState(false);
  const [recentSearches, setRecentSearches] = useState([]);
  const searchTimeoutRef = useRef(null);

  // Load recent searches from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("rudhra_recent_searches");
    if (saved) setRecentSearches(JSON.parse(saved));
  }, []);

  const saveRecentSearch = (query) => {
    if (!query.trim()) return;
    const updated = [query, ...recentSearches.filter(s => s !== query)].slice(0, 5);
    setRecentSearches(updated);
    localStorage.setItem("rudhra_recent_searches", JSON.stringify(updated));
  };

  const performSearch = useCallback(async (q) => {
    if (!q.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    try {
      const results = await searchChats(q);
      setSearchResults(results || []);
    } catch (err) {
      console.error("Search failed:", err);
    } finally {
      setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    clearTimeout(searchTimeoutRef.current);
    if (searchQuery) {
      searchTimeoutRef.current = setTimeout(() => {
        performSearch(searchQuery);
      }, 300);
    } else {
      setSearchResults([]);
    }
  }, [searchQuery, performSearch]);

  const handleResultClick = (res) => {
    saveRecentSearch(searchQuery);
    onSelectThread(res.thread_id);
    setSearchQuery("");
    setSearchResults([]);
    // Custom event to handle scrolling to message content
    window.dispatchEvent(new CustomEvent("search-jump", { 
      detail: { threadId: res.thread_id, preview: res.preview } 
    }));
  };

  const handleKeyDown = (e) => {
    if (searchResults.length === 0) return;

    if (e.key === "ArrowDown") {
      setSelectedIndex(prev => (prev + 1) % searchResults.length);
    } else if (e.key === "ArrowUp") {
      setSelectedIndex(prev => (prev - 1 + searchResults.length) % searchResults.length);
    } else if (e.key === "Enter" && selectedIndex >= 0) {
      handleResultClick(searchResults[selectedIndex]);
    } else if (e.key === "Escape") {
      setSearchResults([]);
    }
  };

  const filteredThreads = (threads || []).filter((t) => {
    const title = (t.title || "New Conversation...").toLowerCase();
    return title.includes(searchQuery.toLowerCase());
  });


  return (
    <aside className="sidebar">
      {/* Brand Header */}
      <div className="sidebar-header">
        <div className="sidebar-brand">
          <div className="sidebar-brand-icon">🧠</div>
          <div className="sidebar-brand-text">RUDHRA</div>
        </div>

        <button className="new-chat-btn" onClick={onNewChat}>
          <span>✨ New Chat</span>
        </button>

        <div className="sidebar-search-container">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            className="sidebar-search-input"
            placeholder="Search all chats..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          {(searchQuery || isSearching) && (
            <div className="search-actions">
              {isSearching ? <span className="search-spinner">⏳</span> : (
                <button className="search-clear-btn" onClick={() => { setSearchQuery(""); setSearchResults([]); }}>✕</button>
              )}
            </div>
          )}

          {searchResults.length > 0 && searchQuery && (
            <div className="search-results-dropdown">
              <div className="search-results-header">SUGGESTIONS</div>
              {searchResults.map((res, idx) => (
                <div
                  key={`${res.thread_id}-${idx}`}
                  className={`search-result-item ${selectedIndex === idx ? "selected" : ""}`}
                  onClick={() => handleResultClick(res)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                >
                  <div className="result-main">
                    <span className="result-icon">💬</span>
                    <div className="result-info">
                      <div className="result-title">{res.title}</div>
                      <div className="result-preview" dangerouslySetInnerHTML={{ __html: res.preview }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {searchQuery && !isSearching && searchResults.length === 0 && (
            <div className="search-results-dropdown">
              <div className="no-results-hint">No deep matches found...</div>
            </div>
          )}
        </div>
      </div>

      {/* Tools Section */}
      <div className="sidebar-section">
        <div className="section-label">TOOLS</div>
        <div className="tools-grid">

          {/* Chat with PDF toggle */}
          <div className="tool-item full-width">
            <label className="tool-toggle-row">
              <span>📄 Chat with PDF</span>
              <input
                type="checkbox"
                checked={!!ragMode}
                onChange={(e) => onToggleRag(e.target.checked)}
              />
            </label>
            {ragName && (
              <div className="active-pdf-indicator">
                🟢 {ragName}
              </div>
            )}
          </div>

          <button className="tool-btn" onClick={onOpenLibrary}>
            📚 Material Library
          </button>

          <button className="tool-btn" onClick={onOpenExam}>
            📑 Proctor Exam Mode
          </button>

          <div className="tool-row-split">
            <button className="tool-btn-small" onClick={onOpenMindMap}>🧠 Mind Map</button>
            <button className="tool-btn-small" onClick={onOpenPersonalization}>🎯 Personalize</button>
          </div>

          <button
            className="tool-btn"
            onClick={() => alert("MCP Servers: local_calendar, filesystem — Active ✅")}
          >
            🛠️ MCP Tool
          </button>
        </div>
      </div>

      {/* Conversations Section */}
      <div className="sidebar-section scrollable">
        <div className="section-label">CONVERSATIONS</div>
        <div className="threads-list">
          {filteredThreads.length > 0 ? (
            filteredThreads.map((t) => (
              <ThreadItem 
                key={t.thread_id} 
                thread={t} 
                isActive={activeThreadId === t.thread_id}
                onSelect={onSelectThread}
                onRename={onRenameThread}
                onDelete={onDeleteThread}
              />
            ))
          ) : (
            <div className="no-results-text">No matching chats found</div>
          )}
        </div>
      </div>

      {/* Footer / Logout */}
      <div className="sidebar-footer">
        <button className="logout-btn" onClick={onLogout}>
          <span>🔴</span>
          <span>Logout System</span>
        </button>
      </div>
    </aside>
  );
}
