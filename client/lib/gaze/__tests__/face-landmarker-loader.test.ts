import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { loadFaceLandmarker } from "@/lib/gaze/face-landmarker-loader";

describe("loadFaceLandmarker", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns null when @mediapipe/tasks-vision fails to import", async () => {
    vi.doMock("@mediapipe/tasks-vision", () => {
      throw new Error("Module not found");
    });
    const { loadFaceLandmarker: loader } = await import("@/lib/gaze/face-landmarker-loader");
    const result = await loader();
    expect(result).toBeNull();
  });

  it("returns null when FilesetResolver fails", async () => {
    vi.doMock("@mediapipe/tasks-vision", () => ({
      FilesetResolver: {
        forVisionTasks: vi.fn().mockRejectedValue(new Error("WASM load failed")),
      },
      FaceLandmarker: {
        createFromOptions: vi.fn(),
      },
      Delegate: { GPU: "GPU", CPU: "CPU" },
    }));
    const { loadFaceLandmarker: loader } = await import("@/lib/gaze/face-landmarker-loader");
    const result = await loader();
    expect(result).toBeNull();
  });

  it("returns null when FaceLandmarker.createFromOptions fails for all attempts", async () => {
    vi.doMock("@mediapipe/tasks-vision", () => ({
      FilesetResolver: {
        forVisionTasks: vi.fn().mockResolvedValue({}),
      },
      FaceLandmarker: {
        createFromOptions: vi.fn().mockRejectedValue(new Error("Model load failed")),
      },
      Delegate: { GPU: "GPU", CPU: "CPU" },
    }));
    const { loadFaceLandmarker: loader } = await import("@/lib/gaze/face-landmarker-loader");
    const result = await loader();
    expect(result).toBeNull();
  });

  it("returns a landmarker-like object on success", async () => {
    const mockDetect = vi.fn().mockReturnValue({ faceBlendshapes: [], facialTransformationMatrixes: [] });
    const mockClose = vi.fn();
    
    vi.doMock("@mediapipe/tasks-vision", () => ({
      FilesetResolver: {
        forVisionTasks: vi.fn().mockResolvedValue({}),
      },
      FaceLandmarker: {
        createFromOptions: vi.fn().mockResolvedValue({
          detectForVideo: mockDetect,
          close: mockClose,
        }),
      },
      Delegate: { GPU: "GPU", CPU: "CPU" },
    }));
    const { loadFaceLandmarker: loader } = await import("@/lib/gaze/face-landmarker-loader");
    const result = await loader();
    expect(result).not.toBeNull();
    expect(typeof result?.detectForVideo).toBe("function");
    expect(typeof result?.close).toBe("function");
  });
});