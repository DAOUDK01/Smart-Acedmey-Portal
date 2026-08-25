import { describe, it, expect, vi, beforeEach } from "vitest";
import { extractGazeSample, GazeAnalyzer, GazeState } from "@/lib/gaze/gaze-analyzer";

const createBlendshapes = (overrides: Record<string, number> = {}) => {
  const defaults = {
    eyeLookOutRight: 0,
    eyeLookInLeft: 0,
    eyeLookOutLeft: 0,
    eyeLookInRight: 0,
    eyeLookUpLeft: 0,
    eyeLookUpRight: 0,
    eyeLookDownLeft: 0,
    eyeLookDownRight: 0,
  };
  return { categories: Object.entries({ ...defaults, ...overrides }).map(([categoryName, score]) => ({ categoryName, score })) };
};

const createMatrix = (yaw = 0, pitch = 0) => {
  const fx = Math.tan(yaw);
  const fz = 1;
  const horizLen = Math.hypot(fx, fz);
  const fy = -Math.sin(pitch) * horizLen;
  return {
    data: new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      fx, fy, fz, 0,
      0, 0, 0, 1,
    ]),
  };
};

describe("extractGazeSample", () => {
  it("returns neutral gaze when all blendshapes are zero", () => {
    const sample = extractGazeSample([createBlendshapes()], undefined);
    expect(sample).not.toBeNull();
    expect(sample!.horizontal).toBe(0);
    expect(sample!.vertical).toBe(0);
    expect(sample!.headYaw).toBe(0);
    expect(sample!.headPitch).toBe(0);
  });

  it("computes horizontal gaze right when eyeLookOutRight and eyeLookInLeft are high", () => {
    const sample = extractGazeSample([createBlendshapes({ eyeLookOutRight: 0.8, eyeLookInLeft: 0.7 })], undefined);
    expect(sample).not.toBeNull();
    expect(sample!.horizontal).toBeGreaterThan(0.5);
    expect(sample!.vertical).toBe(0);
  });

  it("computes horizontal gaze left when eyeLookOutLeft and eyeLookInRight are high", () => {
    const sample = extractGazeSample([createBlendshapes({ eyeLookOutLeft: 0.8, eyeLookInRight: 0.7 })], undefined);
    expect(sample).not.toBeNull();
    expect(sample!.horizontal).toBeLessThan(-0.5);
  });

  it("computes vertical gaze up when eyeLookUp scores are high", () => {
    const sample = extractGazeSample([createBlendshapes({ eyeLookUpLeft: 0.9, eyeLookUpRight: 0.9 })], undefined);
    expect(sample).not.toBeNull();
    expect(sample!.vertical).toBeGreaterThan(0.5);
  });

  it("computes vertical gaze down when eyeLookDown scores are high", () => {
    const sample = extractGazeSample([createBlendshapes({ eyeLookDownLeft: 0.9, eyeLookDownRight: 0.9 })], undefined);
    expect(sample).not.toBeNull();
    expect(sample!.vertical).toBeLessThan(-0.5);
  });

  it("extracts head yaw from transformation matrix", () => {
    const sample = extractGazeSample([createBlendshapes()], createMatrix(0.5, 0));
    expect(sample).not.toBeNull();
    expect(Math.abs(sample!.headYaw - 0.5)).toBeLessThan(0.05);
  });

  it("extracts head pitch from transformation matrix", () => {
    const sample = extractGazeSample([createBlendshapes()], createMatrix(0, -0.3));
    expect(sample).not.toBeNull();
    expect(Math.abs(sample!.headPitch - (-0.3))).toBeLessThan(0.05);
  });

  it("returns null for empty blendshapes", () => {
    const sample = extractGazeSample([{ categories: [] }], undefined);
    expect(sample).toBeNull();
  });

  it("returns null for undefined blendshapes", () => {
    const sample = extractGazeSample(undefined, undefined);
    expect(sample).toBeNull();
  });

  it("clamps blendshape scores to [0, 1]", () => {
    const sample = extractGazeSample([createBlendshapes({ eyeLookOutRight: 1.5, eyeLookInLeft: -0.5 })], undefined);
    expect(sample).not.toBeNull();
    expect(sample!.horizontal).toBeLessThanOrEqual(1);
    expect(sample!.horizontal).toBeGreaterThanOrEqual(0);
  });
});

describe("GazeAnalyzer", () => {
  let analyzer: GazeAnalyzer;
  const now = () => Date.now();

  beforeEach(() => {
    analyzer = new GazeAnalyzer({ awaySustainMs: 100, recoverSustainMs: 50 });
  });

  it("starts in FOCUSED state", () => {
    expect(analyzer.getState()).toBe("FOCUSED");
  });

  it("stays FOCUSED for neutral samples", () => {
    const sample = { horizontal: 0, vertical: 0, headYaw: 0, headPitch: 0 };
    analyzer.update(sample, now());
    expect(analyzer.getState()).toBe("FOCUSED");
  });

  it("transitions to LOOKING_AWAY after sustain window for horizontal gaze", () => {
    const sample = { horizontal: 0.5, vertical: 0, headYaw: 0, headPitch: 0 };
    analyzer.update(sample, now());
    expect(analyzer.getState()).toBe("FOCUSED");
    analyzer.update(sample, now() + 150);
    expect(analyzer.getState()).toBe("LOOKING_AWAY");
  });

  it("transitions to LOOKING_AWAY for vertical gaze", () => {
    const sample = { horizontal: 0, vertical: 0.5, headYaw: 0, headPitch: 0 };
    analyzer.update(sample, now());
    analyzer.update(sample, now() + 150);
    expect(analyzer.getState()).toBe("LOOKING_AWAY");
  });

  it("transitions to LOOKING_AWAY for head yaw", () => {
    const sample = { horizontal: 0, vertical: 0, headYaw: 0.6, headPitch: 0 };
    analyzer.update(sample, now());
    analyzer.update(sample, now() + 150);
    expect(analyzer.getState()).toBe("LOOKING_AWAY");
  });

  it("transitions to LOOKING_AWAY for head pitch", () => {
    const sample = { horizontal: 0, vertical: 0, headYaw: 0, headPitch: 0.5 };
    analyzer.update(sample, now());
    analyzer.update(sample, now() + 150);
    expect(analyzer.getState()).toBe("LOOKING_AWAY");
  });

  it("transitions to NO_FACE when sample is null", () => {
    analyzer.update(null, now());
    analyzer.update(null, now() + 150);
    expect(analyzer.getState()).toBe("NO_FACE");
  });

  it("recovers to FOCUSED after recover sustain window", () => {
    const awaySample = { horizontal: 0.5, vertical: 0, headYaw: 0, headPitch: 0 };
    analyzer.update(awaySample, now());
    analyzer.update(awaySample, now() + 150);
    expect(analyzer.getState()).toBe("LOOKING_AWAY");

    const focusedSample = { horizontal: 0, vertical: 0, headYaw: 0, headPitch: 0 };
    analyzer.update(focusedSample, now() + 200);
    expect(analyzer.getState()).toBe("LOOKING_AWAY");
    analyzer.update(focusedSample, now() + 300);
    expect(analyzer.getState()).toBe("FOCUSED");
  });

  it("does not flicker on brief glances shorter than sustain window", () => {
    const awaySample = { horizontal: 0.5, vertical: 0, headYaw: 0, headPitch: 0 };
    analyzer.update(awaySample, now());
    analyzer.update(awaySample, now() + 50);
    expect(analyzer.getState()).toBe("FOCUSED");
    analyzer.update(awaySample, now() + 80);
    expect(analyzer.getState()).toBe("FOCUSED");
  });

  it("computes attention ratio correctly", () => {
    analyzer.update({ horizontal: 0, vertical: 0, headYaw: 0, headPitch: 0 }, 0);
    analyzer.update({ horizontal: 0, vertical: 0, headYaw: 0, headPitch: 0 }, 1000);
    analyzer.update({ horizontal: 0.5, vertical: 0, headYaw: 0, headPitch: 0 }, 2000);
    analyzer.update({ horizontal: 0.5, vertical: 0, headYaw: 0, headPitch: 0 }, 3000);
    analyzer.update({ horizontal: 0.5, vertical: 0, headYaw: 0, headPitch: 0 }, 5000);
    const ratio = analyzer.getAttentionRatio();
    expect(ratio).toBeGreaterThan(0.2);
    expect(ratio).toBeLessThan(0.6);
  });

  it("reset clears state and stats", () => {
    analyzer.update({ horizontal: 0.5, vertical: 0, headYaw: 0, headPitch: 0 }, now());
    analyzer.update({ horizontal: 0.5, vertical: 0, headYaw: 0, headPitch: 0 }, now() + 150);
    analyzer.reset();
    expect(analyzer.getState()).toBe("FOCUSED");
    expect(analyzer.getAttentionRatio()).toBe(1);
  });

  it("handles NaN/undefined values gracefully", () => {
    analyzer.update({ horizontal: NaN, vertical: 0, headYaw: 0, headPitch: 0 }, now());
    expect(analyzer.getState()).toBe("FOCUSED");
  });
});