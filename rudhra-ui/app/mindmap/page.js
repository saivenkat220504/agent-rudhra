"use client";

import { useState, useRef, useEffect } from "react";
import { uploadMindMapPdf, generateMindMap } from "@/lib/api";
import Link from "next/link";

const MindMapNode = ({ node, level = 0 }) => {
  const [isExpanded, setIsExpanded] = useState(level === 0);
  const hasChildren = node.children && node.children.length > 0;
  const isCurrentlyExpanded = hasChildren && isExpanded;

  if (!node) return null;

  return (
    <div className={`mm-node-wrapper ${isCurrentlyExpanded ? 'has-visible-children' : ''}`}>
      <div className={`mm-node level-${level} ${!isCurrentlyExpanded ? 'is-leaf' : ''}`}>
        <div className="mm-node-content">
          <span className="mm-node-label">{node.label}</span>
          {hasChildren && (
            <button 
              className={`mm-node-toggle ${isExpanded ? 'expanded' : ''}`}
              onClick={() => setIsExpanded(!isExpanded)}
            >
              <div className="mm-toggle-play" />
            </button>
          )}
        </div>
      </div>
      
      {isCurrentlyExpanded && (
        <div className="mm-children-container">
          {node.children.filter(c => c && c.label).map((child, i) => (
            <div key={i} className="mm-child-branch">
              <MindMapNode node={child} level={level + 1} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default function MindMapStandalone() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [topic, setTopic] = useState("");
  const [activeTab, setActiveTab] = useState("text"); // text or pdf
  const fileInputRef = useRef(null);

  const handleTextGenerate = async () => {
    if (!topic.trim()) return;
    setLoading(true);
    setError("");
    try {
      const result = await generateMindMap(topic);
      setData(result.root);
    } catch (err) {
      setError("Failed to generate mindmap. Please check your query.");
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError("");
    try {
      const result = await uploadMindMapPdf(file);
      setData(result.root);
    } catch (err) {
      setError("Failed to generate mindmap from PDF.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mm-generator-page">
      {/* Target Image Header Design */}
      <header className="mm-gen-header">
        <div className="mm-gen-title-row">
          <div className="mm-gen-logo">🧠 Mind Map Generator</div>
          <Link href="/" className="mm-back-btn">← Back to Rudhra</Link>
        </div>
        
        <div className="mm-gen-source-block">
          <textarea 
            className="mm-source-input"
            placeholder="Type or paste context here to generate a detailed Mind Map..."
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          />
          <div className="mm-gen-actions">
            <button className="mm-action-btn primary" onClick={handleTextGenerate} disabled={loading}>
              {loading ? "Generating..." : "Generate"}
            </button>
            <button className="mm-action-btn secondary" onClick={() => fileInputRef.current?.click()} disabled={loading}>
               Upload PDF
            </button>
            <input type="file" ref={fileInputRef} style={{display:'none'}} accept=".pdf" onChange={handleFileUpload} />
          </div>
        </div>
      </header>

      <main className="mm-viz-canvas">
        {!data ? (
           <div className="mm-empty-state">
              <div className="mm-empty-box">
                <h3>Ready to Architect?</h3>
                <p>Provide a topic or document above to begin the visualization process.</p>
              </div>
           </div>
        ) : (
          <div className="mm-scroll-container">
            <div className="mm-node-tree">
              <MindMapNode node={data} />
            </div>
          </div>
        )}
      </main>

      {error && <div className="mm-toast-error">{error}</div>}

      <style jsx>{`
        .mm-generator-page {
          height: 100vh;
          width: 100vw;
          background: #0d1117;
          color: #f0f6fc;
          display: flex;
          flex-direction: column;
          font-family: 'Inter', system-ui, sans-serif;
        }

        /* Generator Header Style (Matching Screenshots) */
        .mm-gen-header {
           padding: 24px 60px;
           background: #161b22;
           border-bottom: 1px solid #30363d;
        }
        .mm-gen-title-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
        .mm-gen-logo { font-size: 1.25rem; font-weight: 700; color: #f0f6fc; }
        .mm-back-btn { font-size: 0.85rem; color: #f0f6fc; text-decoration: none; font-weight: 600; }
        .mm-back-btn:visited { color: #f0f6fc; }
        .mm-back-btn:hover { color: #58a6ff; }

        .mm-gen-source-block {
          background: #0d1117;
          border: 1px solid #30363d;
          border-radius: 8px;
          padding: 12px;
        }
        .mm-source-input {
          width: 100%;
          height: 80px;
          background: transparent;
          border: none;
          color: #f0f6fc;
          font-family: inherit;
          font-size: 0.9rem;
          resize: none;
          outline: none;
          padding: 10px;
          border-bottom: 1px solid #30363d;
          margin-bottom: 12px;
        }
        .mm-gen-actions { display: flex; gap: 12px; }
        .mm-action-btn { padding: 6px 16px; border-radius: 6px; font-size: 0.85rem; font-weight: 600; cursor: pointer; border: 1px solid #30363d; transition: 0.2s; }
        .mm-action-btn.primary { background: #238636; color: white; border: none; }
        .mm-action-btn.secondary { background: #21262d; color: #c9d1d9; }
        .mm-action-btn:hover:not(:disabled) { background: #30363d; }
        .mm-action-btn.primary:hover { background: #2ea043; }

        .mm-viz-canvas { flex: 1; overflow: hidden; position: relative; background: #0d1117; }
        .mm-scroll-container { width: 100%; height: 100%; overflow: auto; padding: 100px; }
        .mm-node-tree { display: flex; align-items: center; min-width: max-content; }

        /* Interactive Node Style (Fidelity Matching) */
        :global(.mm-node-wrapper) {
          display: flex;
          align-items: center;
          position: relative;
        }

        :global(.mm-node) {
          padding: 12px 20px;
          background: rgba(33, 41, 59, 0.6);
          backdrop-filter: blur(8px);
          border: 1px solid rgba(88, 166, 255, 0.2);
          border-radius: 50px;
          min-width: 140px;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.4);
          z-index: 5;
          margin-right: 60px; /* Space for L-connector lines */
        }
        :global(.mm-node.is-leaf) { margin-right: 0; }
        :global(.mm-node.level-0) { border: 2px solid #58a6ff; background: rgba(56, 139, 253, 0.1); }

        :global(.mm-node-content) { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
        :global(.mm-node-label) { font-size: 0.95rem; font-weight: 500; color: #c9d1d9; white-space: nowrap; }

        /* Glowing Blue Play Toggle */
        :global(.mm-node-toggle) {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: #58a6ff;
          border: none;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 0 10px rgba(88, 166, 255, 0.4);
        }
        :global(.mm-node-toggle:hover) { transform: scale(1.15); box-shadow: 0 0 15px rgba(88, 166, 255, 0.8); }
        :global(.mm-node-toggle.expanded) { transform: rotate(90deg); background: #388bfd; }
        :global(.mm-toggle-play) {
          width: 0;
          height: 0;
          border-top: 5px solid transparent;
          border-bottom: 5px solid transparent;
          border-left: 8px solid white;
          margin-left: 2px;
        }

        :global(.mm-children-container) { display: flex; flex-direction: column; gap: 24px; position: relative; }

        /* Glowing Blue Elbow Connectors (90-degree) */
        :global(.mm-child-branch) { display: flex; align-items: center; position: relative; }

        /* Vertical Connector */
        :global(.mm-child-branch::before) {
           content: "";
           position: absolute;
           left: -60px;
           top: 0;
           width: 2px;
           height: 100%;
           background: #58a6ff;
           box-shadow: 0 0 8px rgba(88, 166, 255, 0.5);
           z-index: 1;
        }
        :global(.mm-child-branch:first-child::before) { height: 50%; top: 50%; }
        :global(.mm-child-branch:last-child::before) { height: 50%; top: 0; }
        
        /* Delete vertical line if only one child */
        :global(.mm-child-branch:only-child::before) { display: none; }

        /* Horizontal Connector */
        :global(.mm-child-branch::after) {
          content: "";
          position: absolute;
          left: -60px;
          top: 50%;
          width: 60px;
          height: 2px;
          background: #58a6ff;
          box-shadow: 0 0 8px rgba(88, 166, 255, 0.5);
          z-index: 1;
        }

        /* Hub line out of parent node */
        :global(.mm-node::after) {
          content: "";
          position: absolute;
          right: -60px;
          top: 50%;
          width: 60px;
          height: 2px;
          background: #58a6ff;
          display: block;
          box-shadow: 0 0 8px rgba(88, 166, 255, 0.5);
          z-index: 1;
        }
        :global(.mm-node.is-leaf::after) { display: none; }

        /* Empty State */
        .mm-empty-state { height: 100%; display: flex; align-items: center; justify-content: center; opacity: 0.5; }
        .mm-empty-box { text-align: center; border: 2px dashed #30363d; padding: 40px; border-radius: 20px; }

        .mm-toast-error { position: fixed; bottom: 32px; left: 50%; transform: translateX(-50%); background: #f85149; color: white; padding: 12px 24px; border-radius: 8px; font-weight: 600; z-index: 1000; }
      `}</style>
    </div>
  );
}
