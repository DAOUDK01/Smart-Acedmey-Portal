"use client";

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  Component,
  ReactNode,
} from "react";
import { Eye, EyeOff, Loader2, AlertCircle, VideoOff } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  loadFaceLandmarker,
  FaceLandmarkerLike,
  GazeDetectionResult,
} from "@/lib/gaze/face-landmarker-loader";
import {
  acquireCameraStream,
  stopMediaStream,
  CameraUnavailableError,
} from "@/lib/gaze/camera";
import {
  extractGazeSample,
  GazeAnalyzer,
  GazeState,
} from "@/lib/gaze/gaze-analyzer";
import { playToastSound } from "@/lib/sounds";

type Phase =
  | "idle"
  | "loading-model"
  | "requesting-camera"
  | "camera-active"
  | "running"
  | "disabled";

interface GazeMonitorProps {
  active: boolean;
  onPauseRequest?: () => void;
  onResumeRequest?: () => void;
  /** Monitoring could not start or stopped working (no camera, permission denied, model failure). */
  onUnavailable?: () => void;
  className?: string;
}

// Consecutive failed frames before the landmarker is treated as broken (~1s at 30fps).
const MAX_FRAME_ERRORS = 30;

interface GazeMonitorState {
  phase: Phase;
  state: GazeState;
  error: string | null;
  disabledReason: string | null;
}

type Feedback = "focused" | "away" | "no-face" | "unavailable";

class GazeMonitorErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

function StatusPill({
  state,
  phase,
  disabledReason,
}: {
  state: GazeState;
  phase: Phase;
  disabledReason: string | null;
}) {
  if (phase === "idle") {
    return (
      <div className="flex items-center gap-1.5 rounded-full border border-slate-500/30 bg-slate-800/60 px-2.5 py-1 text-xs font-medium text-slate-400">
        <Loader2 className="h-3.5 w-3.5" />
        <span>Initializing</span>
      </div>
    );
  }
  if (phase === "disabled") {
    return (
      <div
        className="flex items-center gap-1.5 rounded-full bg-slate-800/60 px-2.5 py-1 text-xs font-medium text-slate-400"
        title={disabledReason ?? "Focus monitoring unavailable"}
      >
        <VideoOff className="h-3.5 w-3.5" />
        <span>Focus off{disabledReason ? `: ${disabledReason}` : ""}</span>
      </div>
    );
  }
  if (
    phase === "loading-model" ||
    phase === "requesting-camera" ||
    phase === "camera-active"
  ) {
    return (
      <div className="flex items-center gap-1.5 rounded-full bg-accent-cyan/15 border border-accent-cyan/30 px-2.5 py-1 text-xs font-medium text-accent-cyan">
        {phase === "camera-active" ? (
          <Eye className="h-3.5 w-3.5" />
        ) : (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        )}
        <span>
          {phase === "loading-model"
            ? "Initializing"
            : phase === "requesting-camera"
              ? "Starting camera"
              : "Camera Active"}
        </span>
      </div>
    );
  }
  const configs: Record<
    GazeState,
    { icon: typeof Eye; color: string; label: string }
  > = {
    FOCUSED: {
      icon: Eye,
      color: "text-emerald-500 bg-emerald-500/15 border-emerald-500/30",
      label: "Face Detected",
    },
    LOOKING_AWAY: {
      icon: EyeOff,
      color: "text-amber-500 bg-amber-500/15 border-amber-500/30",
      label: "Looking Away",
    },
    NO_FACE: {
      icon: AlertCircle,
      color: "text-rose-500 bg-rose-500/15 border-rose-500/30",
      label: "No face detected",
    },
  };
  const cfg = configs[state];
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        cfg.color,
      )}
    >
      <cfg.icon className="h-3.5 w-3.5" />
      <span>{cfg.label}</span>
    </div>
  );
}

function GazeMonitorInner({
  active,
  onPauseRequest,
  onResumeRequest,
  onUnavailable,
  className,
}: GazeMonitorProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [state, setState] = useState<GazeState>("NO_FACE");
  const [error, setError] = useState<string | null>(null);
  const [disabledReason, setDisabledReason] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const landmarkerRef = useRef<FaceLandmarkerLike | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyzerRef = useRef(new GazeAnalyzer());
  const rafRef = useRef<number | null>(null);
  const timestampRef = useRef(0);
  const pausedRef = useRef(false);
  const stateRef = useRef<GazeState>("NO_FACE");
  const feedbackTimerRef = useRef<number | null>(null);
  const frameErrorsRef = useRef(0);
  const cpuFallbackTriedRef = useRef(false);
  const recoveringRef = useRef(false);
  const onUnavailableRef = useRef(onUnavailable);
  onUnavailableRef.current = onUnavailable;

  const cleanup = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (landmarkerRef.current) {
      try {
        landmarkerRef.current.close();
      } catch {}
      landmarkerRef.current = null;
    }
    stopMediaStream(streamRef.current);
    streamRef.current = null;
    analyzerRef.current.reset();
    if (feedbackTimerRef.current) {
      window.clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = null;
    }
  }, []);

  const disable = useCallback(
    (reason: string) => {
      setDisabledReason(reason);
      setPhase("disabled");
      setFeedback("unavailable");
      playToastSound("error");
      cleanup();
      pausedRef.current = false;
      onUnavailableRef.current?.();
    },
    [cleanup],
  );

  // The landmarker loaded but fails on every frame (typically the GPU delegate): retry once on CPU,
  // then give up visibly instead of silently reporting the student as focused.
  const recoverFromFrameErrors = useCallback(async () => {
    if (recoveringRef.current) return;
    recoveringRef.current = true;
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    try {
      landmarkerRef.current?.close();
    } catch {}
    landmarkerRef.current = null;

    if (cpuFallbackTriedRef.current) {
      recoveringRef.current = false;
      disable("Detection error");
      return;
    }
    cpuFallbackTriedRef.current = true;
    const cpuLandmarker = await loadFaceLandmarker({ cpuOnly: true }).catch(() => null);
    recoveringRef.current = false;
    if (!cpuLandmarker) {
      disable("Detection error");
      return;
    }
    landmarkerRef.current = cpuLandmarker;
    frameErrorsRef.current = 0;
    // Re-enter the running phase so the detection loop restarts with the CPU landmarker.
    setPhase("camera-active");
    window.setTimeout(() => setPhase("running"), 0);
  }, [disable]);

  const startDetectionLoop = useCallback(() => {
    const video = videoRef.current;
    const landmarker = landmarkerRef.current;
    if (!video || !landmarker) return;

    const tick = () => {
      if (!active || phase !== "running") return;
      const videoEl = videoRef.current;
      const lm = landmarkerRef.current;
      if (!videoEl || !lm || videoEl.readyState < 2) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      timestampRef.current = performance.now();
      try {
        const result: GazeDetectionResult = lm.detectForVideo(
          videoEl,
          timestampRef.current,
        );
        const sample = extractGazeSample(
          result.faceBlendshapes,
          result.facialTransformationMatrixes?.[0],
        );
        frameErrorsRef.current = 0;
        const newState = analyzerRef.current.update(
          sample,
          timestampRef.current,
        );

        if (newState !== stateRef.current) {
          stateRef.current = newState;
          setState(newState);
          setFeedback(
            newState === "FOCUSED"
              ? "focused"
              : newState === "LOOKING_AWAY"
                ? "away"
                : "no-face",
          );
          playToastSound(newState === "FOCUSED" ? "success" : "error");
        }

        if (newState === "LOOKING_AWAY" || newState === "NO_FACE") {
          if (!pausedRef.current) {
            pausedRef.current = true;
            onPauseRequest?.();
          }
        } else if (newState === "FOCUSED") {
          if (pausedRef.current) {
            pausedRef.current = false;
            onResumeRequest?.();
          }
        }
      } catch {
        // A single bad frame is harmless; a long run means detection is not working at all.
        frameErrorsRef.current += 1;
        if (frameErrorsRef.current >= MAX_FRAME_ERRORS) {
          void recoverFromFrameErrors();
          return;
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [active, phase, onPauseRequest, onResumeRequest, recoverFromFrameErrors]);

  useEffect(() => {
    if (!active) {
      cleanup();
      setPhase("idle");
      setState("NO_FACE");
      stateRef.current = "NO_FACE";
      setFeedback(null);
      setDisabledReason(null);
      setError(null);
      pausedRef.current = false;
      return;
    }

    let mounted = true;
    (async () => {
      setPhase("loading-model");
      const landmarker = await Promise.race([
        loadFaceLandmarker(),
        new Promise<null>((resolve) =>
          window.setTimeout(() => resolve(null), 10000),
        ),
      ]).catch(() => null);
      if (!mounted) return;
      if (!landmarker) {
        disable("Model unavailable");
        return;
      }
      landmarkerRef.current = landmarker;

      setPhase("requesting-camera");
      try {
        const stream = await acquireCameraStream();
        if (!mounted) {
          stopMediaStream(stream);
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch (e) {
        if (!mounted) return;
        if (e instanceof CameraUnavailableError) {
          disable(
            e.reason === "denied"
              ? "Camera permission denied"
              : e.reason === "unavailable"
                ? "No camera found"
                : "Camera error",
          );
        } else {
          disable("Camera error");
        }
        return;
      }

      if (!mounted) return;
      setPhase("camera-active");
      setState("NO_FACE");
      stateRef.current = "NO_FACE";
      setFeedback(null);
      // Start from "no face" so playback stays blocked until a face is actually detected.
      analyzerRef.current.reset("NO_FACE");
      frameErrorsRef.current = 0;
      cpuFallbackTriedRef.current = false;
      timestampRef.current = 0;
      pausedRef.current = false;
      window.setTimeout(() => {
        if (mounted) setPhase("running");
      }, 500);
    })();

    return () => {
      mounted = false;
      cleanup();
    };
  }, [active, cleanup, disable]);

  useEffect(() => {
    if (phase === "running") {
      startDetectionLoop();
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [phase, startDetectionLoop]);

  useEffect(() => {
    if (!feedback) return;
    if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = window.setTimeout(() => {
      setFeedback(null);
      feedbackTimerRef.current = null;
    }, 3500);
    return () => {
      if (feedbackTimerRef.current)
        window.clearTimeout(feedbackTimerRef.current);
    };
  }, [feedback]);

  return (
    <div
      className={cn(
        "absolute top-3 right-3 z-30 flex items-center gap-2",
        className,
      )}
    >
      {feedback ? (
        <div
          role="status"
          className={cn(
            "absolute right-0 top-11 flex min-w-[210px] items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold shadow-lg backdrop-blur-md motion-pop",
            feedback === "away"
              ? "border-amber-400/50 bg-amber-950/90 text-amber-100"
              : feedback === "unavailable"
                ? "border-slate-400/50 bg-slate-950/90 text-slate-100"
                : feedback === "focused"
                  ? "border-emerald-400/50 bg-emerald-950/90 text-emerald-100"
                  : "border-rose-400/50 bg-rose-950/90 text-rose-100",
          )}
        >
          {feedback === "away" ? (
            <EyeOff className="h-5 w-5 animate-pulse" />
          ) : (
            <Eye className="h-5 w-5 animate-pulse" />
          )}
          <span>
            {feedback === "away"
              ? "Looking away. Please face the screen."
              : feedback === "unavailable"
                ? `Eye detection unavailable: ${disabledReason ?? "camera or model unavailable"}.`
                : feedback === "focused"
                  ? "Face and eyes detected."
                  : "No face detected. Please face the screen."}
          </span>
        </div>
      ) : null}
      <div
        className={cn(
          "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold",
          phase === "running" || phase === "camera-active"
            ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-300"
            : "border-slate-500/30 bg-slate-800/70 text-slate-300",
        )}
      >
        <Eye className="h-3.5 w-3.5" />
        <span>
          {phase === "disabled"
            ? "👁 Eye Detection: Unavailable"
            : phase === "running" || phase === "camera-active"
              ? "👁 Eye Detection: Active"
              : "👁 Eye Detection: Initializing"}
        </span>
      </div>
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        style={{
          width: 2,
          height: 2,
          opacity: 0.01,
          pointerEvents: "none",
          position: "absolute",
          top: 0,
          right: 0,
        }}
        aria-hidden="true"
      />
      <StatusPill state={state} phase={phase} disabledReason={disabledReason} />
    </div>
  );
}

export function GazeMonitor(props: GazeMonitorProps) {
  return (
    <GazeMonitorErrorBoundary fallback={null}>
      <GazeMonitorInner {...props} />
    </GazeMonitorErrorBoundary>
  );
}
