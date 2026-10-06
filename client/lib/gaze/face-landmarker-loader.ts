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

async function tryLoad(wasmPath: string, modelPath: string, delegate: "GPU" | "CPU"): Promise<FaceLandmarkerLike | null> {
  let vision: VisionModule;
  try {
    vision = (await import("@mediapipe/tasks-vision")) as unknown as VisionModule;
  } catch {
    return null;
  }

  let fileset: any;
  try {
    fileset = await vision.FilesetResolver.forVisionTasks(wasmPath);
  } catch {
    return null;
  }

  try {
    const landmarker = await vision.FaceLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: modelPath,
        delegate,
      },
      runningMode: "VIDEO",
      numFaces: 1,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
    });
    return landmarker as unknown as FaceLandmarkerLike;
  } catch {
    return null;
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

  for (const a of attempts) {
    const lm = await tryLoad(a.wasm, a.model, a.delegate);
    if (lm) return lm;
  }
  return null;
}