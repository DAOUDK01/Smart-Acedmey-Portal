"use client";

import { useEffect, useRef, useState, useCallback, Component, ReactNode } from "react";
import { Eye, EyeOff, Loader2, AlertCircle, VideoOff, ScanFace } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getSharedFaceLandmarker,
  discardSharedFaceLandmarker,
  FaceLandmarkerLike,
  GazeDetectionResult,
} from "@/lib/gaze/face-landmarker-loader";
import { acquireCameraStream, stopMediaStream, CameraUnavailableError } from "@/lib/gaze/camera";
import { AwayReason, extractGazeSample, GazeAnalyzer, GazeState } from "@/lib/gaze/gaze-analyzer";
import { playToastSound } from "@/lib/sounds";

type Phase = "idle" | "starting" | "running" | "disabled";

interface GazeMonitorProps {
  active: boolean;
  onPauseRequest?: () => void;
  onResumeRequest?: () => void;
  /** Monitoring could not start or stopped working (no camera, permission denied, model failure). */
  onUnavailable?: () => void;
  className?: string;
}

// Consecutive failed frames before the landmarker is treated as broken (~2s at the detection rate).
const MAX_FRAME_ERRORS = 30;
// ~15 detections per second is plenty for attention tracking and keeps CPU-only machines responsive.
const DETECT_INTERVAL_MS = 66;
// The first load fetches and compiles the WASM runtime and model, which can be slow on a cold cache;
// it must also outlast a hung GPU attempt (ATTEMPT_TIMEOUT_MS.GPU) followed by the CPU fallback.
const MODEL_LOAD_TIMEOUT_MS = 30000;
const FOCUSED_MESSAGE_MS = 2500;
// An away period must last this long before any warning shows, so blinks and stray frames never flash one.
const WARNING_DELAY_MS = 1000;
const UNAVAILABLE_MESSAGE_MS = 5000;

type TransientMessage = "focused" | "unavailable";

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

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => window.setTimeout(() => resolve(null), ms)),
  ]);
}

function cameraErrorReason(error: unknown) {
  if (error instanceof CameraUnavailableError) {
    if (error.reason === "denied") return "Camera permission denied";
    if (error.reason === "unavailable") return "No camera found";
  }
  return "Camera error";
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
  // False until the first face lock of this session, so the UI can say it is still detecting.
  const [hasLockedFace, setHasLockedFace] = useState(false);
  const [awayCountdown, setAwayCountdown] = useState<number | null>(null);
  const [awayReason, setAwayReason] = useState<AwayReason | null>(null);
  const [disabledReason, setDisabledReason] = useState<string | null>(null);
  const [transientMessage, setTransientMessage] = useState<TransientMessage | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const landmarkerRef = useRef<FaceLandmarkerLike | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyzerRef = useRef(new GazeAnalyzer());
  const rafRef = useRef<number | null>(null);
  const lastDetectRef = useRef(0);
  const lastVideoTimeRef = useRef(-1);
  const pausedRef = useRef(false);
  const stateRef = useRef<GazeState>("NO_FACE");
  const hasLockedRef = useRef(false);
  const countdownRef = useRef<number | null>(null);
  const awayStartRef = useRef<number | null>(null);
  const awayReasonRef = useRef<AwayReason | null>(null);
  const messageTimerRef = useRef<number | null>(null);
  const frameErrorsRef = useRef(0);
  const cpuFallbackTriedRef = useRef(false);
  const recoveringRef = useRef(false);

  // The detection loop reads the latest callbacks through refs so re-renders never restart it.
  const onPauseRequestRef = useRef(onPauseRequest);
  onPauseRequestRef.current = onPauseRequest;
  const onResumeRequestRef = useRef(onResumeRequest);
  onResumeRequestRef.current = onResumeRequest;
  const onUnavailableRef = useRef(onUnavailable);
  onUnavailableRef.current = onUnavailable;

  const showTransientMessage = useCallback((message: TransientMessage) => {
    if (messageTimerRef.current) window.clearTimeout(messageTimerRef.current);
    setTransientMessage(message);
    messageTimerRef.current = window.setTimeout(
      () => {
        setTransientMessage(null);
        messageTimerRef.current = null;
      },
      message === "focused" ? FOCUSED_MESSAGE_MS : UNAVAILABLE_MESSAGE_MS,
    );
  }, []);

  const stopLoop = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const cleanup = useCallback(() => {
    stopLoop();
    // The landmarker is shared for the whole page and stays loaded so the next start is instant.
    landmarkerRef.current = null;
    stopMediaStream(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    analyzerRef.current.reset("NO_FACE");
  }, [stopLoop]);

  const disable = useCallback(
    (reason: string) => {
      cleanup();
      setDisabledReason(reason);
      setPhase("disabled");
      setAwayCountdown(null);
      countdownRef.current = null;
      awayStartRef.current = null;
      setAwayReason(null);
      awayReasonRef.current = null;
      showTransientMessage("unavailable");
      playToastSound("error");
      pausedRef.current = false;
      onUnavailableRef.current?.();
    },
    [cleanup, showTransientMessage],
  );

  const applyState = useCallback(
    (newState: GazeState, nowMs: number) => {
      if (newState !== stateRef.current) {
        stateRef.current = newState;
        setState(newState);
        if (newState === "FOCUSED") {
          if (!hasLockedRef.current) {
            hasLockedRef.current = true;
            setHasLockedFace(true);
          }
          showTransientMessage("focused");
          playToastSound("success");
        } else if (hasLockedRef.current) {
          playToastSound("error");
        }
      }

      const reason = analyzerRef.current.getAwayReason();
      if (reason !== awayReasonRef.current) {
        awayReasonRef.current = reason;
        setAwayReason(reason);
      }

      const remainingMs = analyzerRef.current.getAwayCountdownMs(nowMs);
      if (remainingMs === null) awayStartRef.current = null;
      else if (awayStartRef.current === null) awayStartRef.current = nowMs;
      const showWarning =
        remainingMs !== null &&
        awayStartRef.current !== null &&
        nowMs - awayStartRef.current >= WARNING_DELAY_MS;
      const countdown =
        showWarning && remainingMs !== null ? Math.max(1, Math.ceil(remainingMs / 1000)) : null;
      if (countdown !== countdownRef.current) {
        countdownRef.current = countdown;
        setAwayCountdown(countdown);
      }

      if (newState === "FOCUSED") {
        if (pausedRef.current) {
          pausedRef.current = false;
          onResumeRequestRef.current?.();
        }
      } else if (!pausedRef.current) {
        pausedRef.current = true;
        onPauseRequestRef.current?.();
      }
    },
    [showTransientMessage],
  );

  const recoverFromFrameErrorsRef = useRef<() => void>(() => {});

  const startLoop = useCallback(() => {
    stopLoop();
    const tick = () => {
      rafRef.current = requestAnimationFrame(tick);
      const videoEl = videoRef.current;
      const landmarker = landmarkerRef.current;
      if (!videoEl || !landmarker || videoEl.readyState < 2) return;

      const nowMs = performance.now();
      if (nowMs - lastDetectRef.current < DETECT_INTERVAL_MS) return;
      // Skip until the camera has delivered a new frame; detecting the same frame twice is wasted work.
      if (videoEl.currentTime === lastVideoTimeRef.current) return;
      lastDetectRef.current = nowMs;
      lastVideoTimeRef.current = videoEl.currentTime;

      try {
        const result: GazeDetectionResult = landmarker.detectForVideo(videoEl, nowMs);
        const sample = extractGazeSample(
          result.faceBlendshapes,
          result.facialTransformationMatrixes?.[0],
        );
        frameErrorsRef.current = 0;
        applyState(analyzerRef.current.update(sample, nowMs), nowMs);
      } catch {
        // A single bad frame is harmless; a long run means detection is not working at all.
        frameErrorsRef.current += 1;
        if (frameErrorsRef.current >= MAX_FRAME_ERRORS) {
          stopLoop();
          recoverFromFrameErrorsRef.current();
        }
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [applyState, stopLoop]);

  // The landmarker loaded but fails on every frame (typically the GPU delegate): retry once on CPU,
  // then give up visibly instead of silently reporting the student as focused.
  recoverFromFrameErrorsRef.current = async () => {
    if (recoveringRef.current) return;
    recoveringRef.current = true;
    const broken = landmarkerRef.current;
    landmarkerRef.current = null;
    if (broken) discardSharedFaceLandmarker(broken);

    if (cpuFallbackTriedRef.current) {
      recoveringRef.current = false;
      disable("Detection error");
      return;
    }
    cpuFallbackTriedRef.current = true;
    const cpuLandmarker = await getSharedFaceLandmarker({ cpuOnly: true });
    recoveringRef.current = false;
    if (!streamRef.current) return; // stopped while the CPU landmarker was loading
    if (!cpuLandmarker) {
      disable("Detection error");
      return;
    }
    landmarkerRef.current = cpuLandmarker;
    frameErrorsRef.current = 0;
    startLoop();
  };

  useEffect(() => {
    if (!active) {
      cleanup();
      setPhase("idle");
      setState("NO_FACE");
      stateRef.current = "NO_FACE";
      setHasLockedFace(false);
      hasLockedRef.current = false;
      setAwayCountdown(null);
      countdownRef.current = null;
      awayStartRef.current = null;
      setAwayReason(null);
      awayReasonRef.current = null;
      setTransientMessage(null);
      setDisabledReason(null);
      pausedRef.current = false;
      return;
    }

    let mounted = true;
    setPhase("starting");
    setState("NO_FACE");
    stateRef.current = "NO_FACE";
    setHasLockedFace(false);
    hasLockedRef.current = false;
    setAwayCountdown(null);
    countdownRef.current = null;
    awayStartRef.current = null;
    setAwayReason(null);
    awayReasonRef.current = null;
    setDisabledReason(null);
    pausedRef.current = false;
    frameErrorsRef.current = 0;
    cpuFallbackTriedRef.current = false;
    lastDetectRef.current = 0;
    lastVideoTimeRef.current = -1;

    (async () => {
      // The model and the camera are independent, so start both at once instead of one after the other.
      const landmarkerPromise = withTimeout(getSharedFaceLandmarker(), MODEL_LOAD_TIMEOUT_MS);

      let stream: MediaStream;
      try {
        stream = await acquireCameraStream();
      } catch (error) {
        if (mounted) disable(cameraErrorReason(error));
        return;
      }
      if (!mounted) {
        stopMediaStream(stream);
        return;
      }
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        // `autoPlay` starts it anyway; a rejected play() (e.g. interrupted by a re-render) is not fatal.
        await video.play().catch(() => undefined);
      }

      const landmarker = await landmarkerPromise;
      if (!mounted) return;
      if (!landmarker) {
        disable("Model unavailable");
        return;
      }
      landmarkerRef.current = landmarker;
      // Start from "no face" so playback stays blocked until a face is actually detected.
      analyzerRef.current.reset("NO_FACE");
      setPhase("running");
    })();

    return () => {
      mounted = false;
      cleanup();
    };
  }, [active, cleanup, disable]);

  useEffect(() => {
    if (phase !== "running") return;
    startLoop();
    return stopLoop;
  }, [phase, startLoop, stopLoop]);

  useEffect(
    () => () => {
      if (messageTimerRef.current) window.clearTimeout(messageTimerRef.current);
    },
    [],
  );

  const searching = phase === "starting" || (phase === "running" && !hasLockedFace);
  const tone =
    phase === "disabled" || phase === "idle"
      ? "muted"
      : searching
        ? "searching"
        : awayCountdown !== null
          ? awayReason === "looking-away"
            ? "warning"
            : "alert"
          : state === "FOCUSED"
            ? "focused"
            : state === "LOOKING_AWAY" && awayReason === "looking-away"
              ? "warning"
              : "alert";

  const toneStyles = {
    muted: "border-slate-500/30 bg-slate-800/70 text-slate-300",
    searching: "border-accent-cyan/40 bg-accent-cyan/15 text-accent-cyan",
    focused: "border-emerald-400/40 bg-emerald-500/15 text-emerald-300",
    warning: "border-amber-400/40 bg-amber-500/15 text-amber-300",
    alert: "border-rose-400/40 bg-rose-500/15 text-rose-300",
  }[tone];

  const previewRing = {
    muted: "ring-slate-500/40",
    searching: "ring-accent-cyan/70",
    focused: "ring-emerald-400/80",
    warning: "ring-amber-400/80",
    alert: "ring-rose-400/80",
  }[tone];

  const pill =
    phase === "idle"
      ? { icon: Loader2, spin: false, label: "Eye detection: waiting" }
      : phase === "disabled"
        ? { icon: VideoOff, spin: false, label: `Eye detection off${disabledReason ? `: ${disabledReason}` : ""}` }
        : phase === "starting"
          ? { icon: Loader2, spin: true, label: "Starting camera..." }
          : !hasLockedFace
            ? { icon: ScanFace, spin: false, label: "Detecting face & eyes..." }
            : state === "FOCUSED" && awayCountdown === null
              ? { icon: Eye, spin: false, label: "Face & eyes detected" }
              : awayReason === "no-face" || (state === "NO_FACE" && awayReason !== "eyes-closed")
                ? { icon: AlertCircle, spin: false, label: "No face detected" }
                : awayReason === "eyes-closed"
                  ? { icon: EyeOff, spin: false, label: "Eyes not detected" }
                  : { icon: EyeOff, spin: false, label: "Looking away" };

  const countdownText =
    awayReason === "no-face"
      ? "Face not detected."
      : awayReason === "eyes-closed"
        ? "Eyes not detected."
        : "Please face the screen.";

  // Persistent messages describe the current situation; transient ones confirm a change and fade.
  const message: { tone: keyof typeof bannerStyles; text: string } | null =
    phase === "starting"
      ? { tone: "searching", text: "Starting the camera and eye detection..." }
      : phase === "running" && !hasLockedFace
        ? { tone: "searching", text: "Detecting your face and eyes. Sit facing the camera in good light." }
        : phase === "running" && awayCountdown !== null
          ? {
              tone: awayReason === "looking-away" ? "warning" : "alert",
              text: `${countdownText} The lecture pauses in ${awayCountdown}s.`,
            }
          : phase === "running" && state === "LOOKING_AWAY" && awayReason === "eyes-closed"
            ? { tone: "alert", text: "Eyes not detected. The lecture is paused until your eyes are visible." }
          : phase === "running" && state === "LOOKING_AWAY"
            ? { tone: "warning", text: "Looking away. The lecture is paused until you face the screen." }
            : phase === "running" && state === "NO_FACE"
              ? { tone: "alert", text: "No face detected. The lecture is paused until you face the camera." }
              : transientMessage === "focused"
                ? { tone: "focused", text: "Face and eyes detected." }
                : transientMessage === "unavailable"
                  ? { tone: "muted", text: `Eye detection unavailable: ${disabledReason ?? "camera or model unavailable"}.` }
                  : null;

  const showPreview = phase === "starting" || phase === "running";

  return (
    <div className={cn("absolute right-3 top-3 z-30 flex flex-col items-end gap-2", className)}>
      <div className="flex items-start gap-2">
        <div
          role="status"
          aria-live="polite"
          className={cn(
            "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold backdrop-blur-md",
            toneStyles,
          )}
        >
          <pill.icon className={cn("h-3.5 w-3.5", pill.spin && "animate-spin", tone === "searching" && !pill.spin && "animate-pulse")} />
          <span>{pill.label}</span>
        </div>
        {/*
          A visible preview helps the student position themselves, and keeps the browser from
          throttling the camera video as an off-screen element.
        */}
        <div
          className={cn(
            "relative overflow-hidden rounded-xl bg-slate-950/80 ring-2 transition-all duration-300",
            previewRing,
            showPreview ? "h-[72px] w-24 opacity-100" : "pointer-events-none h-[72px] w-24 opacity-0",
          )}
          aria-hidden="true"
        >
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="h-full w-full -scale-x-100 object-cover"
          />
          {searching ? (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-950/40">
              <Loader2 className="h-5 w-5 animate-spin text-accent-cyan" />
            </div>
          ) : null}
        </div>
      </div>
      {message ? (
        <div
          className={cn(
            "motion-pop flex max-w-[280px] items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold shadow-lg backdrop-blur-md",
            bannerStyles[message.tone],
          )}
        >
          {message.tone === "searching" ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
          ) : message.tone === "warning" ? (
            <EyeOff className="h-4 w-4 shrink-0" />
          ) : message.tone === "alert" ? (
            <AlertCircle className="h-4 w-4 shrink-0" />
          ) : (
            <Eye className="h-4 w-4 shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      ) : null}
    </div>
  );
}

const bannerStyles = {
  searching: "border-accent-cyan/50 bg-slate-950/90 text-cyan-100",
  focused: "border-emerald-400/50 bg-emerald-950/90 text-emerald-100",
  warning: "border-amber-400/50 bg-amber-950/90 text-amber-100",
  alert: "border-rose-400/50 bg-rose-950/90 text-rose-100",
  muted: "border-slate-400/50 bg-slate-950/90 text-slate-100",
};

export function GazeMonitor(props: GazeMonitorProps) {
  return (
    <GazeMonitorErrorBoundary fallback={null}>
      <GazeMonitorInner {...props} />
    </GazeMonitorErrorBoundary>
  );
}
