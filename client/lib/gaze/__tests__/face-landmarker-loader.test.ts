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
describe("loadFaceLandmarker with a hung GPU", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("falls back to CPU when creating the GPU landmarker never settles, and skips other GPU attempts", async () => {
    const cpuLandmarker = { detectForVideo: vi.fn(), close: vi.fn() };
    const lateGpuLandmarker = { detectForVideo: vi.fn(), close: vi.fn() };
    let finishGpu: (value: unknown) => void = () => undefined;
    const createFromOptions = vi.fn((_fileset: unknown, options: { baseOptions: { delegate: string } }) =>
      options.baseOptions.delegate === "GPU"
        ? new Promise((resolve) => {
            finishGpu = resolve;
          })
        : Promise.resolve(cpuLandmarker),
    );
    vi.doMock("@mediapipe/tasks-vision", () => ({
      FilesetResolver: { forVisionTasks: vi.fn().mockResolvedValue({}) },
      FaceLandmarker: { createFromOptions },
    }));
    const { loadFaceLandmarker: loader, ATTEMPT_TIMEOUT_MS } = await import("@/lib/gaze/face-landmarker-loader");

    const pending = loader();
    await vi.advanceTimersByTimeAsync(ATTEMPT_TIMEOUT_MS.GPU);
    expect(await pending).toBe(cpuLandmarker);
    expect(createFromOptions.mock.calls.map(([, options]) => options.baseOptions.delegate)).toEqual(["GPU", "CPU"]);

    // A GPU landmarker that finally turns up after the timeout is closed, not leaked.
    finishGpu(lateGpuLandmarker);
    await vi.runAllTimersAsync();
    expect(lateGpuLandmarker.close).toHaveBeenCalled();
  });
});

describe("getSharedFaceLandmarker", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("loads the landmarker once and shares it between callers", async () => {
    const createFromOptions = vi.fn().mockResolvedValue({ detectForVideo: vi.fn(), close: vi.fn() });
    const forVisionTasks = vi.fn().mockResolvedValue({});
    vi.doMock("@mediapipe/tasks-vision", () => ({
      FilesetResolver: { forVisionTasks },
      FaceLandmarker: { createFromOptions },
    }));
    const { getSharedFaceLandmarker } = await import("@/lib/gaze/face-landmarker-loader");
    const [first, second] = await Promise.all([getSharedFaceLandmarker(), getSharedFaceLandmarker()]);
    const third = await getSharedFaceLandmarker();
    expect(first).not.toBeNull();
    expect(second).toBe(first);
    expect(third).toBe(first);
    expect(createFromOptions).toHaveBeenCalledTimes(1);
    expect(forVisionTasks).toHaveBeenCalledTimes(1);
  });

  it("retries after a failed load and after a landmarker is discarded", async () => {
    const landmarker = { detectForVideo: vi.fn(), close: vi.fn() };
    const createFromOptions = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockRejectedValueOnce(new Error("fail"))
      .mockRejectedValueOnce(new Error("fail"))
      .mockRejectedValueOnce(new Error("fail"))
      .mockRejectedValueOnce(new Error("fail"))
      .mockRejectedValueOnce(new Error("fail"))
      .mockRejectedValueOnce(new Error("fail"))
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValue(landmarker);
    vi.doMock("@mediapipe/tasks-vision", () => ({
      FilesetResolver: { forVisionTasks: vi.fn().mockResolvedValue({}) },
      FaceLandmarker: { createFromOptions },
    }));
    const { getSharedFaceLandmarker, discardSharedFaceLandmarker } = await import(
      "@/lib/gaze/face-landmarker-loader"
    );
    expect(await getSharedFaceLandmarker()).toBeNull();
    await Promise.resolve();
    const loaded = await getSharedFaceLandmarker();
    expect(loaded).toBe(landmarker);

    discardSharedFaceLandmarker(loaded!);
    expect(landmarker.close).toHaveBeenCalled();
    await Promise.resolve();
    await Promise.resolve();
    await getSharedFaceLandmarker();
    expect(createFromOptions.mock.calls.length).toBeGreaterThan(9);
  });
});
