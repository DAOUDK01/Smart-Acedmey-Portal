import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma.service";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { TutorVectorStore } from "./tutor-vector-store.service";

const CHUNK_SIZE = 1200;
const CHUNK_OVERLAP = 200;

export type RebuildResult = {
  indexed: boolean;
  lectureChunks: number;
  studentDocs: number;
  totalDocuments: number;
};

@Injectable()
export class TutorIngestionService {
  private readonly logger = new Logger(TutorIngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly vectorStore: TutorVectorStore,
  ) {}

  async rebuildIndex(): Promise<RebuildResult> {
    if (!this.vectorStore.enabled) {
      return { indexed: false, lectureChunks: 0, studentDocs: 0, totalDocuments: 0 };
    }

    await this.vectorStore.truncateAll();

    const [lectureChunks, studentDocs] = await Promise.all([
      this.indexLectureTranscripts(),
      this.indexStudentProgress(),
    ]);

    const totalDocuments = await this.vectorStore.count();
    this.logger.log(
      `Index rebuilt: ${lectureChunks} lecture chunks, ${studentDocs} student docs (${totalDocuments} total)`,
    );

    return { indexed: true, lectureChunks, studentDocs, totalDocuments };
  }

  private async indexLectureTranscripts(): Promise<number> {
    const lectures = await this.prisma.lecture.findMany({
      where: { transcript: { not: null } },
    });

    const courses = await this.prisma.course.findMany();
    const courseById = new Map(courses.map((course) => [course.id, course]));

    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: CHUNK_SIZE,
      chunkOverlap: CHUNK_OVERLAP,
      separators: ["\n\n", "\n", ". ", " ", ""],
    });

    let totalChunks = 0;
    for (const lecture of lectures) {
      const transcript = (lecture.transcript ?? "").trim();
      if (!transcript) continue;

      const course = courseById.get(lecture.courseId);
      const chunks = await splitter.splitText(transcript);
      if (chunks.length === 0) continue;

      const documents = chunks.map((chunk, index) => ({
        pageContent: chunk,
        metadata: {
          type: "lecture",
          lectureId: lecture.id,
          courseId: lecture.courseId,
          courseTitle: course?.title ?? "Unknown course",
          lectureTitle: lecture.title,
          lectureOrder: lecture.lectureOrder,
          chunkIndex: index,
        },
      }));

      await this.vectorStore.addDocuments(documents);
      totalChunks += chunks.length;
    }

    return totalChunks;
  }

  private async indexStudentProgress(): Promise<number> {
    const progressRecords = await this.prisma.studentProgress.findMany();

    let indexed = 0;
    for (const record of progressRecords) {
      const weakTopics = this.stringifyJson(record.weakTopics);
      const attempts = await this.prisma.quizAttempt.findMany({
        where: { studentId: record.studentId },
        orderBy: { submittedAt: "desc" },
        take: 15,
        include: { quiz: true },
      });

      const recentActivity = attempts.length
        ? attempts
            .map((attempt) => {
              const topic =
                attempt.quiz.topic ?? attempt.quiz.sourceTopic ?? "untitled question";
              return `- ${attempt.passed ? "Passed" : "Failed"} quiz on "${topic}" (score ${attempt.score})`;
            })
            .join("\n")
        : "No quiz attempts recorded yet.";

      const doc = [
        `Student progress for ${record.studentId}:`,
        `- Average quiz score: ${record.avgScore}%`,
        `- Progress: ${record.progressPercentage}% of the course completed`,
        `- Completed lectures: ${record.completedLectures}`,
        `- Completed checkpoints: ${record.completedCheckpoints}`,
        `- Locked checkpoints: ${record.lockedCheckpoints}`,
        `- Failed quizzes: ${record.failedQuizzes}`,
        `- Learning streak: ${record.streakDays} day(s)`,
        `- Weak topics: ${weakTopics}`,
        `- Last activity: ${record.lastActivityAt?.toISOString() ?? "not recorded"}`,
        `Recent quiz attempts:`,
        recentActivity,
      ].join("\n");

      await this.vectorStore.addDocuments([
        {
          pageContent: doc,
          metadata: {
            type: "student",
            studentId: record.studentId,
            updatedAt: record.updatedAt.toISOString(),
          },
        },
      ]);
      indexed += 1;
    }

    return indexed;
  }

  private stringifyJson(value: unknown): string {
    if (value == null) return "none flagged";
    if (Array.isArray(value)) {
      return value.length ? value.join(", ") : "none flagged";
    }
    try {
      const parsed = JSON.parse(String(value));
      if (Array.isArray(parsed)) {
        return parsed.length ? parsed.join(", ") : "none flagged";
      }
    } catch {
      // fall through to raw string
    }
    return String(value);
  }
}
