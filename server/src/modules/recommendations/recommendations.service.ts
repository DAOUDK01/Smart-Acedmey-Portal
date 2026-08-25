import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma.service";
import {
  LectureSummary,
  MlPrediction,
  RawFeatures,
  RecommendationResult,
} from "./recommendations.types";

const ACTIVITY_TYPE = "resource";
const MAX_ALTERNATIVES = 5;
const DEFAULT_ML_SERVICE_URL = "http://127.0.0.1:8005";
const DEFAULT_ML_TIMEOUT_MS = 5000;
const MS_PER_DAY = 86_400_000;
const SUMMARY_MAX_CHARS = 260;

@Injectable()
export class RecommendationsService {
  private readonly logger = new Logger(RecommendationsService.name);
  private rebuildPromise: Promise<void> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  private get mlServiceUrl(): string {
    return (
      process.env.ML_SERVICE_URL?.trim().replace(/\/$/, "") ??
      DEFAULT_ML_SERVICE_URL
    );
  }

  private get mlTimeoutMs(): number {
    return Number(process.env.ML_SERVICE_TIMEOUT_MS ?? DEFAULT_ML_TIMEOUT_MS);
  }

  async recordInteraction(
    studentId: string,
    lectureId: string,
    watchPercent?: number | null,
  ) {
    const lecture = await this.prisma.lecture.findUnique({
      where: { id: lectureId },
    });
    if (!lecture) {
      throw new NotFoundException("Lecture not found");
    }
    await this.prisma.studentInteraction.create({
      data: {
        studentId,
        lectureId,
        clickCount: 1,
        interactionDate: new Date(),
        watchPercent:
          watchPercent !== undefined && watchPercent !== null
            ? Math.max(0, Math.min(100, watchPercent))
            : null,
      },
    });
  }

  async getRecommendationForUser(
    studentId: string,
    resourceId: string,
  ): Promise<RecommendationResult> {
    const features = await this.computeFeatures(studentId, resourceId);
    const prediction = await this.predict(features);
    return this.buildRecommendation(
      studentId,
      resourceId,
      features,
      prediction,
    );
  }

  async currentResourceFor(studentId: string): Promise<string | null> {
    const latest = await this.prisma.studentInteraction.findFirst({
      where: { studentId },
      orderBy: { interactionDate: "desc" },
      select: { lectureId: true },
    });
    if (latest?.lectureId) return latest.lectureId;

    // StudentProgress.studentId has historically held the student's email
    // (seed) while JWT carries the user id, so match by either.
    const user = await this.prisma.user.findUnique({
      where: { id: studentId },
      select: { email: true },
    });
    const progress = await this.prisma.studentProgress.findFirst({
      where: {
        studentId: user?.email
          ? { in: [studentId, user.email] }
          : studentId,
      },
      select: { currentCourseId: true, currentLectureId: true },
    });
    if (progress?.currentLectureId) return progress.currentLectureId;

    // Fallback for fresh students: first lecture of their enrolled courses
    // (from the approved admission's selectedCourseIds, then from progress).
    let courseIds: string[] = [];
    if (user?.email) {
      const admission = await this.prisma.studentAdmission.findFirst({
        where: { email: user.email, status: "APPROVED" },
        select: { selectedCourseIds: true },
      });
      if (Array.isArray(admission?.selectedCourseIds)) {
        courseIds = admission.selectedCourseIds.filter(
          (id): id is string => typeof id === "string",
        );
      }
    }
    if (courseIds.length === 0 && progress?.currentCourseId) {
      courseIds = [progress.currentCourseId];
    }

    for (const courseId of courseIds) {
      const first = await this.prisma.lecture.findFirst({
        where: { courseId },
        orderBy: { lectureOrder: "asc" },
        select: { id: true },
      });
      if (first) return first.id;
    }

    return null;
  }

  async rebuildTransitions(): Promise<void> {
    const interactions = await this.prisma.studentInteraction.findMany({
      orderBy: [{ studentId: "asc" }, { interactionDate: "asc" }],
      select: { studentId: true, lectureId: true },
    });

    // Notebook GROUP 36 / 51: sort by student + date, groupby student shift(-1)
    // and count (resource, next_resource) transition pairs.
    const counts = new Map<string, number>();
    for (let i = 0; i < interactions.length; i++) {
      const current = interactions[i];
      const next = interactions[i + 1];
      if (next && next.studentId === current.studentId) {
        const key = `${current.lectureId}|${next.lectureId}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.resourceTransition.deleteMany({});
      if (counts.size > 0) {
        await tx.resourceTransition.createMany({
          data: [...counts.entries()].map(([key, count]) => {
            const [resourceId, nextResourceId] = key.split("|");
            return { resourceId, nextResourceId, count };
          }),
        });
      }
    });
  }

  private async computeFeatures(
    studentId: string,
    lectureId: string,
  ): Promise<RawFeatures> {
    const now = new Date();

    // click_count: total clicks the student made on the current resource
    // (notebook sum_click aggregated for the interaction).
    const clickAggregate = await this.prisma.studentInteraction.aggregate({
      where: { studentId, lectureId },
      _sum: { clickCount: true },
    });
    const clickCount = clickAggregate._sum.clickCount ?? 0;

    // repeated_interaction: was the student's immediately previous
    // interaction on the same resource?
    const recent = await this.prisma.studentInteraction.findMany({
      where: { studentId },
      orderBy: { interactionDate: "desc" },
      take: 2,
      select: { lectureId: true },
    });
    const previous = recent[1];
    const repeatedInteraction =
      previous && previous.lectureId === lectureId ? 1 : 0;

    // Quiz scores: latest, previous and change. QuizAttempt.studentId has
    // historically held the student's email, so match by id or email and
    // default to 0 when missing (notebook fillna(0)).
    const user = await this.prisma.user.findUnique({
      where: { id: studentId },
      select: { email: true },
    });
    const attempts = await this.prisma.quizAttempt.findMany({
      where: { studentId: { in: user ? [studentId, user.email] : [studentId] } },
      orderBy: { submittedAt: "desc" },
      take: 2,
      select: { score: true },
    });
    const latestQuizScore = attempts[0]?.score ?? 0;
    const previousQuizScore = attempts[1]?.score ?? 0;
    const scoreChange = latestQuizScore - previousQuizScore;

    // interaction_week: notebook computes interaction_date // 7 where the
    // date is days since the module presentation started. We use days since
    // the course started (falling back to the lecture creation date, then to
    // the Unix epoch).
    const lecture = await this.prisma.lecture.findUnique({
      where: { id: lectureId },
      select: { courseId: true, createdAt: true },
    });
    let origin: number;
    if (lecture) {
      const course = await this.prisma.course.findUnique({
        where: { id: lecture.courseId },
        select: { createdAt: true },
      });
      origin = (course?.createdAt ?? lecture.createdAt).getTime();
    } else {
      origin = 0;
    }
    const daysSinceStart = Math.floor(
      (now.getTime() - origin) / MS_PER_DAY,
    );
    const interactionWeek = Math.max(0, Math.floor(daysSinceStart / 7));

    return {
      click_count: clickCount,
      repeated_interaction: repeatedInteraction,
      latest_quiz_score: latestQuizScore,
      previous_quiz_score: previousQuizScore,
      score_change: scoreChange,
      interaction_week: interactionWeek,
      activity_type: ACTIVITY_TYPE,
    };
  }

  private async predict(features: RawFeatures): Promise<MlPrediction> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.mlTimeoutMs);
    try {
      const response = await fetch(`${this.mlServiceUrl}/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(features),
        signal: controller.signal,
      });

      if (!response.ok) {
        const detail = (await response.text()).slice(0, 300);
        throw new ServiceUnavailableException(
          `Recommendation ML service error (${response.status}): ${detail}`,
        );
      }

      return (await response.json()) as MlPrediction;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }
      this.logger.warn(
        `Recommendation ML service is unavailable, using transition fallback: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
      return {
        recommendation: "NEXT_VIDEO",
        rewatch_probability: 0,
        prediction: 0,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Returns a human-readable reason when the student is struggling with this
   * lecture: they failed its checkpoint quizzes (average score below 50) or
   * they quit the video before finishing it (latest watch progress below
   * 80%). Returns null when the student is fine. QuizAttempt.studentId and
   * StudentInteraction.studentId may hold either the user id or the student
   * email (seed), so match by either.
   */
  private async struggleReasonForLecture(
    studentId: string,
    lectureId: string,
  ): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: studentId },
      select: { email: true },
    });
    const ids = user?.email ? [studentId, user.email] : [studentId];

    const attempts = await this.prisma.quizAttempt.findMany({
      where: {
        studentId: { in: ids },
        quiz: { lectureId },
      },
      select: { score: true },
    });
    if (attempts.length > 0) {
      const average =
        attempts.reduce((sum, attempt) => sum + attempt.score, 0) /
        attempts.length;
      if (average < 50) {
        return `You scored ${Math.round(average)}% on this lecture's quiz — rewatching will strengthen your understanding.`;
      }
    }

    const latest = await this.prisma.studentInteraction.findFirst({
      where: {
        studentId: { in: ids },
        lectureId,
        watchPercent: { not: null },
      },
      orderBy: { interactionDate: "desc" },
      select: { watchPercent: true },
    });
    if (latest?.watchPercent != null && latest.watchPercent < 80) {
      return "You left this lecture before it finished — rewatch it to complete your understanding.";
    }

    return null;
  }

  private async isStrugglingOnLecture(
    studentId: string,
    lectureId: string,
  ): Promise<boolean> {
    return (await this.struggleReasonForLecture(studentId, lectureId)) !== null;
  }

  private async buildRecommendation(
    studentId: string,
    resourceId: string,
    features: RawFeatures,
    prediction: MlPrediction,
  ): Promise<RecommendationResult> {
    const base: RecommendationResult = {
      userId: studentId,
      currentResource: resourceId,
      recommendation: prediction.recommendation,
      rewatchProbability: prediction.rewatch_probability,
      recommendedResource: null,
      recommendedLecture: null,
      alternatives: [],
      alternativeLectures: [],
    };

    // Lectures the student has already watched (notebook GROUP 45/47:
    // "Remove resources already watched").
    const watchedRows = await this.prisma.studentInteraction.findMany({
      where: { studentId },
      select: { lectureId: true },
    });
    const watched = new Set(watchedRows.map((row) => row.lectureId));

    // Notebook GROUP 58 - REWATCH requires real struggle evidence: a failed
    // quiz on this lecture or quitting the video before it finished. The ML
    // model's rewatch signal alone is not enough (it is noisy on small
    // datasets), and neither is still being on the lecture — otherwise every
    // lecture would surface "rewatch".
    const struggleReason = await this.struggleReasonForLecture(
      studentId,
      resourceId,
    );
    if (struggleReason) {
      return {
        ...base,
        recommendation: "REWATCH",
        rewatchProbability: prediction.rewatch_probability,
        recommendedResource: resourceId,
        recommendedLecture: await this.findLectureSummary(resourceId),
        rewatchReason: struggleReason,
      };
    }

    if (prediction.recommendation === "REWATCH") {
      prediction = {
        ...prediction,
        recommendation: "NEXT_VIDEO",
        rewatch_probability: 0,
        prediction: 0,
      };
    }

    // Notebook GROUP 58 - NEXT_VIDEO: rank historical transitions, excluding
    // self-transitions and already-watched lectures, by frequency.
    await this.ensureTransitionsFresh();

    const transitions = await this.prisma.resourceTransition.findMany({
      where: {
        resourceId,
        nextResourceId: { notIn: [...watched, resourceId] },
      },
      orderBy: { count: "desc" },
      take: MAX_ALTERNATIVES,
    });

    // Candidate chain. Candidates stay relevant to the current lecture for as
    // long as possible: historical transitions from it, then the next lectures
    // in the same course (first unwatched, then any so every lecture has a
    // course-sequenced "next"), then other courses, and finally the most
    // popular lectures so a "next video" is always surfaced (e.g. when every
    // lecture is completed).
    const lecture = await this.prisma.lecture.findUnique({
      where: { id: resourceId },
      select: { courseId: true, lectureOrder: true },
    });

    const existingIds = new Set(
      (
        await this.prisma.lecture.findMany({
          select: { id: true },
        })
      ).map((l) => l.id),
    );

    const levels: { ids: string[]; excludeWatched: boolean }[] = [
      {
        ids: transitions.map((t) => t.nextResourceId),
        excludeWatched: true,
      },
    ];

    if (lecture?.courseId) {
      const nextInCourse = await this.prisma.lecture.findMany({
        where: {
          courseId: lecture.courseId,
          lectureOrder: { gt: lecture.lectureOrder ?? 0 },
          id: { notIn: [...watched, resourceId] },
        },
        orderBy: { lectureOrder: "asc" },
        take: MAX_ALTERNATIVES,
        select: { id: true },
      });
      levels.push({ ids: nextInCourse.map((l) => l.id), excludeWatched: true });

      const nextInCourseAny = await this.prisma.lecture.findMany({
        where: {
          courseId: lecture.courseId,
          lectureOrder: { gt: lecture.lectureOrder ?? 0 },
          id: { not: resourceId },
        },
        orderBy: { lectureOrder: "asc" },
        take: MAX_ALTERNATIVES,
        select: { id: true },
      });
      levels.push({
        ids: nextInCourseAny.map((l) => l.id),
        excludeWatched: false,
      });

      const otherCourses = await this.prisma.lecture.findMany({
        where: {
          courseId: { not: lecture.courseId },
          id: { not: resourceId },
        },
        orderBy: { lectureOrder: "asc" },
        take: MAX_ALTERNATIVES,
        select: { id: true },
      });
      levels.push({ ids: otherCourses.map((l) => l.id), excludeWatched: false });
    }

    // Last resort: the most popular lectures overall. This may include
    // already-watched lectures so a "next video" is always surfaced instead
    // of an empty recommendation.
    const popular = await this.prisma.studentInteraction.groupBy({
      by: ["lectureId"],
      _count: { _all: true },
      where: { lectureId: { not: resourceId } },
      orderBy: { _count: { lectureId: "desc" } },
      take: MAX_ALTERNATIVES,
    });
    levels.push({
      ids: popular.map((row) => row.lectureId),
      excludeWatched: false,
    });

    let validAlternativeIds: string[] = [];
    for (const level of levels) {
      const valid = [...new Set(level.ids)].filter(
        (id) =>
          id !== resourceId &&
          existingIds.has(id) &&
          (!level.excludeWatched || !watched.has(id)),
      );
      if (valid.length > 0) {
        validAlternativeIds = valid.slice(0, MAX_ALTERNATIVES);
        break;
      }
    }

    // A "next up" must never bounce straight into a rewatch of its own
    // lecture (e.g. the student failed its quiz or quit it early). Prefer
    // candidates the student is ready to move on to. If every candidate is a
    // struggle lecture, recommend rewatching the best candidate directly —
    // the label then matches the action ("rewatch X") instead of a
    // "play next" that immediately turns into a rewatch.
    if (validAlternativeIds.length > 0) {
      const struggling = new Set<string>();
      for (const id of validAlternativeIds) {
        if (await this.isStrugglingOnLecture(studentId, id)) {
          struggling.add(id);
        }
      }
      const ready = validAlternativeIds.filter((id) => !struggling.has(id));
      if (ready.length === 0) {
        const top = validAlternativeIds[0];
        return {
          ...base,
          recommendation: "REWATCH",
          rewatchProbability: prediction.rewatch_probability,
          recommendedResource: top,
          recommendedLecture: await this.findLectureSummary(top),
          rewatchReason: await this.struggleReasonForLecture(studentId, top),
        };
      }
      validAlternativeIds = ready;
    }

    // No lectures at all besides the current one.
    if (validAlternativeIds.length === 0) {
      return {
        ...base,
        recommendation: prediction.recommendation,
        rewatchProbability: prediction.rewatch_probability,
      };
    }

    const lectures =
      validAlternativeIds.length > 0
        ? await this.prisma.lecture.findMany({
            where: { id: { in: validAlternativeIds } },
            select: {
              id: true,
              title: true,
              videoUrl: true,
              durationMinutes: true,
              transcript: true,
            },
          })
        : [];
    const byId = new Map(lectures.map((l) => [l.id, this.toLectureSummary(l)]));
    const recommendedResource = validAlternativeIds[0] ?? null;
    const alternativeLectures = validAlternativeIds
      .map((id) => byId.get(id) ?? null)
      .filter((lecture): lecture is LectureSummary => lecture !== null);

    return {
      ...base,
      recommendation: prediction.recommendation,
      rewatchProbability: prediction.rewatch_probability,
      recommendedResource,
      recommendedLecture: recommendedResource
        ? byId.get(recommendedResource) ?? null
        : null,
      alternatives: validAlternativeIds,
      alternativeLectures,
    };
  }

  private async findLectureSummary(id: string): Promise<LectureSummary | null> {
    const lecture = await this.prisma.lecture.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        videoUrl: true,
        durationMinutes: true,
        transcript: true,
      },
    });
    if (!lecture) return null;
    return this.toLectureSummary(lecture);
  }

  private toLectureSummary(lecture: {
    id: string;
    title: string;
    videoUrl: string;
    durationMinutes: number | null;
    transcript: string | null;
  }): LectureSummary {
    const transcript = lecture.transcript?.trim() ?? "";
    const summary = transcript
      ? transcript.length > SUMMARY_MAX_CHARS
        ? `${transcript.slice(0, SUMMARY_MAX_CHARS).trimEnd()}…`
        : transcript
      : null;
    return {
      id: lecture.id,
      title: lecture.title,
      videoUrl: lecture.videoUrl,
      durationMinutes: lecture.durationMinutes,
      summary,
    };
  }

  private async ensureTransitionsFresh(): Promise<void> {
    const latest = await this.prisma.studentInteraction.aggregate({
      _max: { createdAt: true },
    });
    const latestInteractionAt = latest._max.createdAt;
    if (!latestInteractionAt) return;

    const built = await this.prisma.resourceTransition.aggregate({
      _max: { updatedAt: true },
    });
    const lastBuiltAt = built._max.updatedAt;
    if (lastBuiltAt && lastBuiltAt >= latestInteractionAt) return;

    if (!this.rebuildPromise) {
      this.rebuildPromise = this.rebuildTransitions().finally(() => {
        this.rebuildPromise = null;
      });
    }
    await this.rebuildPromise;
  }
}
