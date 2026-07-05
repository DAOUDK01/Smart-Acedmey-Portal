"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, FileQuestion, Maximize, Minimize, Pause, Play, RotateCcw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

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
  quizzes: LectureQuiz[];
  answeredQuizIds: Set<string>;
  onQuizAnswered: (quizId: string) => void;
  onSubmitAnswer: (
    quiz: LectureQuiz,
    answer: string,
  ) => Promise<{ passed: boolean; correctAnswer: string; explanation: string } | null>;
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
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve();
    };

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
  quizzes,
  answeredQuizIds,
  onQuizAnswered,
  onSubmitAnswer,
}: LecturePlayerProps) {
  const reactId = useId().replace(/:/g, "");
  const youtubeId = getYouTubeId(videoUrl);
  const isYouTube = Boolean(youtubeId);
  const playerContainerId = `yt-player-${reactId}`;

  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const maxWatchedRef = useRef(0);
  const lastCheckTimeRef = useRef(0);
  const quizzesRef = useRef(quizzes);
  const answeredRef = useRef(answeredQuizIds);
  const currentQuizRef = useRef<LectureQuiz | null>(null);

  const [playerReady, setPlayerReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [displayTime, setDisplayTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [seekWarning, setSeekWarning] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentQuiz, setCurrentQuiz] = useState<LectureQuiz | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
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

      // Jumped forward more than normal playback allows between polls
      if (currentTime > allowed + 1.25) {
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
      quizzesRef.current.forEach((quiz) => {
        if (
          quiz.timestamp !== undefined &&
          quiz.timestamp <= currentTime &&
          quiz.timestamp > lastCheckTimeRef.current &&
          !answeredRef.current.has(quiz.id) &&
          !currentQuizRef.current
        ) {
          pausePlayback();
          setCurrentQuiz(quiz);
        }
      });
      lastCheckTimeRef.current = currentTime;
    },
    [pausePlayback],
  );

  const tickPlayback = useCallback(() => {
    const currentTime = enforceProgressLock(getCurrentTime());
    checkQuizTriggers(currentTime);

    if (isYouTube && playerRef.current?.getDuration) {
      const total = playerRef.current.getDuration();
      if (total && Number.isFinite(total)) {
        setDuration(total);
      }
      const state = playerRef.current.getPlayerState?.();
      setIsPlaying(state === window.YT?.PlayerState.PLAYING);
    } else if (videoRef.current?.duration && Number.isFinite(videoRef.current.duration)) {
      setDuration(videoRef.current.duration);
    }
  }, [checkQuizTriggers, enforceProgressLock, getCurrentTime, isYouTube]);

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
    lastCheckTimeRef.current = 0;
    setCurrentQuiz(null);
    setSelectedAnswer(null);
    setQuizResult(null);
    setDisplayTime(0);
    setDuration(0);
    setPlayerReady(false);
    setIsFullscreen(false);
  }, [videoUrl]);

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
            setIsPlaying(true);
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
      try {
        playerRef.current?.destroy?.();
      } catch {
        // player may already be gone
      }
      playerRef.current = null;
    };
  }, [isYouTube, youtubeId, playerContainerId, tickPlayback]);

  const handleSubmitAnswer = async () => {
    if (!currentQuiz || !selectedAnswer) return;
    const result = await onSubmitAnswer(currentQuiz, selectedAnswer);
    if (result) {
      setQuizResult(result);
      onQuizAnswered(currentQuiz.id);
    }
  };

  const handleContinueWatching = () => {
    setCurrentQuiz(null);
    setSelectedAnswer(null);
    setQuizResult(null);
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

  const resolvedVideoUrl = videoUrl.startsWith("http")
    ? videoUrl
    : `${apiBaseUrl}${videoUrl}`;

  return (
    <div className="relative">
      {seekWarning ? (
        <div className="absolute left-4 right-4 top-4 z-40 rounded-xl border border-amber-400/30 bg-amber-500/15 px-4 py-2 text-center text-xs font-semibold text-amber-100">
          Forward skipping is locked. Watch each segment to unlock the next part.
        </div>
      ) : null}

      {currentQuiz ? (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-ink-950/95 p-4">
          <div className="w-full max-w-2xl rounded-3xl border border-white/10 bg-ink-900 p-6 shadow-2xl">
            <div className="mb-6 flex items-center gap-2">
              <span
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-bold uppercase tracking-widest",
                  currentQuiz.difficulty === "easy"
                    ? "bg-emerald-500/10 text-emerald-300"
                    : currentQuiz.difficulty === "medium"
                      ? "bg-amber-500/10 text-amber-300"
                      : "bg-rose-500/10 text-rose-300",
                )}
              >
                {currentQuiz.difficulty}
              </span>
              {currentQuiz.segment ? (
                <span className="rounded-full bg-white/5 px-3 py-1 text-xs font-bold uppercase tracking-widest text-slate-300">
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
                          : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10",
                      )}
                    >
                      {option}
                    </button>
                  ))}
                </div>
                <Button
                  onClick={handleSubmitAnswer}
                  disabled={!selectedAnswer}
                  fullWidth
                  size="lg"
                  className="mt-6"
                >
                  Submit Answer
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
                    <Check className="h-8 w-8 text-emerald-400" />
                  ) : (
                    <X className="h-8 w-8 text-rose-400" />
                  )}
                  <div>
                    <h4
                      className={cn(
                        "text-lg font-bold",
                        quizResult.passed ? "text-emerald-300" : "text-rose-300",
                      )}
                    >
                      {quizResult.passed ? "Correct!" : "Not quite right"}
                    </h4>
                    <p className="text-sm text-slate-400">
                      The correct answer is: {quizResult.correctAnswer}
                    </p>
                  </div>
                </div>
                <p className="mb-6 text-slate-300">{quizResult.explanation}</p>
                <Button onClick={handleContinueWatching} fullWidth size="lg">
                  Continue Watching
                </Button>
              </>
            )}
          </div>
        </div>
      ) : null}

      <div
        ref={containerRef}
        className={cn(
          "relative aspect-video w-full overflow-hidden bg-black",
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
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className="h-full w-full"
            crossOrigin="anonymous"
            onTimeUpdate={handleTimeUpdate}
            onSeeking={handleSeeking}
            onLoadedMetadata={() => {
              if (videoRef.current?.duration) {
                setDuration(videoRef.current.duration);
              }
            }}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
          >
            <source src={resolvedVideoUrl} type="video/mp4" />
            Your browser does not support the video tag.
          </video>
        )}

        <div className="absolute bottom-0 left-0 right-0 z-20 flex items-center gap-2 bg-gradient-to-t from-black/95 via-black/80 to-transparent px-4 pb-4 pt-10 sm:gap-3">
          <button
            type="button"
            onClick={() => seekBackward(5)}
            disabled={isYouTube && !playerReady}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-40"
            aria-label="Rewind 5 seconds"
            title="Rewind 5 seconds"
          >
            <RotateCcw size={18} />
          </button>
          <button
            type="button"
            onClick={togglePlay}
            disabled={isYouTube && !playerReady}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-40"
            aria-label={isPlaying ? "Pause lecture" : "Play lecture"}
          >
            {isPlaying ? <Pause size={18} /> : <Play size={18} />}
          </button>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex items-center justify-between gap-2 text-xs text-slate-300">
              <span className="truncate">
                {formatTime(displayTime)}
                {duration > 0 ? ` / ${formatTime(duration)}` : ""}
              </span>
              <span className="shrink-0 text-amber-300">Forward locked</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
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
          <button
            type="button"
            onClick={toggleFullscreen}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
            aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
          </button>
        </div>
      </div>

      {sortedQuizzes.length > 0 ? (
        <div className="border-t border-white/5 p-4">
          <h5 className="mb-3 text-sm font-bold text-white">Quiz Checkpoints</h5>
          <div className="flex flex-wrap gap-2">
            {sortedQuizzes.map((quiz) => (
              <div
                key={quiz.id}
                className={cn(
                  "flex items-center gap-2 rounded-xl border px-3 py-2 text-xs",
                  answeredQuizIds.has(quiz.id)
                    ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                    : "border-white/10 bg-white/5 text-slate-400",
                )}
              >
                <FileQuestion size={12} />
                {quiz.segment || formatTime(quiz.timestamp || 0)}
                <span className="uppercase">{quiz.difficulty}</span>
                {answeredQuizIds.has(quiz.id) ? <Check size={12} /> : null}
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Forward seeking is locked. Quizzes appear automatically at each segment checkpoint.
          </p>
        </div>
      ) : null}
    </div>
  );
}
