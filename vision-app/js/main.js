/* ═══════════════════════════════════════════════════════
   main.js – Application Entry Point
   Ties together Tracking, Interaction, and Rendering
   ═══════════════════════════════════════════════════════ */

import { TrackingEngine } from './tracking.js';
import { InteractionEngine } from './interaction.js';
import { RenderEngine } from './rendering.js';

class VisionApp {
  constructor() {
    this.video = document.getElementById('camera-feed');
    this.canvas = document.getElementById('render-canvas');
    this.loadingOverlay = document.getElementById('loading-overlay');
    this.loadingText = document.getElementById('loading-text');

    // HUD elements
    this.fpsValue = document.getElementById('fps-value');
    this.handDot = document.getElementById('hand-dot');
    this.handStatus = document.getElementById('hand-status');
    this.faceDot = document.getElementById('face-dot');
    this.faceStatus = document.getElementById('face-status');
    this.tensionLabel = document.getElementById('tension-label');
    this.tensionBar = document.getElementById('tension-bar');

    // Engines
    this.tracker = new TrackingEngine();
    this.physics = new InteractionEngine();
    this.renderer = new RenderEngine(this.canvas);

    // FPS tracking
    this._frameCount = 0;
    this._lastFpsTime = performance.now();
    this._fps = 0;

    // Init
    this._init();
  }

  async _init() {
    this.loadingText.textContent = 'INITIALIZING CAMERA...';

    const W = 1280;
    const H = 720;

    this.renderer.resize(W, H);

    try {
      this.loadingText.textContent = 'LOADING MEDIAPIPE MODELS...';
      await this.tracker.init(this.video, W, H);
      this.loadingText.textContent = 'READY';

      // Hide loading overlay after brief pause
      setTimeout(() => {
        this.loadingOverlay.classList.add('hidden');
      }, 600);

      // Start render loop
      this._loop();
    } catch (err) {
      console.error('Initialization failed:', err);
      this.loadingText.textContent = 'CAMERA ACCESS DENIED';
    }
  }

  _loop() {
    // Update FPS
    this._frameCount++;
    const now = performance.now();
    if (now - this._lastFpsTime > 1000) {
      this._fps = this._frameCount;
      this._frameCount = 0;
      this._lastFpsTime = now;
    }

    // Get palm centers
    const leftPalm = this.tracker.getPalmCenter(this.tracker.leftHand);
    const rightPalm = this.tracker.getPalmCenter(this.tracker.rightHand);

    // Update physics
    this.physics.update(leftPalm, rightPalm, 16);

    // ─── Render Frame ───
    this.renderer.clear();

    // Vignette first (behind everything)
    this.renderer.drawVignette();

    // Face mesh
    if (this.tracker.faceDetected) {
      this.renderer.drawFaceMesh(this.tracker.faceLandmarks);
    }

    // Hand landmarks
    this.renderer.drawHandLandmarks(this.tracker.leftHand, '#00f0ff');
    this.renderer.drawHandLandmarks(this.tracker.rightHand, '#ff00e6');

    // Elastic band (only when both hands visible)
    if (leftPalm && rightPalm) {
      this.renderer.drawPalmGlow(leftPalm, this.physics.tension);
      this.renderer.drawPalmGlow(rightPalm, this.physics.tension);

      this.renderer.drawElasticBand(
        leftPalm, rightPalm,
        this.physics.bandPoints,
        this.physics.tension
      );
    }

    // Energy sphere
    this.renderer.drawEnergySphere({
      active: this.physics.sphereActive,
      position: this.physics.spherePosition,
      radius: this.physics.sphereRadius,
      glow: this.physics.sphereGlow,
      breaking: this.physics.sphereBreaking,
      breakProgress: this.physics.sphereBreakProgress,
    });

    // Particles
    this.renderer.drawParticles(this.physics.particles);

    // Subtle scan lines
    this.renderer.drawScanLines();

    // ─── Update HUD ───
    this._updateHUD(leftPalm, rightPalm);

    requestAnimationFrame(() => this._loop());
  }

  _updateHUD(leftPalm, rightPalm) {
    // FPS
    this.fpsValue.textContent = this._fps;

    // Hand status
    const handsCount = this.tracker.handsDetected;
    this.handDot.className = handsCount > 0 ? 'dot' : 'dot inactive';
    this.handStatus.textContent = `${handsCount}/2`;

    // Face status
    this.faceDot.className = this.tracker.faceDetected ? 'dot' : 'dot inactive';
    this.faceStatus.textContent = this.tracker.faceDetected ? 'ON' : 'OFF';

    // Tension
    const tensionPct = Math.round(this.physics.tension * 100);
    this.tensionLabel.textContent = this.physics.sphereActive
      ? `⚡ SPHERE ${this.physics.sphereBreaking ? 'BREAKING' : 'ACTIVE'}`
      : `TENSION ${tensionPct}%`;
    this.tensionBar.style.width = `${tensionPct}%`;
  }
}

// ─── Boot ───
window.addEventListener('DOMContentLoaded', () => {
  new VisionApp();
});
