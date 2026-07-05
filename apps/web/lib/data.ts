export const navGroups = {
  admin: ["Overview", "Courses", "Lectures", "Quizzes"],
  teacher: ["Upload", "Review", "Segments", "Published"],
  student: ["Courses", "Lectures", "Quizzes", "Progress"],
  guardian: ["Overview", "Progress", "Subjects", "Alerts"],
};

export const featureCards = [
  {
    title: "AI Quiz Generation",
    description:
      "Create structured quizzes from transcripts and lecture notes.",
    accent: "purple",
  },
  {
    title: "Checkpoint Locking",
    description:
      "Keep learners focused with gated lecture progression and segment popups.",
    accent: "cyan",
  },
  {
    title: "Human Validation",
    description: "Approve, reject, or edit AI questions before publishing.",
    accent: "success",
  },
  {
    title: "Guardian Insights",
    description: "Show progress, weak topics, and learning consistency.",
    accent: "warning",
  },
  {
    title: "Premium Analytics",
    description:
      "Track lecture completion, scores, approvals, and engagement signals.",
    accent: "danger",
  },
  {
    title: "Adaptive Foundation",
    description: "Rule-based progression now, ML-ready later.",
    accent: "purple",
  },
];

export const stats = [
  { label: "Active Students", value: "12.4k", delta: "+18%" },
  { label: "Courses", value: "248", delta: "+9%" },
  { label: "Quiz Accuracy", value: "87%", delta: "+6%" },
  { label: "Learning Improvement", value: "31%", delta: "+14%" },
];

export const aiWorkflow = [
  "Lecture",
  "AI Quiz",
  "Validation",
  "Adaptive Learning",
  "Analytics",
];

export const reviewQuizzes = [
  {
    topic: "Object Oriented Programming",
    difficulty: "Easy",
    question: "What is encapsulation?",
    options: ["Data hiding", "Inheritance", "Polymorphism", "Abstraction"],
    status: "Pending",
  },
  {
    topic: "Algorithms",
    difficulty: "Medium",
    question: "Which data structure is best for LIFO behavior?",
    options: ["Queue", "Stack", "Tree", "Graph"],
    status: "Pending",
  },
  {
    topic: "Recursion",
    difficulty: "Hard",
    question:
      "A recursive function must include what to prevent infinite recursion?",
    options: ["Loop", "Base case", "Array", "Pointer"],
    status: "Pending",
  },
];

export const guardianHighlights = [
  {
    title: "Learning Consistency",
    value: "78%",
    note: "Stable over the past 7 days",
  },
  {
    title: "Completion Rate",
    value: "64%",
    note: "3 lectures completed this week",
  },
  {
    title: "Weak Topic",
    value: "Recursion",
    note: "Needs one revision session",
  },
];

export const databaseFieldGroups = [
  {
    model: "User",
    fields: [
      "phoneNumber",
      "avatarUrl",
      "isActive",
      "emailVerifiedAt",
      "lastLoginAt",
    ],
  },
  {
    model: "Course",
    fields: ["code", "level", "isPublished", "sortOrder"],
  },
  {
    model: "Lecture",
    fields: [
      "lectureOrder",
      "durationMinutes",
      "videoProvider",
      "isCheckpointLocked",
      "publishedAt",
    ],
  },
  {
    model: "Checkpoint",
    fields: ["title", "sortOrder", "unlockScore", "isPublished"],
  },
  {
    model: "QuizQuestion",
    fields: [
      "questionType",
      "answerExplanation",
      "attemptLimit",
      "publishedAt",
    ],
  },
  {
    model: "QuizAttempt",
    fields: ["attemptNumber", "selectedAnswers", "passed", "submittedAt"],
  },
  {
    model: "StudentProgress",
    fields: [
      "guardianName",
      "currentCourseId",
      "currentLectureId",
      "streakDays",
      "lastActivityAt",
      "completedCheckpoints",
      "lockedCheckpoints",
      "progressPercentage",
    ],
  },
];
