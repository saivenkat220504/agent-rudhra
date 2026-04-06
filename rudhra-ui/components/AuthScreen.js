"use client";

import { useState, useEffect } from "react";
import { getAuthStatus, setupAuth, login } from "@/lib/api";

const ACTIVATION_STEPS = [
  "🔍 Analyzing Key...",
  "🧠 Matching Credentials...",
  "🛡️ Verifying...",
  "⚡ Initializing...",
];

export default function AuthScreen({ onAuthenticated }) {
  const [hasCredentials, setHasCredentials] = useState(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [phase, setPhase] = useState("login"); // login | activating | welcome
  const [activationStep, setActivationStep] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Add timeout — if backend is slow/down, default to showing login form
    const timeout = setTimeout(() => {
      if (hasCredentials === null) setHasCredentials(true);
    }, 3000);

    getAuthStatus()
      .then((data) => {
        clearTimeout(timeout);
        setHasCredentials(data.has_credentials);
      })
      .catch(() => {
        clearTimeout(timeout);
        setHasCredentials(true); // Show login form on error
      });

    return () => clearTimeout(timeout);
  }, []);

  // Cinematic sequential activation sequence
  useEffect(() => {
    if (phase !== "activating") return;

    if (activationStep < ACTIVATION_STEPS.length) {
      // 1. Fade in
      setVisible(true);
      
      // 2. Stay visible for 250ms (Lightning Fast)
      const stayTimer = setTimeout(() => {
        // 3. Fade out
        setVisible(false);
        
        // 4. Wait for fade out to complete (100ms) then move to next step
        const nextTimer = setTimeout(() => {
          setActivationStep((s) => s + 1);
        }, 100);
        
        return () => clearTimeout(nextTimer);
      }, 250);

      return () => clearTimeout(stayTimer);
    } else {
      // Final message: RUDHRA ACTIVATED
      setVisible(true);
      const finalTimer = setTimeout(() => {
        setPhase("welcome");
      }, 400);
      return () => clearTimeout(finalTimer);
    }
  }, [phase, activationStep]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!password.trim()) {
      setError("Please enter a password");
      return;
    }

    try {
      if (hasCredentials === false) {
        await setupAuth(password);
        setHasCredentials(true);
        setPassword("");
      } else {
        await login(password);
        // Play activation voice
        new Audio("/activated.mp3").play().catch(() => {});
        setPhase("activating");
      }
    } catch (err) {
      setError(err.message || "Authentication failed");
    }
  };

  // ── Activation overlay ──
  if (phase === "activating") {
    return (
      <div className="activation-overlay">
        <div 
          className={`activation-text ${visible ? "fade-in" : "fade-out"}`}
          key={activationStep}
        >
          {activationStep < ACTIVATION_STEPS.length ? (
            ACTIVATION_STEPS[activationStep]
          ) : (
            <span className="activation-final">🔥 RUDHRA ACTIVATED</span>
          )}
        </div>
      </div>
    );
  }

  // ── Welcome screen ──
  if (phase === "welcome") {
    return (
      <div className="auth-container">
        <div className="auth-card" style={{ textAlign: "center" }}>
          <div className="auth-logo">🧠</div>
          <h1
            style={{
              fontSize: "1.8rem",
              fontWeight: 800,
              background: "linear-gradient(135deg, #4a90e2, #00d4ff)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              marginBottom: "8px",
            }}
          >
            Welcome to Rudhra Labs
          </h1>
          <p className="auth-subtitle" style={{ marginBottom: "32px" }}>
            AI Research Assistant • Online
          </p>
          <button className="auth-btn" onClick={onAuthenticated}>
            🚀 Start Rudhra
          </button>
        </div>
      </div>
    );
  }

  // ── Loading ──
  if (hasCredentials === null) {
    return (
      <div className="auth-container">
        <div className="activation-text">Loading...</div>
      </div>
    );
  }

  // ── Login / Setup ──
  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-logo">🧠</div>
        <h2 className="auth-title">RUDHRA OS</h2>
        <p className="auth-subtitle">
          {hasCredentials ? "Enter access key to unlock" : "Set your admin password"}
        </p>

        <form onSubmit={handleSubmit}>
          <input
            className="auth-input"
            type="password"
            placeholder={hasCredentials ? "Access Key" : "Set Admin Password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
          <button className="auth-btn" type="submit">
            {hasCredentials ? "🔑 Unlock" : "💾 Save Credentials"}
          </button>
        </form>

        {error && <p className="auth-error">{error}</p>}
      </div>
    </div>
  );
}
