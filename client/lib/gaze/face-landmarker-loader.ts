export interface BlendshapeCategory {
  categoryName: string;
  score: number;
}

export interface FaceBlendshapes {
  categories: BlendshapeCategory[];
}

export interface NormalizedLandmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
  presence?: number;
}

export interface GazeDetectionResult {
  faceLandmarks?: NormalizedLandmark[][];
  faceBlendshapes?: FaceBlendshapes[];
  facialTransformationMatrixes?: { data: number[] | Float32Array }[];
}

export interface FaceLandmarkerLike {
  detectForVideo(video: HTMLVideoElement, timestampMs: number): GazeDetectionResult;
  close(): void;
}

const LOCAL_WASM = "/mediapipe/wasm";
const CDN_WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const LOCAL_MODEL = "/mediapipe/models/face_landmarker.task";
const CDN_MODEL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

type VisionModule = {
  FilesetResolver: {
    forVisionTasks: (path: string) => Promise<{ wasmPath: string }>;
  };
  FaceLandmarker: {
    createFromOptions: (
      fileset: any,
      options: any
    ) => Promise<{
      detectForVideo: (video: HTMLVideoElement, timestampMs: number) => any;
      close: () => void;
    }>;
  };
};

// On some Windows GPU drivers creating the GPU landmarker never settles (no error, no result), which
// would stall every later attempt; each attempt is therefore bounded and a hung GPU is skipped after.
export const ATTEMPT_TIMEOUT_MS: Record<"GPU" | "CPU", number> = { GPU: 8000, CPU: 15000 };

class AttemptTimeoutError extends Error {}

// The WASM fileset is the slow part of start-up; resolve it once per path and reuse it across
// delegate attempts instead of fetching and compiling it again for each one.
const filesetCache = new Map<string, Promise<any>>();

async function tryLoad(wasmPath: string, modelPath: string, delegate: "GPU" | "CPU"): Promise<FaceLandmarkerLike | null> {
  let vision: VisionModule;
  try {
    vision = (await import("@mediapipe/tasks-vision")) as unknown as VisionModule;
  } catch {
    return null;
  }

  let fileset: any;
  try {
    let pending = filesetCache.get(wasmPath);
    if (!pending) {
      pending = vision.FilesetResolver.forVisionTasks(wasmPath);
      filesetCache.set(wasmPath, pending);
    }
    fileset = await pending;
  } catch {
    filesetCache.delete(wasmPath);
    return null;
  }

  let creating: Promise<{ detectForVideo: (video: HTMLVideoElement, timestampMs: number) => any; close: () => void }>;
  try {
    creating = vision.FaceLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: modelPath,
        delegate,
      },
      runningMode: "VIDEO",
      numFaces: 1,
      // Slightly more permissive than the 0.5 defaults so a face is picked up quickly in average
      // webcam lighting; the analyzer's sustain windows absorb any jitter this lets through.
      minFaceDetectionConfidence: 0.4,
      minFacePresenceConfidence: 0.4,
      minTrackingConfidence: 0.4,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
    });
  } catch (error) {
    console.warn(`Face landmarker (${delegate}, ${modelPath}) failed to start.`, error);
    return null;
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const landmarker = await Promise.race([
      creating,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new AttemptTimeoutError()), ATTEMPT_TIMEOUT_MS[delegate]);
      }),
    ]);
    return landmarker as unknown as FaceLandmarkerLike;
  } catch (error) {
    if (error instanceof AttemptTimeoutError) {
      // A late landmarker would otherwise hold its WASM memory and WebGL context for the session.
      creating.then((late) => late.close(), () => undefined);
      throw error;
    }
    console.warn(`Face landmarker (${delegate}, ${modelPath}) failed to load.`, error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * `cpuOnly` skips the GPU delegate: on some machines the GPU landmarker is created fine but then
 * fails on every frame, so the monitor retries on CPU when that happens.
 */
export async function loadFaceLandmarker(
  options: { cpuOnly?: boolean } = {},
): Promise<FaceLandmarkerLike | null> {
  const allAttempts = [
    { wasm: LOCAL_WASM, model: LOCAL_MODEL, delegate: "GPU" as const },
    { wasm: LOCAL_WASM, model: LOCAL_MODEL, delegate: "CPU" as const },
    { wasm: CDN_WASM, model: LOCAL_MODEL, delegate: "GPU" as const },
    { wasm: CDN_WASM, model: LOCAL_MODEL, delegate: "CPU" as const },
    { wasm: LOCAL_WASM, model: CDN_MODEL, delegate: "GPU" as const },
    { wasm: LOCAL_WASM, model: CDN_MODEL, delegate: "CPU" as const },
    { wasm: CDN_WASM, model: CDN_MODEL, delegate: "GPU" as const },
    { wasm: CDN_WASM, model: CDN_MODEL, delegate: "CPU" as const },
  ];
  const attempts = options.cpuOnly
    ? allAttempts.filter((attempt) => attempt.delegate === "CPU")
    : allAttempts;

  let gpuHung = false;
  for (const a of attempts) {
    if (gpuHung && a.delegate === "GPU") continue;
    try {
      const lm = await tryLoad(a.wasm, a.model, a.delegate);
      if (lm) return lm;
    } catch (error) {
      if (!(error instanceof AttemptTimeoutError)) throw error;
      console.warn(`Face landmarker (${a.delegate}) did not start within ${ATTEMPT_TIMEOUT_MS[a.delegate]}ms; trying the next option.`);
      if (a.delegate === "GPU") gpuHung = true;
    }
  }
  return null;
}

type LoadMode = "auto" | "cpu";
const sharedLandmarkers = new Map<LoadMode, Promise<FaceLandmarkerLike | null>>();

/**
 * One landmarker per page, shared by every gaze monitor. Creating it takes seconds (WASM + model),
 * so it is kept alive for the session instead of being rebuilt each time a lecture opens or the
 * student returns to the tab. A failed load is not cached, so the next call retries.
 */
export function getSharedFaceLandmarker(options: { cpuOnly?: boolean } = {}): Promise<FaceLandmarkerLike | null> {
  const mode: LoadMode = options.cpuOnly ? "cpu" : "auto";
  let pending = sharedLandmarkers.get(mode);
  if (!pending) {
    pending = loadFaceLandmarker(options).catch(() => null);
    sharedLandmarkers.set(mode, pending);
    void pending.then((landmarker) => {
      if (!landmarker && sharedLandmarkers.get(mode) === pending) sharedLandmarkers.delete(mode);
    });
  }
  return pending;
}

/** Start loading the shared landmarker ahead of time, e.g. as soon as the student portal opens. */
export function preloadFaceLandmarker(): void {
  if (typeof window === "undefined") return;
  void getSharedFaceLandmarker();
}

/** Drop a shared landmarker that turned out to be broken (e.g. the GPU delegate fails every frame). */
export function discardSharedFaceLandmarker(landmarker: FaceLandmarkerLike): void {
  for (const [mode, pending] of sharedLandmarkers) {
    void pending.then((current) => {
      if (current === landmarker && sharedLandmarkers.get(mode) === pending) {
        sharedLandmarkers.delete(mode);
      }
    });
  }
  try {
    landmarker.close();
  } catch {}
}
