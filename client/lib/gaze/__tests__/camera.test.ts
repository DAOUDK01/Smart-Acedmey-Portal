import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { acquireCameraStream, stopMediaStream, CameraUnavailableError } from "@/lib/gaze/camera";
import { mockGetUserMedia } from "@/test/setup";

describe("camera helpers", () => {
  let mockStream: MediaStream;
  let mockTrack: MediaStreamTrack;

  beforeEach(() => {
    mockTrack = { stop: vi.fn(), kind: "video", enabled: true } as unknown as MediaStreamTrack;
    mockStream = { getTracks: vi.fn().mockReturnValue([mockTrack]) } as unknown as MediaStream;
    mockGetUserMedia.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("throws unsupported when getUserMedia is not available", async () => {
    const originalMediaDevices = navigator.mediaDevices;
    vi.stubGlobal("navigator", { ...navigator, mediaDevices: undefined });
    await expect(acquireCameraStream()).rejects.toThrow(CameraUnavailableError);
    await expect(acquireCameraStream()).rejects.toMatchObject({ reason: "unsupported" });
    vi.stubGlobal("navigator", { ...navigator, mediaDevices: originalMediaDevices });
  });

  it("returns stream on success", async () => {
    mockGetUserMedia.mockResolvedValue(mockStream);
    const stream = await acquireCameraStream();
    expect(stream).toBe(mockStream);
    expect(mockGetUserMedia).toHaveBeenCalledWith({
      video: { width: { ideal: 320 }, height: { ideal: 240 }, facingMode: "user" },
      audio: false,
    });
  });

  it("throws denied for NotAllowedError", async () => {
    const error = new Error("Permission denied");
    error.name = "NotAllowedError";
    mockGetUserMedia.mockRejectedValue(error);
    await expect(acquireCameraStream()).rejects.toMatchObject({ reason: "denied" });
  });

  it("throws denied for PermissionDeniedError", async () => {
    const error = new Error("Permission denied");
    error.name = "PermissionDeniedError";
    mockGetUserMedia.mockRejectedValue(error);
    await expect(acquireCameraStream()).rejects.toMatchObject({ reason: "denied" });
  });

  it("throws unavailable for NotFoundError", async () => {
    const error = new Error("No camera");
    error.name = "NotFoundError";
    mockGetUserMedia.mockRejectedValue(error);
    await expect(acquireCameraStream()).rejects.toMatchObject({ reason: "unavailable" });
  });

  it("throws unavailable for OverconstrainedError", async () => {
    const error = new Error("Constraints not met");
    error.name = "OverconstrainedError";
    mockGetUserMedia.mockRejectedValue(error);
    await expect(acquireCameraStream()).rejects.toMatchObject({ reason: "unavailable" });
  });

  it("throws error for unknown errors", async () => {
    mockGetUserMedia.mockRejectedValue(new Error("Unknown error"));
    await expect(acquireCameraStream()).rejects.toMatchObject({ reason: "error" });
  });

  it("stopMediaStream stops all tracks", () => {
    stopMediaStream(mockStream);
    expect(mockTrack.stop).toHaveBeenCalled();
  });

  it("stopMediaStream handles null gracefully", () => {
    expect(() => stopMediaStream(null)).not.toThrow();
  });

  it("stopMediaStream handles errors in track.stop gracefully", () => {
    const badTrack = { stop: vi.fn(() => { throw new Error("stop failed"); }) } as unknown as MediaStreamTrack;
    const badStream = { getTracks: vi.fn().mockReturnValue([badTrack]) } as unknown as MediaStream;
    expect(() => stopMediaStream(badStream)).not.toThrow();
  });
});