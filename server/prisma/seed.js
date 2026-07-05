const { PrismaClient, UserRole, QuizStatus } = require("@prisma/client");
const { createHash } = require("crypto");

const prisma = new PrismaClient();

function hashPassword(password) {
  return createHash("sha256").update(password).digest("hex");
}

async function ensureUser({ role, name, email, password }) {
  return prisma.user.upsert({
    where: { email },
    update: {
      role,
      name,
      passwordHash: hashPassword(password),
      isActive: true,
      emailVerifiedAt: new Date(),
    },
    create: {
      role,
      name,
      email,
      passwordHash: hashPassword(password),
      isActive: true,
      emailVerifiedAt: new Date(),
    },
  });
}

async function ensureCourse({
  teacherId,
  code,
  title,
  description,
  level,
  sortOrder,
}) {
  return prisma.course.upsert({
    where: { code },
    update: {
      teacherId,
      title,
      description,
      level,
      isPublished: true,
      sortOrder,
    },
    create: {
      teacherId,
      code,
      title,
      description,
      level,
      isPublished: true,
      sortOrder,
    },
  });
}

async function ensureLecture({
  courseId,
  title,
  lectureOrder,
  videoUrl,
  transcript,
  durationMinutes,
}) {
  const existing = await prisma.lecture.findFirst({
    where: { courseId, title },
  });

  if (existing) {
    return prisma.lecture.update({
      where: { id: existing.id },
      data: {
        videoUrl,
        transcript,
        lectureOrder,
        durationMinutes,
        videoProvider: "YouTube",
        isCheckpointLocked: true,
        publishedAt: new Date(),
      },
    });
  }

  return prisma.lecture.create({
    data: {
      courseId,
      videoUrl,
      transcript,
      title,
      lectureOrder,
      durationMinutes,
      videoProvider: "YouTube",
      isCheckpointLocked: true,
      publishedAt: new Date(),
    },
  });
}

async function ensureCheckpoint({ lectureId, title, timestamp, sortOrder }) {
  const existing = await prisma.checkpoint.findFirst({
    where: { lectureId, title },
  });

  if (existing) {
    return prisma.checkpoint.update({
      where: { id: existing.id },
      data: {
        timestamp,
        sortOrder,
        unlockScore: 70,
        isBlocking: true,
        isPublished: true,
      },
    });
  }

  return prisma.checkpoint.create({
    data: {
      lectureId,
      title,
      timestamp,
      sortOrder,
      unlockScore: 70,
      isBlocking: true,
      isPublished: true,
    },
  });
}

async function ensureQuiz({
  lectureId,
  question,
  options,
  correctAnswer,
  difficulty,
  topic,
  timestamp,
}) {
  const existing = await prisma.quizQuestion.findFirst({
    where: { lectureId, question },
  });

  const quizData = {
    lectureId,
    question,
    options,
    correctAnswer,
    difficulty,
    topic,
    sourceTopic: topic,
    timestamp,
    status: QuizStatus.APPROVED,
    reviewedBy: "Seeder",
    reviewComment: "Starter sample content",
    reviewedAt: new Date(),
    publishedAt: new Date(),
  };

  if (existing) {
    return prisma.quizQuestion.update({
      where: { id: existing.id },
      data: quizData,
    });
  }

  return prisma.quizQuestion.create({
    data: quizData,
  });
}

async function main() {
  const admin = await ensureUser({
    role: UserRole.ADMIN,
    name: "Admin Starter",
    email: "admin@smartacademy.local",
    password: "Admin@123",
  });

  const teacher = await ensureUser({
    role: UserRole.TEACHER,
    name: "Teacher Starter",
    email: "teacher@smartacademy.local",
    password: "Teacher@123",
  });

  const expert = await ensureUser({
    role: UserRole.EXPERT,
    name: "Expert Starter",
    email: "expert@smartacademy.local",
    password: "Expert@123",
  });

  const student = await ensureUser({
    role: UserRole.STUDENT,
    name: "Student Starter",
    email: "student@smartacademy.local",
    password: "Student@123",
  });

  const oopCourse = await ensureCourse({
    teacherId: teacher.id,
    code: "CS-101",
    title: "Object Oriented Programming",
    description: "Core OOP principles with practical classroom examples.",
    level: "Beginner",
    sortOrder: 1,
  });

  const webCourse = await ensureCourse({
    teacherId: teacher.id,
    code: "WEB-201",
    title: "Modern Web Development",
    description: "Client-server foundations, APIs, and deployment basics.",
    level: "Intermediate",
    sortOrder: 2,
  });

  const oopLecture1 = await ensureLecture({
    courseId: oopCourse.id,
    title: "Encapsulation and Data Modeling",
    lectureOrder: 1,
    videoUrl: "https://www.youtube.com/watch?v=ejI4v8v2hX8",
    transcript:
      "Encapsulation keeps state and behavior together, making objects safer and easier to reason about. This lecture introduces private fields, public methods, and clean object boundaries.",
    durationMinutes: 12,
  });

  const oopLecture2 = await ensureLecture({
    courseId: oopCourse.id,
    title: "Inheritance and Polymorphism",
    lectureOrder: 2,
    videoUrl: "https://www.youtube.com/watch?v=8hly31xKli0",
    transcript:
      "Inheritance promotes reuse when models share behavior. Polymorphism lets one interface serve many implementations and keeps systems easier to extend.",
    durationMinutes: 10,
  });

  const webLecture1 = await ensureLecture({
    courseId: webCourse.id,
    title: "HTTP and REST API Basics",
    lectureOrder: 1,
    videoUrl: "https://www.youtube.com/watch?v=7YcW25PHnAA",
    transcript:
      "This lecture explains request-response flow, HTTP verbs, status codes, and practical REST endpoint design for scalable services.",
    durationMinutes: 11,
  });

  await Promise.all([
    ensureCheckpoint({
      lectureId: oopLecture1.id,
      title: "Segment 1 Checkpoint",
      timestamp: 120,
      sortOrder: 1,
    }),
    ensureCheckpoint({
      lectureId: oopLecture1.id,
      title: "Segment 2 Checkpoint",
      timestamp: 300,
      sortOrder: 2,
    }),
    ensureCheckpoint({
      lectureId: oopLecture1.id,
      title: "Segment 3 Checkpoint",
      timestamp: 500,
      sortOrder: 3,
    }),
    ensureCheckpoint({
      lectureId: oopLecture2.id,
      title: "Segment 1 Checkpoint",
      timestamp: 100,
      sortOrder: 1,
    }),
    ensureCheckpoint({
      lectureId: oopLecture2.id,
      title: "Segment 2 Checkpoint",
      timestamp: 260,
      sortOrder: 2,
    }),
    ensureCheckpoint({
      lectureId: oopLecture2.id,
      title: "Segment 3 Checkpoint",
      timestamp: 430,
      sortOrder: 3,
    }),
    ensureCheckpoint({
      lectureId: webLecture1.id,
      title: "Segment 1 Checkpoint",
      timestamp: 110,
      sortOrder: 1,
    }),
    ensureCheckpoint({
      lectureId: webLecture1.id,
      title: "Segment 2 Checkpoint",
      timestamp: 280,
      sortOrder: 2,
    }),
    ensureCheckpoint({
      lectureId: webLecture1.id,
      title: "Segment 3 Checkpoint",
      timestamp: 470,
      sortOrder: 3,
    }),
  ]);

  await Promise.all([
    ensureQuiz({
      lectureId: oopLecture1.id,
      question: "What is the main purpose of encapsulation?",
      options: [
        "Hide internal state behind a clear interface",
        "Replace inheritance completely",
        "Avoid using methods",
        "Store all data globally",
      ],
      correctAnswer: "Hide internal state behind a clear interface",
      difficulty: "easy",
      topic: "Segment 1|Encapsulation",
      timestamp: 120,
    }),
    ensureQuiz({
      lectureId: oopLecture2.id,
      question:
        "Which OOP concept allows one method name to behave differently by type?",
      options: [
        "Polymorphism",
        "Encapsulation",
        "Serialization",
        "Composition",
      ],
      correctAnswer: "Polymorphism",
      difficulty: "medium",
      topic: "Segment 2|Polymorphism",
      timestamp: 300,
    }),
    ensureQuiz({
      lectureId: webLecture1.id,
      question:
        "Which HTTP status code means a resource was created successfully?",
      options: ["200", "201", "400", "500"],
      correctAnswer: "201",
      difficulty: "easy",
      topic: "Segment 3|HTTP Status Codes",
      timestamp: 110,
    }),
  ]);

  await prisma.studentProgress.upsert({
    where: { studentId: student.id },
    update: {
      guardianName: "Starter Guardian",
      currentCourseId: oopCourse.id,
      currentLectureId: oopLecture1.id,
      avgScore: 75,
      streakDays: 2,
      progressPercentage: 34,
      completedLectures: 1,
      completedCheckpoints: 2,
      lockedCheckpoints: 1,
      failedQuizzes: 0,
      weakTopics: ["Polymorphism"],
      lastActivityAt: new Date(),
    },
    create: {
      studentId: student.id,
      guardianName: "Starter Guardian",
      currentCourseId: oopCourse.id,
      currentLectureId: oopLecture1.id,
      avgScore: 75,
      streakDays: 2,
      progressPercentage: 34,
      completedLectures: 1,
      completedCheckpoints: 2,
      lockedCheckpoints: 1,
      failedQuizzes: 0,
      weakTopics: ["Polymorphism"],
      lastActivityAt: new Date(),
    },
  });

  console.log("Seed complete.");
  console.log("Starter accounts:");
  console.log("- admin@smartacademy.local / Admin@123");
  console.log("- teacher@smartacademy.local / Teacher@123");
  console.log("- student@smartacademy.local / Student@123");
  console.log(`Seed owner: ${admin.email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
