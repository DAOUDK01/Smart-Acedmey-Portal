export type AssistantRole = "STUDENT" | "TEACHER" | "GUARDIAN" | "ADMIN";

export const ASSISTANT_ROLES: AssistantRole[] = ["STUDENT", "TEACHER", "GUARDIAN", "ADMIN"];

export type PortalFeature = { tab: string; name: string; description: string };

export type RoleGuide = {
  portal: string;
  features: PortalFeature[];
  suggestions: string[];
  quickActions: { label: string; tab: string }[];
};

/** Mirrors the sidebar of each portal, so navigation advice and quick actions always point at real pages. */
export const ROLE_GUIDES: Record<AssistantRole, RoleGuide> = {
  STUDENT: {
    portal: "Student Portal",
    features: [
      { tab: "overview", name: "Dashboard", description: "Progress summary, streak and the smart lecture recommendation." },
      { tab: "courses", name: "My Courses", description: "Enrolled courses and their lectures; lectures contain checkpoint quizzes." },
      { tab: "exams", name: "Mock Exams", description: "Published mock exams to practise under exam conditions." },
      { tab: "progress", name: "Performance", description: "Average score, weak topics and subject reports." },
      { tab: "ai-tutor", name: "AI Tutor", description: "Ask questions about a specific lecture using its transcript." },
      { tab: "study-planner", name: "AI Study Planner", description: "Build a personal daily/weekly study plan, tick off tasks and regenerate it." },
    ],
    suggestions: [
      "Which topics should I revise first?",
      "Explain my recent quiz mistakes",
      "How am I doing in my courses?",
      "Help me plan my study week",
    ],
    quickActions: [
      { label: "My courses", tab: "courses" },
      { label: "Study planner", tab: "study-planner" },
      { label: "Mock exams", tab: "exams" },
      { label: "My performance", tab: "progress" },
    ],
  },
  TEACHER: {
    portal: "Teacher Portal",
    features: [
      { tab: "overview", name: "Dashboard", description: "Teaching overview and performance charts." },
      { tab: "upload", name: "Upload Lecture", description: "Upload a video or add a YouTube link; transcripts are generated automatically." },
      { tab: "manage-lectures", name: "Manage Lectures", description: "Edit, publish and manage checkpoints of existing lectures." },
      { tab: "courses", name: "My Courses", description: "Courses assigned to you." },
      { tab: "quizzes", name: "Quiz Review", description: "Generate AI quizzes from lectures and approve, edit or reject them." },
      { tab: "mockups", name: "Mock Exams", description: "Build mock exams from approved questions and publish them." },
      { tab: "analytics", name: "Performance", description: "Class quiz performance and adaptive levels." },
      { tab: "alerts", name: "Risk Alerts", description: "Students who may need academic support." },
    ],
    suggestions: [
      "Summarise my class performance",
      "Which students may need support?",
      "How do I create a quiz from a lecture?",
      "How do I publish a mock exam?",
    ],
    quickActions: [
      { label: "Upload lecture", tab: "upload" },
      { label: "Quiz review", tab: "quizzes" },
      { label: "Mock exams", tab: "mockups" },
      { label: "Risk alerts", tab: "alerts" },
    ],
  },
  GUARDIAN: {
    portal: "Parent Portal",
    features: [
      { tab: "overview", name: "Dashboard", description: "Your child's progress at a glance." },
      { tab: "progress", name: "Student Progress", description: "Subject scores and overall progress." },
      { tab: "lectures", name: "Lecture Recommendations", description: "Lectures your child should watch or revisit." },
      { tab: "quizzes", name: "Quiz Attempts", description: "Your child's checkpoint quiz attempts and results." },
      { tab: "alerts", name: "Activity Alerts", description: "Alerts about failed quizzes or inactivity." },
    ],
    suggestions: [
      "How is my child doing?",
      "Which subjects need attention?",
      "Explain the progress report",
      "How can I support my child at home?",
    ],
    quickActions: [
      { label: "Progress", tab: "progress" },
      { label: "Quiz attempts", tab: "quizzes" },
      { label: "Lecture tips", tab: "lectures" },
      { label: "Alerts", tab: "alerts" },
    ],
  },
  ADMIN: {
    portal: "Admin Portal",
    features: [
      { tab: "overview", name: "Overview", description: "Platform metrics: users, courses, lectures, quizzes and activity." },
      { tab: "staff-add", name: "Staff › Add Teacher", description: "Invite a teacher by email to register." },
      { tab: "staff-view", name: "Staff › View Teachers", description: "List and manage teacher accounts." },
      { tab: "staff-approvals", name: "Staff › Approvals", description: "Review submitted teacher registrations." },
      { tab: "student-admissions", name: "Students › Admissions", description: "Review admission requests and send registration invites." },
      { tab: "student-view", name: "Students › View Students", description: "List and manage student accounts." },
      { tab: "student-performance", name: "Students › Performance", description: "Student performance reports." },
      { tab: "create-course", name: "Courses › Add Course", description: "Create a new course." },
      { tab: "courses", name: "Courses › View Courses", description: "Edit, publish or remove courses." },
      { tab: "class-create", name: "Classes › Create Class", description: "Create classes and sections." },
      { tab: "classes", name: "Classes › Manage Classes", description: "Assign courses and teachers to sections." },
      { tab: "analytics", name: "Analytics", description: "Charts of signups and platform usage." },
      { tab: "settings", name: "Settings", description: "System settings such as maintenance mode." },
    ],
    suggestions: [
      "Explain the dashboard metrics",
      "What needs my attention today?",
      "How do I add a new teacher?",
      "How do I assign a course to a class?",
    ],
    quickActions: [
      { label: "Admissions", tab: "student-admissions" },
      { label: "Staff approvals", tab: "staff-approvals" },
      { label: "Courses", tab: "courses" },
      { label: "Analytics", tab: "analytics" },
    ],
  },
};

export function isAssistantRole(role: unknown): role is AssistantRole {
  return typeof role === "string" && (ASSISTANT_ROLES as string[]).includes(role);
}
