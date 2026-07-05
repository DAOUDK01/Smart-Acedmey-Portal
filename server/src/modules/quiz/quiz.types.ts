export interface QuizQuestion {
  id: string;
  lectureId?: string;
  sourceTopic?: string;
  sourceTranscript?: string;
  question: string;
  options: string[];
  correctAnswer: string;
  difficulty: string;
  topic?: string;
  status?: string;
  reviewedBy?: string;
  reviewComment?: string;
  reviewedAt?: Date;
  aiPrompt?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface QuizAttempt {
  id: string;
  studentId: string;
  quizId: string;
  score: number;
  responseTime: number;
  createdAt: Date;
}
