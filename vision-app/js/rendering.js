/* ═══════════════════════════════════════════════════════
   rendering.js – Canvas Rendering, Neon Glow, Particles
   ═══════════════════════════════════════════════════════ */

export class RenderEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this._time = 0;
  }

  /* ─── Resize to match video ─── */
  resize(w, h) {
    this.canvas.width = w;
    this.canvas.height = h;
  }

  /* ─── Clear Frame ─── */
  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this._time = performance.now() * 0.001;
  }

  /* ═══ HAND LANDMARKS ═══ */
  drawHandLandmarks(hand, color = '#00f0ff') {
    if (!hand) return;
    const ctx = this.ctx;

    // Draw connections
    const connections = [
      [0, 1], [1, 2], [2, 3], [3, 4],       // Thumb
      [0, 5], [5, 6], [6, 7], [7, 8],       // Index
      [0, 9], [9, 10], [10, 11], [11, 12],  // Middle
      [0, 13], [13, 14], [14, 15], [15, 16],// Ring
      [0, 17], [17, 18], [18, 19], [19, 20],// Pinky
      [5, 9], [9, 13], [13, 17],             // Palm
    ];

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.5;

    connections.forEach(([a, b]) => {
      ctx.beginPath();
      ctx.moveTo(hand[a].x, hand[a].y);
      ctx.lineTo(hand[b].x, hand[b].y);
      ctx.stroke();
    });

    // Draw landmark dots
    ctx.globalAlpha = 0.8;
    hand.forEach((lm, i) => {
      const isTip = [4, 8, 12, 16, 20].includes(i);
      const r = isTip ? 5 : 2.5;

      ctx.beginPath();
      ctx.arc(lm.x, lm.y, r, 0, Math.PI * 2);

      if (isTip) {
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 12;
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.shadowBlur = 0;
      }
      ctx.fill();
    });

    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  /* ═══ FACE MESH ═══ */
  drawFaceMesh(landmarks) {
    if (!landmarks) return;
    const ctx = this.ctx;

    // Draw a subtle face outline using key contour points
    const faceContour = [
      10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
      397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
      172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109, 10,
    ];

    ctx.beginPath();
    ctx.strokeStyle = 'rgba(139, 92, 246, 0.3)';
    ctx.lineWidth = 1;

    faceContour.forEach((idx, i) => {
      if (idx >= landmarks.length) return;
      const p = landmarks[idx];
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();

    // Eyes glow
    this._drawEyeGlow(landmarks, [362, 385, 387, 263, 373, 380], '#8b5cf6');
    this._drawEyeGlow(landmarks, [33, 160, 158, 133, 153, 144], '#8b5cf6');
  }

  _drawEyeGlow(landmarks, indices, color) {
    const ctx = this.ctx;
    let cx = 0, cy = 0;
    indices.forEach((i) => {
      if (i < landmarks.length) {
        cx += landmarks[i].x;
        cy += landmarks[i].y;
      }
    });
    cx /= indices.length;
    cy /= indices.length;

    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 18);
    grad.addColorStop(0, color + '30');
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, 18, 0, Math.PI * 2);
    ctx.fill();
  }

  /* ═══ ELASTIC BAND ═══ */
  drawElasticBand(leftPalm, rightPalm, bandPoints, tension) {
    if (!leftPalm || !rightPalm || !bandPoints.length) return;
    const ctx = this.ctx;

    // Build full path: leftPalm -> bandPoints -> rightPalm
    const allPoints = [leftPalm, ...bandPoints, rightPalm];

    // Outer glow layer
    this._drawBandStroke(allPoints, tension, 12, 0.15);
    // Mid glow
    this._drawBandStroke(allPoints, tension, 6, 0.35);
    // Core line
    this._drawBandStroke(allPoints, tension, 2.5, 0.9);
    // Bright center
    this._drawBandStroke(allPoints, tension, 1, 1.0, true);
  }

  _drawBandStroke(points, tension, lineWidth, alpha, isCore = false) {
    const ctx = this.ctx;

    // Color shifts from cyan (relaxed) to magenta (high tension)
    const hue = 185 + tension * 115; // 185=cyan → 300=magenta
    const color = `hsla(${hue}, 100%, ${isCore ? '85' : '60'}%, ${alpha})`;

    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (!isCore) {
      ctx.shadowColor = `hsla(${hue}, 100%, 60%, 0.6)`;
      ctx.shadowBlur = lineWidth * 3;
    }

    // Smooth catmull-rom spline through points
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length - 1; i++) {
      const xc = (points[i].x + points[i + 1].x) / 2;
      const yc = (points[i].y + points[i + 1].y) / 2;
      ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
    }
    const last = points[points.length - 1];
    ctx.lineTo(last.x, last.y);
    ctx.stroke();

    ctx.shadowBlur = 0;
  }

  /* ═══ PARTICLES ═══ */
  drawParticles(particles) {
    const ctx = this.ctx;

    particles.forEach((p) => {
      const lifeRatio = p.life / p.maxLife;
      const alpha = lifeRatio * 0.8;
      const size = p.size * lifeRatio;

      const color = `hsla(${p.hue}, 100%, 70%, ${alpha})`;

      // Glow
      ctx.shadowColor = `hsla(${p.hue}, 100%, 60%, ${alpha * 0.5})`;
      ctx.shadowBlur = size * 3;

      ctx.beginPath();
      ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    });

    ctx.shadowBlur = 0;
  }

  /* ═══ ENERGY SPHERE ═══ */
  drawEnergySphere(sphere) {
    if (!sphere.active) return;
    const ctx = this.ctx;
    const { x, y } = sphere.position;
    const r = sphere.radius;
    const glow = sphere.glow;
    const breaking = sphere.breaking;
    const breakProgress = sphere.breakProgress;

    if (breaking) {
      // Breaking effect: expanding ring fragments
      const numFrags = 12;
      for (let i = 0; i < numFrags; i++) {
        const angle = (Math.PI * 2 * i) / numFrags + this._time * 2;
        const dist = r * (1 + breakProgress * 2);
        const fx = x + Math.cos(angle) * dist;
        const fy = y + Math.sin(angle) * dist;
        const fragAlpha = (1 - breakProgress) * glow;

        const grad = ctx.createRadialGradient(fx, fy, 0, fx, fy, 8);
        grad.addColorStop(0, `rgba(255, 200, 50, ${fragAlpha})`);
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(fx, fy, 8, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }

    // Outer aura
    const auraGrad = ctx.createRadialGradient(x, y, r * 0.3, x, y, r * 2.5);
    auraGrad.addColorStop(0, `rgba(139, 92, 246, ${glow * 0.2})`);
    auraGrad.addColorStop(0.4, `rgba(0, 240, 255, ${glow * 0.1})`);
    auraGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = auraGrad;
    ctx.beginPath();
    ctx.arc(x, y, r * 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Core sphere gradient
    const coreGrad = ctx.createRadialGradient(x, y, 0, x, y, r);
    coreGrad.addColorStop(0, `rgba(255, 255, 255, ${glow * 0.9})`);
    coreGrad.addColorStop(0.3, `rgba(0, 240, 255, ${glow * 0.7})`);
    coreGrad.addColorStop(0.6, `rgba(139, 92, 246, ${glow * 0.5})`);
    coreGrad.addColorStop(1, `rgba(139, 92, 246, 0)`);

    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = coreGrad;
    ctx.fill();

    // Rotating ring
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(this._time * 1.5);
    ctx.strokeStyle = `rgba(0, 240, 255, ${glow * 0.5})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.2, r * 0.5, 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.rotate(Math.PI / 3);
    ctx.strokeStyle = `rgba(255, 0, 230, ${glow * 0.3})`;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.1, r * 0.4, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Inner flicker sparkles
    const sparkCount = 6;
    for (let i = 0; i < sparkCount; i++) {
      const angle = (Math.PI * 2 * i) / sparkCount + this._time * 3;
      const dist = r * 0.5 * (0.5 + 0.5 * Math.sin(this._time * 5 + i));
      const sx = x + Math.cos(angle) * dist;
      const sy = y + Math.sin(angle) * dist;

      ctx.beginPath();
      ctx.arc(sx, sy, 2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${glow * 0.8})`;
      ctx.shadowColor = '#fff';
      ctx.shadowBlur = 6;
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  }

  /* ═══ PALM ANCHOR GLOW ═══ */
  drawPalmGlow(palm, tension) {
    if (!palm) return;
    const ctx = this.ctx;

    const hue = 185 + tension * 115;
    const r = 18 + tension * 12;

    const grad = ctx.createRadialGradient(palm.x, palm.y, 0, palm.x, palm.y, r);
    grad.addColorStop(0, `hsla(${hue}, 100%, 70%, 0.5)`);
    grad.addColorStop(0.5, `hsla(${hue}, 100%, 60%, 0.15)`);
    grad.addColorStop(1, 'transparent');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(palm.x, palm.y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  /* ═══ SCAN LINES OVERLAY (subtle CRT effect) ═══ */
  drawScanLines() {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.03)';
    for (let y = 0; y < this.canvas.height; y += 3) {
      ctx.fillRect(0, y, this.canvas.width, 1);
    }
  }

  /* ═══ VIGNETTE ═══ */
  drawVignette() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const grad = ctx.createRadialGradient(w / 2, h / 2, w * 0.3, w / 2, h / 2, w * 0.75);
    grad.addColorStop(0, 'transparent');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0.4)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }
}
