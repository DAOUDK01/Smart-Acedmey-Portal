import "@testing-library/jest-dom";
import { vi } from "vitest";

Object.defineProperty(window, "requestAnimationFrame", {
  writable: true,
  value: (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 16),
});

Object.defineProperty(window, "cancelAnimationFrame", {
  writable: true,
  value: (id: number) => clearTimeout(id),
});

HTMLVideoElement.prototype.play = vi.fn(() => Promise.resolve());
HTMLVideoElement.prototype.pause = vi.fn();

const mockGetUserMedia = vi.fn();
Object.defineProperty(navigator, "mediaDevices", {
  writable: true,
  value: {
    getUserMedia: mockGetUserMedia,
  },
});

vi.stubGlobal("MediaStream", class MockMediaStream {
  tracks: MediaStreamTrack[] = [];
  getTracks() { return this.tracks; }
});

vi.stubGlobal("MediaStreamTrack", class MockMediaStreamTrack {
  stop = vi.fn();
  kind: "video" | "audio" = "video";
  enabled = true;
});

export { mockGetUserMedia };