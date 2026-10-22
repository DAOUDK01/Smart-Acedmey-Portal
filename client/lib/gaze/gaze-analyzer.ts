export type GazeState = "FOCUSED" | "LOOKING_AWAY" | "NO_FACE";

/** Why the latest frame did not count as watching. */
export type AwayReason = "no-face" | "eyes-closed" | "looking-away";

export interface GazeSample {
  horizontal: number;
  vertical: number;
  headYaw: number;
  headPitch: number;
  /** 0 (eyes open) to 1 (eyes shut), averaged over both eyes. Optional for older callers. */
  eyeClosure?: number;
}

export interface GazeAnalyzerConfig {
  gazeHorizontalThreshold: number;
  gazeVerticalThreshold: number;
  headYawThreshold: number;
  headPitchThreshold: number;
  eyeClosedThreshold: number;
  /** Eye closure above this marks a blink in progress (eyes partly or fully shut). */
  blinkThreshold: number;
  /** How long the eyes can stay shut and still count as a blink rather than eyes closed. */
  blinkGraceMs: number;
  /** Frames are ignored for this long after a blink while the eyes settle back on the screen. */
  blinkSettleMs: number;
  awaySustainMs: number;
  /** How long the face (or open eyes) can go undetected before playback pauses. */
  notDetectedSustainMs: number;
  recoverSustainMs: number;
}

const DEFAULT_CONFIG: GazeAnalyzerConfig = {
  gazeHorizontalThreshold: 0.35,
  gazeVerticalThreshold: 0.35,
  headYawThreshold: 0.44,
  headPitchThreshold: 0.35,
  // Blinks are far shorter than the away window, so only eyes kept shut count as not watching.
  eyeClosedThreshold: 0.55,
  // A half-closed eye during a blink also skews the gaze scores downwards, so ignore those frames too.
  blinkThreshold: 0.35,
  // Normal blinks last 100-400ms; anything past this is the eyes being kept shut.
  blinkGraceMs: 700,
  // Reopening eyes still read as looking down for a frame or two.
  blinkSettleMs: 300,
  // Looking away with the face still on camera gets a 6 second grace period before pausing.
  awaySustainMs: 6000,
  // The face or open eyes going undetected gets the same 6 second grace period.
  notDetectedSustainMs: 6000,
  // Short enough that a face is confirmed almost immediately, long enough to ignore a stray frame.
  recoverSustainMs: 350,
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function safeScore(blendshapes: { categoryName: string; score: number }[], name: string): number {
  const found = blendshapes.find((b) => b.categoryName === name);
  return typeof found?.score === "number" ? clamp(found.score, 0, 1) : 0;
}

import { FaceBlendshapes } from "./face-landmarker-loader";

export function extractGazeSample(
  blendshapes: FaceBlendshapes[] | undefined,
  matrix: { data: number[] | Float32Array } | undefined
): GazeSample | null {
  if (!blendshapes || blendshapes.length === 0) return null;

  const b = blendshapes[0]?.categories;
  if (!b || b.length === 0) return null;

  const eyeLookOutRight = safeScore(b, "eyeLookOutRight");
  const eyeLookInLeft = safeScore(b, "eyeLookInLeft");
  const eyeLookOutLeft = safeScore(b, "eyeLookOutLeft");
  const eyeLookInRight = safeScore(b, "eyeLookInRight");
  const eyeLookUpLeft = safeScore(b, "eyeLookUpLeft");
  const eyeLookUpRight = safeScore(b, "eyeLookUpRight");
  const eyeLookDownLeft = safeScore(b, "eyeLookDownLeft");
  const eyeLookDownRight = safeScore(b, "eyeLookDownRight");

  const eyeClosure = (safeScore(b, "eyeBlinkLeft") + safeScore(b, "eyeBlinkRight")) / 2;

  const gazeRight = (eyeLookOutRight + eyeLookInLeft) / 2;
  const gazeLeft = (eyeLookOutLeft + eyeLookInRight) / 2;
  const gazeUp = (eyeLookUpLeft + eyeLookUpRight) / 2;
  const gazeDown = (eyeLookDownLeft + eyeLookDownRight) / 2;

  const horizontal = gazeRight - gazeLeft;
  const vertical = gazeUp - gazeDown;

  let headYaw = 0;
  let headPitch = 0;
  if (matrix?.data) {
    const m = matrix.data;
    const fx = m[8];
    const fy = m[9];
    const fz = m[10];
    const horizLen = Math.hypot(fx, fz) || 1;
    headYaw = Math.atan2(fx, fz);
    headPitch = Math.asin(clamp(-fy / horizLen, -1, 1));
  }

  return { horizontal, vertical, headYaw, headPitch, eyeClosure };
}

export class GazeAnalyzer {
  private config: GazeAnalyzerConfig;
  private state: GazeState = "FOCUSED";
  private candidateState: GazeState | null = null;
  private candidateSince = 0;
  private notDetectedSince: number | null = null;
  private eyesClosedSince: number | null = null;
  private blinkEndedAt: number | null = null;
  private lastReason: AwayReason | null = null;
  private lastUpdateMs = 0;
  private focusedMs = 0;
  private observedMs = 0;

  constructor(config: Partial<GazeAnalyzerConfig> = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      // Never wait longer for a missing face than for a glance away.
      notDetectedSustainMs: Math.min(
        DEFAULT_CONFIG.notDetectedSustainMs,
        config.awaySustainMs ?? DEFAULT_CONFIG.awaySustainMs,
      ),
      ...config,
    };
  }

  /** `initialState` lets a fresh camera session start from "no face" until a face is actually seen. */
  reset(initialState: GazeState = "FOCUSED"): void {
    this.state = initialState;
    this.candidateState = null;
    this.candidateSince = 0;
    this.notDetectedSince = null;
    this.eyesClosedSince = null;
    this.blinkEndedAt = null;
    this.lastReason = null;
    this.lastUpdateMs = 0;
    this.focusedMs = 0;
    this.observedMs = 0;
  }

  update(sample: GazeSample | null, nowMs: number): GazeState {
    if (this.lastUpdateMs > 0) {
      const dt = nowMs - this.lastUpdateMs;
      this.observedMs += dt;
      if (this.state === "FOCUSED") this.focusedMs += dt;
    }
    this.lastUpdateMs = nowMs;

    let immediate: GazeState;
    let reason: AwayReason | null = null;
    const closure =
      sample && typeof sample.eyeClosure === "number" && Number.isFinite(sample.eyeClosure)
        ? sample.eyeClosure
        : 0;
    const blinking = sample !== null && closure > this.config.blinkThreshold;
    if (blinking) {
      if (this.eyesClosedSince === null) this.eyesClosedSince = nowMs;
      this.blinkEndedAt = null;
    } else if (this.eyesClosedSince !== null) {
      // Only a real blink gets the settle period; eyes kept shut past the grace period do not.
      if (nowMs - this.eyesClosedSince < this.config.blinkGraceMs) this.blinkEndedAt = nowMs;
      this.eyesClosedSince = null;
    }
    const withinBlink =
      (this.eyesClosedSince !== null && nowMs - this.eyesClosedSince < this.config.blinkGraceMs) ||
      (sample !== null &&
        this.blinkEndedAt !== null &&
        nowMs - this.blinkEndedAt < this.config.blinkSettleMs);

    // A blink says nothing about where the student is looking: leave the state, any running
    // countdown and the reported reason exactly as they were.
    if (withinBlink) return this.state;

    if (!sample) {
      immediate = "NO_FACE";
      reason = "no-face";
    } else {
      const h = Math.abs(sample.horizontal);
      const v = Math.abs(sample.vertical);
      const yaw = Math.abs(sample.headYaw);
      const pitch = Math.abs(sample.headPitch);
      const eyesClosed = closure > this.config.eyeClosedThreshold;

      const lookingAway =
        h > this.config.gazeHorizontalThreshold ||
        v > this.config.gazeVerticalThreshold ||
        yaw > this.config.headYawThreshold ||
        pitch > this.config.headPitchThreshold;

      immediate = eyesClosed || lookingAway ? "LOOKING_AWAY" : "FOCUSED";
      reason = eyesClosed ? "eyes-closed" : lookingAway ? "looking-away" : null;
    }
    this.lastReason = reason;

    // The short "not detected" timer runs only while the face or open eyes are actually missing, so a
    // single dropped frame during a glance away does not cut the glance's grace period short.
    const notDetected = reason === "no-face" || reason === "eyes-closed";
    if (!notDetected) this.notDetectedSince = null;
    else if (this.notDetectedSince === null) {
      // Eyes kept shut count from the moment they closed, not from the end of the blink grace period.
      this.notDetectedSince =
        reason === "eyes-closed" && this.eyesClosedSince !== null ? this.eyesClosedSince : nowMs;
    }

    // Flickering between "looking away" and "no face" is one continuous away period, so it must not
    // restart the away timer.
    const continuesCandidate =
      this.candidateState !== null &&
      (immediate === this.candidateState ||
        (immediate !== "FOCUSED" && this.candidateState !== "FOCUSED"));

    if (immediate === this.state) {
      this.candidateState = null;
      this.candidateSince = 0;
    } else if (continuesCandidate) {
      this.candidateState = immediate;
      const confirmed =
        immediate === "FOCUSED"
          ? nowMs - this.candidateSince >= this.config.recoverSustainMs
          : nowMs - this.candidateSince >= this.config.awaySustainMs ||
            (this.notDetectedSince !== null &&
              nowMs - this.notDetectedSince >= this.config.notDetectedSustainMs);
      if (confirmed) {
        this.state = immediate;
        this.candidateState = null;
        this.candidateSince = 0;
      }
    } else {
      this.candidateState = immediate;
      this.candidateSince = nowMs;
    }

    return this.state;
  }

  getState(): GazeState {
    return this.state;
  }

  /**
   * While focused but currently looking away (or off camera), the milliseconds left before that is
   * confirmed and playback pauses; null when no away period is building up.
   */
  getAwayCountdownMs(nowMs: number): number | null {
    if (this.state !== "FOCUSED" || this.candidateState === null || this.candidateState === "FOCUSED") {
      return null;
    }
    const awayRemaining = this.config.awaySustainMs - (nowMs - this.candidateSince);
    const notDetectedRemaining =
      this.notDetectedSince === null
        ? Infinity
        : this.config.notDetectedSustainMs - (nowMs - this.notDetectedSince);
    return Math.max(0, Math.min(awayRemaining, notDetectedRemaining));
  }

  /** Why the latest frame did not count as watching, or null when the student was watching. */
  getAwayReason(): AwayReason | null {
    return this.lastReason;
  }

  getAttentionRatio(): number {
    if (this.observedMs === 0) return 1;
    return clamp(this.focusedMs / this.observedMs, 0, 1);
  }

  getConfig(): GazeAnalyzerConfig {
    return { ...this.config };
  }
}