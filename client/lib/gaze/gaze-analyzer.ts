export type GazeState = "FOCUSED" | "LOOKING_AWAY" | "NO_FACE";

export interface GazeSample {
  horizontal: number;
  vertical: number;
  headYaw: number;
  headPitch: number;
}

export interface GazeAnalyzerConfig {
  gazeHorizontalThreshold: number;
  gazeVerticalThreshold: number;
  headYawThreshold: number;
  headPitchThreshold: number;
  awaySustainMs: number;
  recoverSustainMs: number;
}

const DEFAULT_CONFIG: GazeAnalyzerConfig = {
  gazeHorizontalThreshold: 0.35,
  gazeVerticalThreshold: 0.35,
  headYawThreshold: 0.44,
  headPitchThreshold: 0.35,
  awaySustainMs: 2000,
  recoverSustainMs: 700,
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

  return { horizontal, vertical, headYaw, headPitch };
}

export class GazeAnalyzer {
  private config: GazeAnalyzerConfig;
  private state: GazeState = "FOCUSED";
  private candidateState: GazeState | null = null;
  private candidateSince = 0;
  private lastUpdateMs = 0;
  private focusedMs = 0;
  private observedMs = 0;

  constructor(config: Partial<GazeAnalyzerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  reset(): void {
    this.state = "FOCUSED";
    this.candidateState = null;
    this.candidateSince = 0;
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
    if (!sample) {
      immediate = "NO_FACE";
    } else {
      const h = Math.abs(sample.horizontal);
      const v = Math.abs(sample.vertical);
      const yaw = Math.abs(sample.headYaw);
      const pitch = Math.abs(sample.headPitch);

      const isAway =
        h > this.config.gazeHorizontalThreshold ||
        v > this.config.gazeVerticalThreshold ||
        yaw > this.config.headYawThreshold ||
        pitch > this.config.headPitchThreshold;

      immediate = isAway ? "LOOKING_AWAY" : "FOCUSED";
    }

    const sustainMs = immediate === "FOCUSED" ? this.config.recoverSustainMs : this.config.awaySustainMs;

    if (immediate === this.state) {
      this.candidateState = null;
      this.candidateSince = 0;
    } else if (immediate === this.candidateState) {
      if (nowMs - this.candidateSince >= sustainMs) {
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

  getAttentionRatio(): number {
    if (this.observedMs === 0) return 1;
    return clamp(this.focusedMs / this.observedMs, 0, 1);
  }

  getConfig(): GazeAnalyzerConfig {
    return { ...this.config };
  }
}