"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, FileQuestion, Maximize, Minimize, Pause, Play, RotateCcw, Settings2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { GazeMonitor } from "@/components/student/gaze-monitor";

export type LectureQuiz = {
  id: string;
  question: string;
  options: string[];
  correctAnswer: string;
  difficulty: "easy" | "medium" | "hard";
  timestamp?: number;
  topic?: string;
  segment?: string;
};

type LecturePlayerProps = {
  title: string;
  videoUrl: string;
  apiBaseUrl: string;
  thumbnailUrl?: string | null;
  sourceType?: string | null;
  hlsMasterUrl?: string | null;
  processingStatus?: string | null;
  processingProgress?: number | null;
  processingError?: string | null;
  quizzes: LectureQuiz[];
  answeredQuizIds: Set<string>;
  onQuizAnswered: (quizId: string) => void;
  onSubmitAnswer: (
    quiz: LectureQuiz,
    answer: string,
  ) => Promise<{ passed: boolean; correctAnswer: string; explanation: string } | null>;
  isActive?: boolean;
  onWatchProgress?: (percent: number) => void;
};

function getYouTubeId(url: string) {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return match && match[2].length === 11 ? match[2] : null;
}

function formatTime(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

declare global {
  interface Window {
    YT?: {
      Player: new (
        elementId: string,
        options: Record<string, unknown>,
      ) => YouTubePlayer;
      PlayerState: {
        PLAYING: number;
        PAUSED: number;
        ENDED: number;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

type YouTubePlayer = {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  destroy: () => void;
};

function loadYouTubeApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearInterval(pollId);
      resolve();
    };
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      finish();
    };

    const pollId = window.setInterval(() => {
      if (window.YT?.Player) finish();
    }, 50);

    if (!document.getElementById("youtube-iframe-api")) {
      const script = document.createElement("script");
      script.id = "youtube-iframe-api";
      script.src = "https://www.youtube.com/iframe_api";
      document.body.appendChild(script);
    }
  });
}

export function LecturePlayer({
  title,
  videoUrl,
  apiBaseUrl,
  thumbnailUrl,
  sourceType,
  hlsMasterUrl,
  processingStatus,
  processingProgress,
  processingError,
  quizzes,
  answeredQuizIds,
  onQuizAnswered,
  onSubmitAnswer,
  isActive = true,
  onWatchProgress,
}: LecturePlayerProps) {
  const reactId = useId().replace(/:/g, "");
  const youtubeId = getYouTubeId(videoUrl);
  const isYouTube = Boolean(youtubeId);
  const isUploaded =
    !isYouTube && (sourceType === "UPLOAD" || videoUrl.startsWith("/uploads/"));
  const hlsReady = Boolean(hlsMasterUrl) && processingStatus === "READY";
  const playerContainerId = `yt-player-${reactId}`;

  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const maxWatchedRef = useRef(0);
  const lastTickWallRef = useRef<number | null>(null);
  const playbackRateRef = useRef(1);
  const lastCheckTimeRef = useRef(-1);
  const quizzesRef = useRef(quizzes);
  const answeredRef = useRef(answeredQuizIds);
  const currentQuizRef = useRef<LectureQuiz | null>(null);
  const sessionActiveRef = useRef(false);
  const onWatchProgressRef = useRef(onWatchProgress);
  onWatchProgressRef.current = onWatchProgress;

  const [playerReady, setPlayerReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [displayTime, setDisplayTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [seekWarning, setSeekWarning] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [playbackRate, setPlaybackRate] = useState(1);
  playbackRateRef.current = playbackRate;
  const [qualityLevels, setQualityLevels] = useState<{ index: number; label: string }[]>([]);
  const [activeLevelIndex, setActiveLevelIndex] = useState(-1);
  const [autoQuality, setAutoQuality] = useState(true);
  const [qualityOpen, setQualityOpen] = useState(false);
  const hlsRef = useRef<any>(null);
  const nativeHlsRef = useRef(false);
  const [currentQuiz, setCurrentQuiz] = useState<LectureQuiz | null>(null);
  const [sessionQuizzes, setSessionQuizzes] = useState<LectureQuiz[]>([]);
  const [sessionIndex, setSessionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [quizResult, setQuizResult] = useState<{
    passed: boolean;
    correctAnswer: string;
    explanation: string;
  } | null>(null);

  const sortedQuizzes = useMemo(
    () =>
      [...quizzes]
        .filter((quiz) => typeof quiz.timestamp === "number")
        .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0)),
    [quizzes],
  );

  useEffect(() => {
    quizzesRef.current = sortedQuizzes;
  }, [sortedQuizzes]);

  useEffect(() => {
    answeredRef.current = answeredQuizIds;
  }, [answeredQuizIds]);

  useEffect(() => {
    currentQuizRef.current = currentQuiz;
  }, [currentQuiz]);

  // The player can sit partly below the fold; bring the whole quiz on screen when it opens
  // so the options and Submit button are never cut off.
  const quizOpen = currentQuiz !== null;
  useEffect(() => {
    if (!quizOpen) return;
    containerRef.current?.scrollIntoView?.({ block: "center", behavior: "smooth" });
  }, [quizOpen]);

  const pausePlayback = useCallback(() => {
    if (isYouTube && playerRef.current?.pauseVideo) {
      playerRef.current.pauseVideo();
      setIsPlaying(false);
    } else {
      videoRef.current?.pause();
      setIsPlaying(false);
    }
  }, [isYouTube]);

  const resumePlayback = useCallback(() => {
    // A pending quiz must be answered first: the play button, gaze monitor and
    // browser autoplay all route through here or the handlers below.
    if (sessionActiveRef.current) return;
    if (isYouTube && playerRef.current?.playVideo) {
      playerRef.current.playVideo();
      setIsPlaying(true);
    } else {
      void videoRef.current?.play();
      setIsPlaying(true);
    }
  }, [isYouTube]);

  const getCurrentTime = useCallback(() => {
    if (isYouTube && playerRef.current?.getCurrentTime) {
      return playerRef.current.getCurrentTime();
    }
    return videoRef.current?.currentTime ?? 0;
  }, [isYouTube]);

  const enforceProgressLock = useCallback(
    (currentTime: number) => {
      const allowed = maxWatchedRef.current;

      // Normal playback can advance by more than one poll interval when the page stalls
      // (slow device, busy tab, buffering catch-up). Allow for the real time that passed
      // so only a genuine jump forward counts as skipping.
      const now = performance.now();
      const elapsedSeconds = lastTickWallRef.current === null ? 0 : (now - lastTickWallRef.current) / 1000;
      lastTickWallRef.current = now;
      const tolerance = 1.25 + Math.min(elapsedSeconds, 5) * playbackRateRef.current;

      if (currentTime > allowed + tolerance) {
        if (isYouTube && playerRef.current?.seekTo) {
          playerRef.current.seekTo(allowed, true);
          playerRef.current.pauseVideo();
          setIsPlaying(false);
        } else if (videoRef.current) {
          videoRef.current.currentTime = allowed;
          videoRef.current.pause();
          setIsPlaying(false);
        }
        setSeekWarning(true);
        window.setTimeout(() => setSeekWarning(false), 2500);
        setDisplayTime(allowed);
        return allowed;
      }

      if (currentTime > allowed) {
        maxWatchedRef.current = currentTime;
      }

      setDisplayTime(currentTime);
      return currentTime;
    },
    [isYouTube],
  );

  const checkQuizTriggers = useCallback(
    (currentTime: number) => {
      const pending = quizzesRef.current
        .filter(
          (quiz) =>
            quiz.timestamp !== undefined &&
            quiz.timestamp <= currentTime &&
            quiz.timestamp > lastCheckTimeRef.current &&
            !answeredRef.current.has(quiz.id),
        )
        .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

      if (pending.length > 0 && !sessionActiveRef.current) {
        const difficulty = pending[0].difficulty;
        // Only questions the student has already reached: never quiz them on video they have not watched yet.
        const group = quizzesRef.current
          .filter(
            (quiz) =>
              quiz.difficulty === difficulty &&
              quiz.timestamp !== undefined &&
              quiz.timestamp <= currentTime &&
              !answeredRef.current.has(quiz.id),
          )
          .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        sessionActiveRef.current = true;
        pausePlayback();
        setSessionQuizzes(group);
        setSessionIndex(0);
        setCurrentQuiz(group[0] ?? null);
      }
      lastCheckTimeRef.current = currentTime;
    },
    [pausePlayback],
  );

  const tickPlayback = useCallback(() => {
    const currentTime = enforceProgressLock(getCurrentTime());
    checkQuizTriggers(currentTime);

    // Safety net: if anything managed to start playback during a quiz, stop it again.
    if (sessionActiveRef.current) {
      const stillPlaying = isYouTube
        ? playerRef.current?.getPlayerState?.() === window.YT?.PlayerState.PLAYING
        : Boolean(videoRef.current && !videoRef.current.paused);
      if (stillPlaying) pausePlayback();
    }

    let total = 0;
    if (isYouTube && playerRef.current?.getDuration) {
      total = playerRef.current.getDuration();
      if (total && Number.isFinite(total)) {
        setDuration(total);
      }
      const state = playerRef.current.getPlayerState?.();
      setIsPlaying(state === window.YT?.PlayerState.PLAYING);
    } else if (videoRef.current?.duration && Number.isFinite(videoRef.current.duration)) {
      total = videoRef.current.duration;
      setDuration(total);
    }

    if (total > 0 && maxWatchedRef.current > 0) {
      onWatchProgressRef.current?.(
        Math.min(100, (maxWatchedRef.current / total) * 100),
      );
    }
  }, [checkQuizTriggers, enforceProgressLock, getCurrentTime, isYouTube, pausePlayback]);

  const handleTimeUpdate = () => {
    tickPlayback();
  };

  const handleSeeking = () => {
    if (!videoRef.current) return;
    if (videoRef.current.currentTime > maxWatchedRef.current + 0.5) {
      videoRef.current.currentTime = maxWatchedRef.current;
      videoRef.current.pause();
      setIsPlaying(false);
      setSeekWarning(true);
      window.setTimeout(() => setSeekWarning(false), 2500);
    }
  };

  useEffect(() => {
    maxWatchedRef.current = 0;
    lastTickWallRef.current = null;
    lastCheckTimeRef.current = -1;
    sessionActiveRef.current = false;
    setCurrentQuiz(null);
    setSessionQuizzes([]);
    setSessionIndex(0);
    setSelectedAnswer(null);
    setQuizResult(null);
    setDisplayTime(0);
    setDuration(0);
    setPlayerReady(false);
    setIsFullscreen(false);
    setBuffering(false);
    setPlaybackError(null);
    setPlaybackRate(1);
    setQualityLevels([]);
    setActiveLevelIndex(-1);
    setAutoQuality(true);
    setQualityOpen(false);
  }, [videoUrl]);

  // When the player is hidden (e.g. the student switched tabs), pause at the
  // current position. Returning to the tab leaves it paused where it was.
  useEffect(() => {
    if (!isActive) {
      pausePlayback();
    }
  }, [isActive, pausePlayback]);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === containerRef.current);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(() => {
    if (!isYouTube || !youtubeId) return;

    let intervalId: number | undefined;
    let destroyed = false;

    const mountPlayer = async () => {
      await loadYouTubeApi();
      if (destroyed || !window.YT?.Player) return;

      playerRef.current?.destroy?.();

      playerRef.current = new window.YT.Player(playerContainerId, {
        videoId: youtubeId,
        width: "100%",
        height: "100%",
        playerVars: {
          autoplay: 1,
          controls: 0,
          disablekb: 1,
          fs: 0,
          rel: 0,
          modestbranding: 1,
          iv_load_policy: 3,
          playsinline: 1,
          origin:
            typeof window !== "undefined" ? window.location.origin : undefined,
        },
        events: {
          onReady: (event: { target: YouTubePlayer }) => {
            if (destroyed) return;
            playerRef.current = event.target;
            setPlayerReady(true);
            setDuration(event.target.getDuration() || 0);
            event.target.playVideo();
          },
          onError: () => {
            if (destroyed) return;
            setIsPlaying(false);
            setPlaybackError("This YouTube video is unavailable. Choose another lecture.");
          },
          onStateChange: (event: { data: number }) => {
            if (destroyed) return;
            setIsPlaying(event.data === window.YT?.PlayerState.PLAYING);
            tickPlayback();
          },
        },
      });
    };

    void mountPlayer();

    intervalId = window.setInterval(() => {
      if (!playerRef.current?.getCurrentTime) return;
      tickPlayback();
    }, 200);

    return () => {
      destroyed = true;
      if (intervalId) window.clearInterval(intervalId);
      playerRef.current = null;
      const container = document.getElementById(playerContainerId);
      if (container) {
        // YouTube owns the iframe DOM. Clear it before React reuses the container.
        container.replaceChildren();
      }
    };
  }, [isYouTube, youtubeId, playerContainerId, tickPlayback]);

  const resolveUrl = useCallback(
    (url: string) => (url.startsWith("http") ? url : `${apiBaseUrl}${url}`),
    [apiBaseUrl],
  );

  // HLS adaptive playback for uploaded videos (hls.js where needed,
  // native HLS where supported). YouTube keeps its own player path.
  useEffect(() => {
    if (!hlsReady || !hlsMasterUrl) return;

    const video = videoRef.current;
    if (!video) return;

    let hls: any = null;
    let destroyed = false;
    const masterUrl = resolveUrl(hlsMasterUrl);

    const setup = async () => {
      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = masterUrl;
        nativeHlsRef.current = true;
        return;
      }

      try {
        const Hls = (await import("hls.js")).default;
        if (destroyed) return;
        if (!Hls.isSupported()) {
          setPlaybackError("Your browser does not support adaptive video playback.");
          return;
        }

        hls = new Hls({ enableWorker: true, lowLatencyMode: false });
        hlsRef.current = hls;
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (destroyed) return;
          const seen = new Map<number, number>();
          hls?.levels.forEach((level: any, index: number) => {
            if (level?.height && !seen.has(level.height)) {
              seen.set(level.height, index);
            }
          });
          setQualityLevels(
            [...seen.entries()]
              .sort((a, b) => b[0] - a[0])
              .map(([height, index]) => ({ index, label: `${height}p` })),
          );
          setActiveLevelIndex(-1);
          setAutoQuality(true);
        });
        hls.on(Hls.Events.LEVEL_SWITCHED, (_event: any, data: any) => {
          if (destroyed) return;
          if (typeof data?.level === "number") {
            setActiveLevelIndex(data.level);
          }
        });
        hls.on(Hls.Events.ERROR, (_event: any, data: any) => {
          if (!data.fatal) return;
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            hls?.startLoad();
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls?.recoverMediaError();
          } else {
            setPlaybackError("Video playback failed. Refresh the page to try again.");
          }
        });
        hls.loadSource(masterUrl);
        hls.attachMedia(video);
      } catch {
        if (!destroyed) {
          setPlaybackError("Could not load the adaptive video player.");
        }
      }
    };

    void setup();

    return () => {
      destroyed = true;
      hlsRef.current = null;
      nativeHlsRef.current = false;
      hls?.destroy();
      hls = null;
    };
  }, [hlsReady, hlsMasterUrl, resolveUrl]);

  const selectQuality = useCallback((index: number) => {
    const hls = hlsRef.current;
    if (!hls) return;
    hls.currentLevel = index;
    setAutoQuality(index === -1);
    setActiveLevelIndex(index);
    setQualityOpen(false);
  }, []);

  const activeQualityLabel =
    autoQuality || activeLevelIndex === -1
      ? "Auto"
      : qualityLevels.find((level) => level.index === activeLevelIndex)?.label ?? "Auto";

  const handleSubmitAnswer = async () => {
    if (!currentQuiz || !selectedAnswer || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await onSubmitAnswer(currentQuiz, selectedAnswer);
      if (result) {
        setQuizResult(result);
        onQuizAnswered(currentQuiz.id);
      } else {
        setSubmitError("We couldn't submit your answer. Check your connection and try again.");
      }
    } catch {
      setSubmitError("We couldn't submit your answer. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleNextQuestion = () => {
    const next = sessionIndex + 1;
    setQuizResult(null);
    setSubmitError(null);
    setSelectedAnswer(null);
    setSessionIndex(next);
    setCurrentQuiz(sessionQuizzes[next] ?? null);
  };

  const handleContinueWatching = () => {
    setCurrentQuiz(null);
    setSelectedAnswer(null);
    setQuizResult(null);
    setSessionQuizzes([]);
    setSessionIndex(0);
    sessionActiveRef.current = false;
    lastCheckTimeRef.current = -1;
    resumePlayback();
  };

  const togglePlay = () => {
    if (isPlaying) {
      pausePlayback();
    } else {
      resumePlayback();
    }
  };

  const seekBackward = useCallback(
    (seconds = 5) => {
      if (sessionActiveRef.current) return;
      const current = getCurrentTime();
      const target = Math.max(0, current - seconds);

      if (isYouTube && playerRef.current?.seekTo) {
        playerRef.current.seekTo(target, true);
      } else if (videoRef.current) {
        videoRef.current.currentTime = target;
      }

      lastCheckTimeRef.current = Math.min(lastCheckTimeRef.current, target);
      setDisplayTime(target);
    },
    [getCurrentTime, isYouTube],
  );

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await containerRef.current.requestFullscreen();
      }
    } catch {
      // fullscreen may be blocked by browser policy
    }
  };

  const resolvedVideoUrl = resolveUrl(videoUrl);
  const resolvedPoster = thumbnailUrl ? resolveUrl(thumbnailUrl) : undefined;

  return (
    <div className="relative">
      {seekWarning ? (
        <div className="absolute left-4 right-4 top-4 z-40 rounded-xl border border-amber-400/30 bg-amber-500/15 px-4 py-2 text-center text-xs font-semibold text-amber-100">
          Forward skipping is locked. Watch each segment to unlock the next part.
        </div>
      ) : null}

      {isUploaded && processingStatus && processingStatus !== "READY" ? (
        <div
          className={cn(
            "absolute left-4 right-4 top-4 z-40 rounded-xl border px-4 py-2 text-center text-xs font-semibold",
            processingStatus === "FAILED"
              ? "border-rose-400/30 bg-rose-500/15 text-rose-100"
              : "border-accent-cyan/30 bg-accent-cyan/15 text-cyan-100",
          )}
          title={processingError ?? undefined}
        >
          {processingStatus === "FAILED"
            ? "Video processing failed — playing the original file."
            : `Processing video for adaptive playback… ${processingProgress ?? 0}%`}
        </div>
      ) : null}

      {playbackError ? (
        <div className="absolute left-4 right-4 top-4 z-40 rounded-xl border border-rose-400/30 bg-rose-500/15 px-4 py-2 text-center text-xs font-semibold text-rose-100">
          {playbackError}
        </div>
      ) : null}

      <div
        ref={containerRef}
        className={cn(
          "relative aspect-video w-full overflow-hidden bg-black",
          // On phones the 16:9 box is too short to hold a question, its options and Submit.
          currentQuiz && "min-h-[34rem] sm:min-h-0",
          isFullscreen && "aspect-auto h-screen w-screen",
        )}
      >
        {isYouTube ? (
          <>
            <div id={playerContainerId} className="h-full w-full" title={title} />
            {/* Block direct interaction with the YouTube iframe (prevents timeline clicks) */}
            <div className="absolute inset-0 z-10" aria-hidden="true" />
          </>
        ) : (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              poster={resolvedPoster}
              className="h-full w-full"
              crossOrigin="anonymous"
              onTimeUpdate={handleTimeUpdate}
              onSeeking={handleSeeking}
              onLoadedMetadata={() => {
                if (videoRef.current?.duration) {
                  setDuration(videoRef.current.duration);
                }
              }}
              onPlay={() => {
                if (sessionActiveRef.current) {
                  videoRef.current?.pause();
                  return;
                }
                setIsPlaying(true);
              }}
              onPause={() => setIsPlaying(false)}
              onWaiting={() => setBuffering(true)}
              onCanPlay={() => setBuffering(false)}
              onPlaying={() => setBuffering(false)}
              onError={() => {
                if (!hlsReady) {
                  setPlaybackError("Video playback failed. Try again later.");
                }
              }}
            >
              {!hlsReady ? (
                <source src={resolvedVideoUrl} type="video/mp4" />
              ) : null}
              Your browser does not support the video tag.
            </video>
            {buffering ? (
              <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
                <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-white" />
              </div>
            ) : null}
          </>
        )}

      {currentQuiz ? (
        <div role="dialog" aria-modal="true" aria-label="Lecture quiz" className="absolute inset-0 z-50 flex overflow-y-auto bg-slate-900/85 p-4">
          <div className="m-auto w-full max-w-2xl rounded-3xl border border-accent-purple/15 bg-ink-900 p-6 shadow-2xl">
            <div className="mb-6 flex items-center gap-2">
              <span
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-bold uppercase tracking-widest",
                  currentQuiz.difficulty === "easy"
                    ? "bg-emerald-500/10 text-emerald-600 ring-1 ring-inset ring-emerald-500/25 backdrop-blur-sm"
                    : currentQuiz.difficulty === "medium"
                      ? "bg-amber-500/10 text-amber-600 ring-1 ring-inset ring-amber-500/25 backdrop-blur-sm"
                      : "bg-rose-500/10 text-rose-600 ring-1 ring-inset ring-rose-500/25 backdrop-blur-sm",
                )}
              >
                {currentQuiz.difficulty}
              </span>
              {sessionQuizzes.length > 1 ? (
                <span className="rounded-full bg-accent-purple/[0.06] px-3 py-1 text-xs font-bold uppercase tracking-widest text-slate-600">
                  Question {sessionIndex + 1} of {sessionQuizzes.length}
                </span>
              ) : null}
              {currentQuiz.segment ? (
                <span className="rounded-full bg-accent-purple/[0.06] px-3 py-1 text-xs font-bold uppercase tracking-widest text-slate-600">
                  {currentQuiz.segment}
                </span>
              ) : null}
              {currentQuiz.timestamp !== undefined ? (
                <span className="rounded-full bg-accent-purple/10 px-3 py-1 text-xs font-bold uppercase tracking-widest text-accent-purple">
                  {formatTime(currentQuiz.timestamp)}
                </span>
              ) : null}
            </div>

            {!quizResult ? (
              <>
                <h4 className="mb-6 text-xl font-bold text-white">{currentQuiz.question}</h4>
                <div className="grid gap-3">
                  {currentQuiz.options.map((option) => (
                    <button
                      key={option}
                      onClick={() => setSelectedAnswer(option)}
                      className={cn(
                        "w-full rounded-2xl border p-4 text-left transition-all",
                        selectedAnswer === option
                          ? "border-accent-purple bg-accent-purple/10 text-white"
                          : "border-accent-purple/15 bg-accent-purple/[0.06] text-slate-600 hover:bg-accent-purple/[0.12]",
                      )}
                    >
                      {option}
                    </button>
                  ))}
                </div>
                {submitError ? (
                  <p role="alert" className="mt-4 text-sm font-medium text-rose-500">
                    {submitError}
                  </p>
                ) : null}
                <Button
                  onClick={handleSubmitAnswer}
                  disabled={!selectedAnswer || submitting}
                  fullWidth
                  size="lg"
                  className="mt-6"
                >
                  {submitting ? "Submitting..." : "Submit Answer"}
                </Button>
              </>
            ) : (
              <>
                <div
                  className={cn(
                    "mb-6 flex items-center gap-3 rounded-2xl p-4",
                    quizResult.passed
                      ? "border border-emerald-500/20 bg-emerald-500/10"
                      : "border border-rose-500/20 bg-rose-500/10",
                  )}
                >
                  {quizResult.passed ? (
                    <Check className="h-8 w-8 text-emerald-600" />
                  ) : (
                    <X className="h-8 w-8 text-rose-600" />
                  )}
                  <div>
                    <h4
                      className={cn(
                        "text-lg font-bold",
                        quizResult.passed ? "text-emerald-600" : "text-rose-600",
                      )}
                    >
                      {quizResult.passed ? "Correct!" : "Not quite right"}
                    </h4>
                    <p className="text-sm text-slate-400">
                      The correct answer is: {quizResult.correctAnswer}
                    </p>
                  </div>
                </div>
                <p className="mb-6 text-slate-600">{quizResult.explanation}</p>
                <Button
                  onClick={
                    sessionIndex < sessionQuizzes.length - 1
                      ? handleNextQuestion
                      : handleContinueWatching
                  }
                  fullWidth
                  size="lg"
                >
                  {sessionIndex < sessionQuizzes.length - 1
                    ? "Next Question"
                    : "Continue Watching"}
                </Button>
              </>
            )}
          </div>
        </div>
      ) : null}

        <GazeMonitor
          active={isActive}
          onPauseRequest={pausePlayback}
          onResumeRequest={resumePlayback}
        />

        <div className="absolute bottom-0 left-0 right-0 z-20 flex items-center gap-2 bg-gradient-to-t from-black/95 via-black/80 to-transparent px-4 pb-4 pt-10 sm:gap-3">
          <button
            type="button"
            onClick={() => seekBackward(5)}
            disabled={isYouTube && !playerReady}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#ffffff]/15 text-[#fff] hover:bg-[#ffffff]/30 disabled:opacity-40"
            aria-label="Rewind 5 seconds"
            title="Rewind 5 seconds"
          >
            <RotateCcw size={18} />
          </button>
          <button
            type="button"
            onClick={togglePlay}
            disabled={isYouTube && !playerReady}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#ffffff]/15 text-[#fff] hover:bg-[#ffffff]/30 disabled:opacity-40"
            aria-label={isPlaying ? "Pause lecture" : "Play lecture"}
          >
            {isPlaying ? <Pause size={18} /> : <Play size={18} />}
          </button>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex items-center justify-between gap-2 text-xs text-slate-200">
              <span className="truncate">
                {formatTime(displayTime)}
                {duration > 0 ? ` / ${formatTime(duration)}` : ""}
              </span>
              <span className="shrink-0 text-amber-400">Forward locked</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[#ffffff]/20">
              <div
                className="h-full rounded-full bg-gradient-to-r from-accent-purple to-accent-cyan"
                style={{
                  width:
                    duration > 0
                      ? `${Math.min(100, (displayTime / duration) * 100)}%`
                      : "0%",
                }}
              />
            </div>
          </div>
          {!isYouTube ? (
            <button
              type="button"
              onClick={() => {
                const speeds = [1, 1.25, 1.5, 2];
                const next =
                  speeds[(speeds.indexOf(playbackRate) + 1) % speeds.length];
                setPlaybackRate(next);
                if (videoRef.current) videoRef.current.playbackRate = next;
              }}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#ffffff]/15 text-xs font-bold text-[#fff] hover:bg-[#ffffff]/30"
              aria-label="Playback speed"
              title={`Playback speed: ${playbackRate}x`}
            >
              {playbackRate}x
            </button>
          ) : null}
          {!isYouTube && hlsReady && qualityLevels.length > 0 ? (
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setQualityOpen((open) => !open)}
                className="flex h-10 items-center gap-1.5 rounded-full bg-[#ffffff]/15 px-3 text-xs font-bold text-[#fff] hover:bg-[#ffffff]/30"
                aria-label="Video quality"
                title={`Video quality: ${activeQualityLabel}`}
              >
                <Settings2 size={16} />
                {activeQualityLabel}
              </button>
              {qualityOpen ? (
                <div className="absolute bottom-full right-0 z-30 mb-2 w-36 overflow-hidden rounded-xl border border-accent-purple/15 bg-ink-900 p-1.5 shadow-soft">
                  <button
                    type="button"
                    onClick={() => selectQuality(-1)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold transition-colors",
                      autoQuality
                        ? "bg-accent-purple/10 text-accent-purple"
                        : "text-slate-600 hover:bg-accent-purple/[0.06]",
                    )}
                  >
                    Auto
                    {autoQuality ? <Check size={14} /> : null}
                  </button>
                  {qualityLevels.map((level) => (
                    <button
                      key={level.index}
                      type="button"
                      onClick={() => selectQuality(level.index)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold transition-colors",
                        !autoQuality && activeLevelIndex === level.index
                          ? "bg-accent-purple/10 text-accent-purple"
                          : "text-slate-600 hover:bg-accent-purple/[0.06]",
                      )}
                    >
                      {level.label}
                      {!autoQuality && activeLevelIndex === level.index ? (
                        <Check size={14} />
                      ) : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          <button
            type="button"
            onClick={toggleFullscreen}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#ffffff]/15 text-[#fff] hover:bg-[#ffffff]/30"
            aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
          </button>
        </div>
      </div>

      {sortedQuizzes.length > 0 ? (
        <div className="border-t border-accent-purple/10 p-4">
          <h5 className="mb-3 text-sm font-bold text-white">Quiz Checkpoints</h5>
          <div className="flex flex-wrap gap-2">
            {Array.from(
              new Map(
                sortedQuizzes.map((quiz) => [
                  `${quiz.segment ?? "checkpoint"}|${quiz.timestamp ?? 0}`,
                  quiz,
                ]),
              ).values(),
            ).map((quiz) => {
              const segmentQuizzes = sortedQuizzes.filter(
                (item) =>
                  (item.segment ?? "checkpoint") === (quiz.segment ?? "checkpoint") &&
                  (item.timestamp ?? 0) === (quiz.timestamp ?? 0),
              );
              const answered = segmentQuizzes.filter((item) =>
                answeredQuizIds.has(item.id),
              ).length;
              return (
                <div
                  key={`${quiz.segment ?? "checkpoint"}|${quiz.timestamp ?? 0}`}
                  className={cn(
                    "flex items-center gap-2 rounded-xl border px-3 py-2 text-xs",
                    answered === segmentQuizzes.length
                      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 ring-1 ring-inset ring-emerald-500/25 backdrop-blur-sm"
                      : "border-accent-purple/15 bg-accent-purple/[0.06] text-slate-400",
                  )}
                >
                  <FileQuestion size={12} />
                  {quiz.segment || formatTime(quiz.timestamp || 0)}
                  <span className="text-accent-purple">
                    {formatTime(quiz.timestamp || 0)}
                  </span>
                  <span className="uppercase">
                    {segmentQuizzes.length} question{segmentQuizzes.length > 1 ? "s" : ""}
                  </span>
                  {answered === segmentQuizzes.length ? <Check size={12} /> : null}
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Forward seeking is locked. Video pauses at each checkpoint and
            resumes once you answer; questions at the same level that you have
            already reached are asked together.
          </p>
        </div>
      ) : null}
    </div>
  );
}
