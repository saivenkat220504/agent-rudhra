# 🔮 Vision App – Real-Time Hand & Face Tracking

A real-time computer vision web application featuring hand tracking, face detection, elastic band physics, energy sphere interactions, and neon visual effects — all powered by MediaPipe and running entirely in the browser.

## Quick Start

```bash
# From the Rudhra project root, activate venv
.\myenv\Scripts\activate

# Start the server
cd vision-app
python server.py
```

Then open **http://localhost:8080** in Chrome/Edge and allow camera access.

## Features

| Feature | Description |
|---------|-------------|
| ✋ Hand Tracking | Real-time detection & tracking of both hands with smooth interpolation |
| 👤 Face Detection | Face mesh with subtle contour + glowing eye highlights |
| 🔗 Elastic Band | Physics-based spring simulation between hands with catenary sag |
| ✨ Neon Glow | Multi-layer neon rendering that shifts from cyan (relaxed) to magenta (tense) |
| 🎆 Particles | Dynamic particle system that intensifies with tension |
| ⚡ Energy Sphere | Glowing sphere forms when hands are close; expands and shatters when pulled apart |
| 📊 HUD | Real-time FPS, hand count, face status, and tension readout |

## Architecture

```
vision-app/
├── index.html          # Entry point + MediaPipe CDN imports
├── server.py           # Simple Python HTTP server
├── css/
│   └── style.css       # Cyberpunk design system
└── js/
    ├── main.js         # App orchestrator & render loop
    ├── tracking.js     # MediaPipe hand + face tracking + smoothing
    ├── interaction.js  # Physics engine (elastic band, sphere, particles)
    └── rendering.js    # Canvas rendering (glow, particles, effects)
```

## How It Works

1. **Camera Feed** → MediaPipe processes each frame for hands & face
2. **Tracking Engine** → Smooths landmarks using weighted moving average (5-frame buffer)
3. **Interaction Engine** → Runs spring physics simulation on the elastic band, manages energy sphere state, spawns particles
4. **Render Engine** → Draws everything with multi-layer neon glow, spline curves, gradient spheres, and CRT scan lines

## Interaction Guide

- **Show both hands** → An elastic band appears between your palms
- **Pull hands apart** → Band stretches, color shifts cyan → magenta, particles intensify
- **Bring hands together** → An energy sphere forms at the center
- **Pull apart while sphere is active** → Sphere expands and eventually shatters with an explosion of particles

## Requirements

- Modern browser with WebGL/Camera support (Chrome, Edge, Firefox)
- Python 3.x (for the dev server)
- Webcam

## Tech Stack

- **MediaPipe Hands** – Hand landmark detection
- **MediaPipe Face Mesh** – Face landmark detection
- **HTML5 Canvas** – Real-time rendering
- **Vanilla JavaScript (ES Modules)** – Zero framework dependencies
- **Python SimpleHTTPServer** – Minimal dev server
