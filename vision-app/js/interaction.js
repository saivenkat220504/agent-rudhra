/* ═══════════════════════════════════════════════════════
   interaction.js – Physics, Elastic Band & Energy Sphere
   ═══════════════════════════════════════════════════════ */

export class InteractionEngine {
  constructor() {
    // Elastic band state
    this.tension = 0;           // 0..1 normalized tension
    this.bandPoints = [];       // Control points along the elastic band
    this.bandVelocities = [];   // Velocity for each control point (spring sim)

    // Energy sphere state
    this.sphereActive = false;
    this.sphereRadius = 0;
    this.sphereTargetRadius = 0;
    this.spherePosition = { x: 0, y: 0 };
    this.sphereBreaking = false;
    this.sphereBreakProgress = 0;
    this.sphereGlow = 0;

    // Particles
    this.particles = [];

    // Config
    this.config = {
      bandSegments: 24,
      springStiffness: 0.12,
      damping: 0.82,
      maxTension: 400,           // Distance at max tension
      minTension: 60,            // Distance for sphere activation
      sphereBreakDistance: 320,   // Distance where sphere shatters
      particleSpawnRate: 3,
      particleLifespan: 60,
      maxParticles: 200,
    };

    this._prevDistance = 0;
    this._initBandPoints();
  }

  /* ─── Initialize band segment positions ─── */
  _initBandPoints() {
    const n = this.config.bandSegments;
    this.bandPoints = Array.from({ length: n }, () => ({ x: 0, y: 0 }));
    this.bandVelocities = Array.from({ length: n }, () => ({ x: 0, y: 0 }));
  }

  /* ─── Main Update ─── */
  update(leftPalm, rightPalm, deltaTime) {
    if (!leftPalm || !rightPalm) {
      this.tension = 0;
      this.sphereActive = false;
      this.sphereBreaking = false;
      this._fadeParticles();
      return;
    }

    const dx = rightPalm.x - leftPalm.x;
    const dy = rightPalm.y - leftPalm.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Calculate tension (0..1)
    const rawTension = Math.max(0, Math.min(1,
      (distance - this.config.minTension) /
      (this.config.maxTension - this.config.minTension)
    ));
    this.tension += (rawTension - this.tension) * 0.15;  // smooth

    // Update elastic band physics
    this._updateBand(leftPalm, rightPalm, distance);

    // Energy sphere logic
    this._updateSphere(leftPalm, rightPalm, distance);

    // Spawn particles based on tension
    this._spawnParticles(leftPalm, rightPalm, distance);

    // Update existing particles
    this._updateParticles();

    this._prevDistance = distance;
  }

  /* ─── Elastic Band Spring Simulation ─── */
  _updateBand(left, right, distance) {
    const n = this.config.bandSegments;
    const { springStiffness, damping } = this.config;

    for (let i = 0; i < n; i++) {
      const t = (i + 1) / (n + 1);

      // Linear interpolation target (straight line between palms)
      const targetX = left.x + (right.x - left.x) * t;
      const targetY = left.y + (right.y - left.y) * t;

      // Add sag (catenary-like droop based on tension)
      const sagAmount = (1 - this.tension) * 40 * Math.sin(Math.PI * t);

      // Perpendicular direction for oscillation
      const dx = right.x - left.x;
      const dy = right.y - left.y;
      const len = Math.max(1, Math.sqrt(dx * dx + dy * dy));
      const perpX = -dy / len;
      const perpY = dx / len;

      // Slight wave motion
      const time = performance.now() * 0.003;
      const wave = Math.sin(t * Math.PI * 4 + time) * this.tension * 6;

      const goalX = targetX + perpX * sagAmount + perpX * wave;
      const goalY = targetY + sagAmount + perpY * wave;

      // Spring force
      const fx = (goalX - this.bandPoints[i].x) * springStiffness;
      const fy = (goalY - this.bandPoints[i].y) * springStiffness;

      this.bandVelocities[i].x = (this.bandVelocities[i].x + fx) * damping;
      this.bandVelocities[i].y = (this.bandVelocities[i].y + fy) * damping;

      this.bandPoints[i].x += this.bandVelocities[i].x;
      this.bandPoints[i].y += this.bandVelocities[i].y;
    }
  }

  /* ─── Energy Sphere Logic ─── */
  _updateSphere(left, right, distance) {
    const midX = (left.x + right.x) / 2;
    const midY = (left.y + right.y) / 2;
    this.spherePosition = { x: midX, y: midY };

    if (distance < this.config.minTension) {
      // Hands are very close → activate sphere
      this.sphereActive = true;
      this.sphereBreaking = false;
      this.sphereBreakProgress = 0;

      const closeness = 1 - (distance / this.config.minTension);
      this.sphereTargetRadius = 20 + closeness * 45;
      this.sphereGlow = 0.5 + closeness * 0.5;

    } else if (this.sphereActive && distance < this.config.sphereBreakDistance) {
      // Sphere is being stretched
      const stretchRatio = (distance - this.config.minTension) /
        (this.config.sphereBreakDistance - this.config.minTension);
      this.sphereTargetRadius = 65 + stretchRatio * 50;
      this.sphereGlow = Math.max(0.2, 1 - stretchRatio * 0.6);

    } else if (this.sphereActive) {
      // Sphere breaks!
      this.sphereBreaking = true;
      this.sphereBreakProgress += 0.04;
      this.sphereGlow *= 0.95;

      if (this.sphereBreakProgress >= 1) {
        this.sphereActive = false;
        this.sphereBreaking = false;
        this.sphereBreakProgress = 0;
        this._spawnBreakParticles(midX, midY);
      }
    }

    // Smooth radius transition
    this.sphereRadius += (this.sphereTargetRadius - this.sphereRadius) * 0.12;
  }

  /* ─── Particle Spawning ─── */
  _spawnParticles(left, right, distance) {
    if (this.particles.length >= this.config.maxParticles) return;

    // Spawn rate scales with tension
    const rate = Math.floor(this.tension * this.config.particleSpawnRate) + 1;

    for (let i = 0; i < rate; i++) {
      const t = Math.random();
      const bandX = left.x + (right.x - left.x) * t;
      const bandY = left.y + (right.y - left.y) * t;

      this.particles.push({
        x: bandX + (Math.random() - 0.5) * 20,
        y: bandY + (Math.random() - 0.5) * 20,
        vx: (Math.random() - 0.5) * 2,
        vy: -Math.random() * 2 - 0.5,
        life: this.config.particleLifespan,
        maxLife: this.config.particleLifespan,
        size: 1.5 + Math.random() * 3,
        hue: Math.random() > 0.5 ? 185 : 300,  // cyan or magenta
      });
    }
  }

  /* ─── Break Explosion Particles ─── */
  _spawnBreakParticles(cx, cy) {
    const count = 60;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.3;
      const speed = 3 + Math.random() * 8;
      this.particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 40 + Math.random() * 30,
        maxLife: 70,
        size: 2 + Math.random() * 4,
        hue: 40 + Math.random() * 30, // orange-gold
      });
    }
  }

  /* ─── Update & Cull Particles ─── */
  _updateParticles() {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.03;  // gentle gravity
      p.vx *= 0.98;
      p.vy *= 0.98;
      p.life--;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  /* ─── Fade particles when hands disappear ─── */
  _fadeParticles() {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      this.particles[i].life -= 3;
      this.particles[i].x += this.particles[i].vx;
      this.particles[i].y += this.particles[i].vy;
      if (this.particles[i].life <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }
}
