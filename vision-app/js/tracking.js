/* ═══════════════════════════════════════════════════════
   tracking.js – MediaPipe Hand & Face Tracking
   Handles initialization, smoothing, and landmark export
   ═══════════════════════════════════════════════════════ */

export class TrackingEngine {
  constructor() {
    // Tracking state
    this.leftHand = null;
    this.rightHand = null;
    this.faceLandmarks = null;
    this.handsDetected = 0;
    this.faceDetected = false;

    // Smoothing buffers (rolling average)
    this._leftBuffer = [];
    this._rightBuffer = [];
    this._bufferSize = 5;

    // Status callback
    this.onStatusChange = null;

    // MediaPipe instances
    this._hands = null;
    this._faceMesh = null;
    this._camera = null;

    // Video element ref
    this._videoEl = null;
    this._canvasWidth = 1280;
    this._canvasHeight = 720;
  }

  /* ─── Initialize MediaPipe + Camera ─── */
  async init(videoElement, canvasWidth, canvasHeight) {
    this._videoEl = videoElement;
    this._canvasWidth = canvasWidth;
    this._canvasHeight = canvasHeight;

    this._frameCount = 0;
    this._faceSkipFrames = 3; // Process face every Nth frame

    // Initialize Hands
    this._hands = new Hands({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });

    this._hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.65,
      minTrackingConfidence: 0.55,
    });

    this._hands.onResults((results) => this._onHandResults(results));

    // Initialize Face Mesh
    this._faceMesh = new FaceMesh({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
    });

    this._faceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: false,  // Faster without iris refinement
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    this._faceMesh.onResults((results) => this._onFaceResults(results));

    // Start camera
    this._camera = new Camera(videoElement, {
      onFrame: async () => {
        this._frameCount++;
        const img = { image: videoElement };

        // Always process hands first (priority)
        await this._hands.send(img);

        // Process face every Nth frame (sequential to avoid WebGL conflicts)
        if (this._frameCount % this._faceSkipFrames === 0) {
          await this._faceMesh.send(img);
        }
      },
      width: canvasWidth,
      height: canvasHeight,
    });

    await this._camera.start();
  }

  /* ─── Hand Results Callback ─── */
  _onHandResults(results) {
    this.handsDetected = results.multiHandLandmarks
      ? results.multiHandLandmarks.length
      : 0;

    if (this.handsDetected >= 2) {
      const hand0 = results.multiHandLandmarks[0];
      const hand1 = results.multiHandLandmarks[1];

      // Determine which is left vs right using handedness
      const label0 = results.multiHandedness[0]?.label || 'Left';
      const label1 = results.multiHandedness[1]?.label || 'Right';

      // MediaPipe mirrors: "Left" in results = user's right hand on screen
      if (label0 === 'Left') {
        this.rightHand = this._smoothHand(this._toPixel(hand0), this._rightBuffer);
        this.leftHand = this._smoothHand(this._toPixel(hand1), this._leftBuffer);
      } else {
        this.leftHand = this._smoothHand(this._toPixel(hand0), this._leftBuffer);
        this.rightHand = this._smoothHand(this._toPixel(hand1), this._rightBuffer);
      }
    } else if (this.handsDetected === 1) {
      const hand0 = results.multiHandLandmarks[0];
      const label0 = results.multiHandedness[0]?.label || 'Left';

      if (label0 === 'Left') {
        this.rightHand = this._smoothHand(this._toPixel(hand0), this._rightBuffer);
        this.leftHand = null;
        this._leftBuffer = [];
      } else {
        this.leftHand = this._smoothHand(this._toPixel(hand0), this._leftBuffer);
        this.rightHand = null;
        this._rightBuffer = [];
      }
    } else {
      this.leftHand = null;
      this.rightHand = null;
      this._leftBuffer = [];
      this._rightBuffer = [];
    }
  }

  /* ─── Face Results Callback ─── */
  _onFaceResults(results) {
    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
      this.faceDetected = true;
      // Convert face landmarks to pixel coords
      this.faceLandmarks = results.multiFaceLandmarks[0].map((lm) => ({
        x: lm.x * this._canvasWidth,
        y: lm.y * this._canvasHeight,
        z: lm.z,
      }));
    } else {
      this.faceDetected = false;
      this.faceLandmarks = null;
    }
  }

  /* ─── Convert normalized → pixel landmarks ─── */
  _toPixel(landmarks) {
    return landmarks.map((lm) => ({
      x: lm.x * this._canvasWidth,
      y: lm.y * this._canvasHeight,
      z: lm.z,
    }));
  }

  /* ─── Exponential Moving Average Smoothing ─── */
  _smoothHand(rawLandmarks, buffer) {
    buffer.push(rawLandmarks);
    if (buffer.length > this._bufferSize) buffer.shift();

    // Weighted average – recent frames weigh more
    const totalWeight = buffer.reduce((s, _, i) => s + (i + 1), 0);
    const smoothed = rawLandmarks.map((_, li) => {
      let sx = 0, sy = 0, sz = 0;
      buffer.forEach((frame, fi) => {
        const w = (fi + 1) / totalWeight;
        sx += frame[li].x * w;
        sy += frame[li].y * w;
        sz += frame[li].z * w;
      });
      return { x: sx, y: sy, z: sz };
    });

    return smoothed;
  }

  /* ─── Utility: Get palm center (average of key landmarks) ─── */
  getPalmCenter(hand) {
    if (!hand) return null;
    // Use wrist (0), index_mcp (5), pinky_mcp (17), middle_mcp (9)
    const indices = [0, 5, 9, 13, 17];
    let cx = 0, cy = 0;
    indices.forEach((i) => {
      cx += hand[i].x;
      cy += hand[i].y;
    });
    return { x: cx / indices.length, y: cy / indices.length };
  }

  /* ─── Utility: Get fingertip positions ─── */
  getFingerTips(hand) {
    if (!hand) return null;
    return {
      thumb: hand[4],
      index: hand[8],
      middle: hand[12],
      ring: hand[16],
      pinky: hand[20],
    };
  }

  /* ─── Utility: Get wrist position ─── */
  getWrist(hand) {
    return hand ? hand[0] : null;
  }

  /* ─── Cleanup ─── */
  destroy() {
    if (this._camera) this._camera.stop();
  }
}
