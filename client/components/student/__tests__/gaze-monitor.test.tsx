import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const detectForVideo = vi.fn();
const getSharedFaceLandmarker = vi.fn();
const acquireCameraStream = vi.fn();

vi.mock("@/lib/gaze/face-landmarker-loader", () => ({
  getSharedFaceLandmarker: (...args: unknown[]) => getSharedFaceLandmarker(...args),
  discardSharedFaceLandmarker: vi.fn(),
}));
vi.mock("@/lib/gaze/camera", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/gaze/camera")>()),
  acquireCameraStream: () => acquireCameraStream(),
}));
vi.mock("@/lib/sounds", () => ({ playToastSound: vi.fn() }));

import { GazeMonitor } from "../gaze-monitor";
import { CameraUnavailableError } from "@/lib/gaze/camera";

const faceResult = {
  faceBlendshapes: [{ categories: [{ categoryName: "eyeBlinkLeft", score: 0 }] }],
  facialTransformationMatrixes: [],
};

describe("GazeMonitor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // jsdom never decodes video, so report a ready camera with a fresh frame every time it is read.
    Object.defineProperty(HTMLVideoElement.prototype, "readyState", { configurable: true, get: () => 4 });
    Object.defineProperty(HTMLVideoElement.prototype, "currentTime", {
      configurable: true,
      get: () => performance.now(),
      set: () => {},
    });
    acquireCameraStream.mockResolvedValue(new MediaStream());
    getSharedFaceLandmarker.mockResolvedValue({ detectForVideo, close: vi.fn() });
  });

  afterEach(() => {
    delete (HTMLVideoElement.prototype as { readyState?: number }).readyState;
    delete (HTMLVideoElement.prototype as { currentTime?: number }).currentTime;
  });

  it("says it is detecting until a face is found, then confirms and resumes", async () => {
    detectForVideo.mockReturnValue({ faceBlendshapes: [] });
    const onPauseRequest = vi.fn();
    const onResumeRequest = vi.fn();
    render(<GazeMonitor active onPauseRequest={onPauseRequest} onResumeRequest={onResumeRequest} />);

    expect(await screen.findByText("Detecting face & eyes...")).toBeInTheDocument();
    expect(screen.getByText(/Detecting your face and eyes/)).toBeInTheDocument();
    await waitFor(() => expect(onPauseRequest).toHaveBeenCalled());

    detectForVideo.mockReturnValue(faceResult);
    expect(await screen.findByText("Face & eyes detected", {}, { timeout: 3000 })).toBeInTheDocument();
    expect(onResumeRequest).toHaveBeenCalledTimes(1);
  });

  it("loads the model and the camera at the same time", async () => {
    let resolveCamera: (stream: MediaStream) => void = () => {};
    acquireCameraStream.mockReturnValue(new Promise((resolve) => (resolveCamera = resolve)));
    render(<GazeMonitor active />);
    expect(getSharedFaceLandmarker).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Starting camera...")).toBeInTheDocument();
    resolveCamera(new MediaStream());
  });

  it("reports monitoring as unavailable when the camera is denied", async () => {
    acquireCameraStream.mockRejectedValue(new CameraUnavailableError("denied", "denied"));
    const onUnavailable = vi.fn();
    render(<GazeMonitor active onUnavailable={onUnavailable} />);
    await waitFor(() => expect(onUnavailable).toHaveBeenCalledTimes(1));
    expect(screen.getByText(/Eye detection off: Camera permission denied/)).toBeInTheDocument();
  });
});
