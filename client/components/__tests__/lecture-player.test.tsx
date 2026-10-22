import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { LecturePlayer, type LectureQuiz } from "../lecture-player";

let gazeProps: {
  onPauseRequest?: () => void;
  onResumeRequest?: () => void;
  onUnavailable?: () => void;
} = {};
vi.mock("@/components/student/gaze-monitor", () => ({
  GazeMonitor: (props: typeof gazeProps) => {
    gazeProps = props;
    return null;
  },
}));

const quiz: LectureQuiz = {
  id: "q1",
  question: "What is 2 + 2?",
  options: ["3", "4"],
  correctAnswer: "4",
  difficulty: "easy",
  timestamp: 10,
};

function setup(
  overrides: Partial<ComponentProps<typeof LecturePlayer>> = {},
  { faceDetected = true }: { faceDetected?: boolean } = {},
) {
  const onSubmitAnswer = vi.fn().mockResolvedValue({
    passed: true,
    correctAnswer: "4",
    explanation: "Basic arithmetic",
  });
  const onQuizAnswered = vi.fn();
  const utils = render(
    <LecturePlayer
      title="Lecture"
      videoUrl="https://example.com/video.mp4"
      apiBaseUrl="http://localhost:4010"
      quizzes={[quiz]}
      answeredQuizIds={new Set()}
      onQuizAnswered={onQuizAnswered}
      onSubmitAnswer={onSubmitAnswer}
      {...overrides}
    />,
  );
  const video = utils.container.querySelector("video") as HTMLVideoElement;
  let currentTime = 0;
  let paused = false;
  Object.defineProperty(video, "currentTime", {
    configurable: true,
    get: () => currentTime,
    set: (value: number) => {
      currentTime = value;
    },
  });
  Object.defineProperty(video, "paused", { configurable: true, get: () => paused });
  (video.pause as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => {
    paused = true;
  });
  (video.play as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => {
    paused = false;
    return Promise.resolve();
  });
  // Playback is blocked until the gaze monitor sees the student, as it does once the camera starts.
  if (faceDetected) act(() => gazeProps.onResumeRequest?.());
  /** Plays forward one second at a time, like real playback, so the seek lock stays quiet. */
  const playUntil = (seconds: number) => {
    for (let t = Math.floor(currentTime) + 1; t <= seconds; t++) {
      currentTime = t;
      fireEvent.timeUpdate(video);
    }
  };
  return { ...utils, video, playUntil, onSubmitAnswer, onQuizAnswered };
}

describe("LecturePlayer quiz checkpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    gazeProps = {};
  });

  it("pauses the video and shows the quiz at the checkpoint", () => {
    const { video, playUntil } = setup();
    playUntil(9);
    expect(screen.queryByRole("dialog", { name: "Lecture quiz" })).toBeNull();

    playUntil(10);
    expect(screen.getByRole("dialog", { name: "Lecture quiz" })).toBeInTheDocument();
    expect(screen.getByText("What is 2 + 2?")).toBeInTheDocument();
    expect(video.pause).toHaveBeenCalled();
  });

  it("renders the quiz inside the fullscreen element so it is visible in fullscreen", () => {
    const { video, playUntil } = setup();
    playUntil(10);
    const dialog = screen.getByRole("dialog", { name: "Lecture quiz" });
    expect(video.parentElement?.contains(dialog)).toBe(true);
  });

  it("keeps the video paused while the quiz is open, however playback is restarted", () => {
    const { video, playUntil } = setup();
    playUntil(10);
    (video.play as unknown as ReturnType<typeof vi.fn>).mockClear();

    // Play button
    fireEvent.click(screen.getByRole("button", { name: "Play lecture" }));
    // Gaze monitor deciding the student is looking again
    act(() => gazeProps.onResumeRequest?.());
    expect(video.play).not.toHaveBeenCalled();

    // Browser/autoplay starting playback by itself
    fireEvent.play(video);
    expect(video.paused).toBe(true);
  });

  it("blocks rewinding while the quiz is open", () => {
    const { video, playUntil } = setup();
    playUntil(10);
    fireEvent.click(screen.getByRole("button", { name: "Rewind 5 seconds" }));
    expect(video.currentTime).toBe(10);
  });

  it("does not let the student continue without answering", () => {
    const { playUntil } = setup();
    playUntil(10);
    expect(screen.getByRole("button", { name: "Submit Answer" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Continue Watching" })).toBeNull();
  });

  it("shows an error and lets the student retry when submitting fails", async () => {
    const { playUntil, onSubmitAnswer, onQuizAnswered } = setup();
    onSubmitAnswer.mockResolvedValueOnce(null);
    playUntil(10);

    fireEvent.click(screen.getByRole("button", { name: "4" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit Answer" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't submit/i);
    expect(onQuizAnswered).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Submit Answer" }));
    expect(await screen.findByText("Correct!")).toBeInTheDocument();
    expect(onQuizAnswered).toHaveBeenCalledWith("q1");
  });

  it("resumes playback only after the quiz has been answered", async () => {
    const { video, playUntil } = setup();
    playUntil(10);
    fireEvent.click(screen.getByRole("button", { name: "4" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit Answer" }));
    const continueButton = await screen.findByRole("button", { name: "Continue Watching" });
    (video.play as unknown as ReturnType<typeof vi.fn>).mockClear();

    fireEvent.click(continueButton);
    await waitFor(() => expect(video.play).toHaveBeenCalled());
    expect(screen.queryByRole("dialog", { name: "Lecture quiz" })).toBeNull();
  });

  it("triggers a quiz placed at the very start of the lecture", () => {
    const { playUntil } = setup({ quizzes: [{ ...quiz, id: "q0", timestamp: 0 }] });
    playUntil(1);
    expect(screen.getByRole("dialog", { name: "Lecture quiz" })).toBeInTheDocument();
  });

  it("only asks questions the student has already reached", async () => {
    const later: LectureQuiz = { ...quiz, id: "q2", question: "Later question?", timestamp: 25 };
    const { playUntil } = setup({ quizzes: [quiz, later] });
    playUntil(10);
    expect(screen.getByText("What is 2 + 2?")).toBeInTheDocument();
    expect(screen.queryByText(/Question 1 of/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "4" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit Answer" }));
    fireEvent.click(await screen.findByRole("button", { name: "Continue Watching" }));
    expect(screen.queryByText("Later question?")).toBeNull();
  });

  it("does not mistake a stalled page catching up for skipping ahead", () => {
    const { video } = setup({ quizzes: [] });
    const now = vi.spyOn(performance, "now");
    now.mockReturnValue(1_000);
    (video as any).currentTime = 0.5;
    fireEvent.timeUpdate(video);

    // The page froze for 3 seconds and playback kept going underneath it.
    now.mockReturnValue(4_000);
    (video as any).currentTime = 3.5;
    fireEvent.timeUpdate(video);

    expect(screen.queryByText(/Forward skipping is locked/)).toBeNull();
    expect(video.pause).not.toHaveBeenCalled();
    now.mockRestore();
  });

  it("still blocks a genuine jump forward", () => {
    const { video } = setup({ quizzes: [] });
    const now = vi.spyOn(performance, "now");
    now.mockReturnValue(1_000);
    (video as any).currentTime = 0.5;
    fireEvent.timeUpdate(video);

    now.mockReturnValue(1_250);
    (video as any).currentTime = 30;
    fireEvent.timeUpdate(video);

    expect(screen.getByText(/Forward skipping is locked/)).toBeInTheDocument();
    expect(video.currentTime).toBeLessThan(5);
    now.mockRestore();
  });

  it("does not ask a quiz that was already answered", () => {
    const { playUntil } = setup({ answeredQuizIds: new Set(["q1"]) });
    playUntil(12);
    expect(screen.queryByRole("dialog", { name: "Lecture quiz" })).toBeNull();
  });
});

describe("LecturePlayer adaptive learning", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    gazeProps = {};
  });

  it("presents the checkpoint quiz as recommended, without technical details", () => {
    const { playUntil } = setup({ adaptiveLevel: "medium" });
    playUntil(10);
    expect(screen.getByText("Recommended for You")).toBeInTheDocument();
    expect(
      screen.getByText("Based on your recent performance, this quiz is suitable for your current level."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/base difficulty|adaptive difficulty|threshold|algorithm/i)).toBeNull();
  });

  it.each([
    ["easy", "Review the topic and practice again to improve your score."],
    ["medium", "Keep practicing to unlock harder quizzes."],
    ["hard", "Great progress! You are ready for more challenging questions."],
  ] as const)("shows the %s level and its advice after the checkpoint", async (level, advice) => {
    const { playUntil } = setup({ adaptiveLevel: level });
    playUntil(10);
    fireEvent.click(screen.getByRole("button", { name: "4" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit Answer" }));
    expect(await screen.findByText("Your current level:")).toBeInTheDocument();
    expect(screen.getByText(level[0].toUpperCase() + level.slice(1))).toBeInTheDocument();
    expect(screen.getByText(advice)).toBeInTheDocument();
  });

  it("shows no adaptive messages when the level is unknown", async () => {
    const { playUntil } = setup();
    playUntil(10);
    expect(screen.queryByText("Recommended for You")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "4" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit Answer" }));
    await screen.findByRole("button", { name: "Continue Watching" });
    expect(screen.queryByText("Your current level:")).toBeNull();
  });
});

describe("LecturePlayer gaze monitoring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    gazeProps = {};
  });

  it("pauses a playing video when the student looks away and resumes when they look back", () => {
    // The lecture auto-started when the student's face was detected.
    const { video, playUntil } = setup();
    expect(video.paused).toBe(false);
    playUntil(3);

    act(() => gazeProps.onPauseRequest?.());
    expect(video.paused).toBe(true);

    act(() => gazeProps.onResumeRequest?.());
    expect(video.paused).toBe(false);
  });

  it("does not let the student start playback while looking away", () => {
    const { video } = setup();
    act(() => gazeProps.onPauseRequest?.());
    (video.play as unknown as ReturnType<typeof vi.fn>).mockClear();

    fireEvent.click(screen.getByRole("button", { name: "Play lecture" }));
    expect(video.play).not.toHaveBeenCalled();
    expect(screen.getByText("Face the screen to play the lecture.")).toBeInTheDocument();

    // Playback started some other way is stopped again.
    fireEvent.play(video);
    expect(video.paused).toBe(true);
  });

  it("waits for the student's face before starting, then starts the lecture automatically", () => {
    const { video } = setup({}, { faceDetected: false });

    // Autoplay before a face is detected is stopped.
    fireEvent.play(video);
    expect(video.paused).toBe(true);
    expect(video.play).not.toHaveBeenCalled();

    act(() => gazeProps.onPauseRequest?.());
    act(() => gazeProps.onResumeRequest?.());
    expect(video.play).toHaveBeenCalledTimes(1);
    expect(video.paused).toBe(false);
  });

  it("does not restart a lecture the student paused themselves when they look back", () => {
    const { video } = setup();
    fireEvent.play(video);
    fireEvent.click(screen.getByRole("button", { name: "Pause lecture" }));
    (video.play as unknown as ReturnType<typeof vi.fn>).mockClear();

    act(() => gazeProps.onPauseRequest?.());
    act(() => gazeProps.onResumeRequest?.());
    expect(video.play).not.toHaveBeenCalled();
  });

  it("stops blocking and starts the lecture when monitoring becomes unavailable", () => {
    const { video } = setup({}, { faceDetected: false });
    act(() => gazeProps.onPauseRequest?.());
    act(() => gazeProps.onUnavailable?.());

    expect(video.play).toHaveBeenCalled();
    expect(video.paused).toBe(false);
  });

  it("does not re-block playback when switching between a YouTube and an uploaded lecture", () => {
    const { rerender, container } = setup();
    const props = {
      title: "Lecture",
      apiBaseUrl: "http://localhost:4010",
      quizzes: [quiz],
      answeredQuizIds: new Set<string>(),
      onQuizAnswered: vi.fn(),
      onSubmitAnswer: vi.fn(),
    };
    // The monitor stays focused throughout, so it never reports the face again.
    rerender(<LecturePlayer {...props} videoUrl="https://www.youtube.com/watch?v=dQw4w9WgXcQ" />);
    rerender(<LecturePlayer {...props} videoUrl="https://example.com/other.mp4" />);

    const video = container.querySelector("video") as HTMLVideoElement;
    (video.pause as unknown as ReturnType<typeof vi.fn>).mockClear();
    fireEvent.play(video);
    expect(video.pause).not.toHaveBeenCalled();
    expect(screen.queryByText(/face the screen/i)).toBeNull();
  });
});
