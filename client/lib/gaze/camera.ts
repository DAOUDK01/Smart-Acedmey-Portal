export class CameraUnavailableError extends Error {
  readonly reason: "unsupported" | "denied" | "unavailable" | "error";
  constructor(reason: CameraUnavailableError["reason"], message: string) {
    super(message);
    this.name = "CameraUnavailableError";
    this.reason = reason;
  }
}

export async function acquireCameraStream(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new CameraUnavailableError("unsupported", "getUserMedia is not supported");
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 320 }, height: { ideal: 240 }, facingMode: "user" },
      audio: false,
    });
    return stream;
  } catch (e: any) {
    const name = e?.name ?? "";
    if (name === "NotAllowedError" || name === "PermissionDeniedError") {
      throw new CameraUnavailableError("denied", "Camera permission denied");
    }
    if (name === "NotFoundError" || name === "OverconstrainedError") {
      throw new CameraUnavailableError("unavailable", "No camera found or constraints not met");
    }
    throw new CameraUnavailableError("error", e?.message ?? "Failed to acquire camera");
  }
}

export function stopMediaStream(stream: MediaStream | null): void {
  if (!stream) return;
  try {
    stream.getTracks().forEach((t) => t.stop());
  } catch {
    // ignore
  }
}