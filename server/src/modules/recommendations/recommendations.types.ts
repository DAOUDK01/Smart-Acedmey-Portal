export type JwtPayload = {
  userId: string;
  role: string;
  tokenType: string;
};

export type RawFeatures = {
  click_count: number;
  repeated_interaction: number;
  latest_quiz_score: number;
  previous_quiz_score: number;
  score_change: number;
  interaction_week: number;
  activity_type: string;
};

export type MlPrediction = {
  recommendation: "REWATCH" | "NEXT_VIDEO";
  rewatch_probability: number;
  prediction: number;
  model_features?: string[];
};

export type LectureSummary = {
  id: string;
  title: string;
  videoUrl: string;
  durationMinutes: number | null;
  summary: string | null;
};

export type RecommendationResult = {
  userId: string;
  currentResource: string;
  recommendation: "REWATCH" | "NEXT_VIDEO";
  rewatchProbability: number;
  recommendedResource: string | null;
  recommendedLecture: LectureSummary | null;
  alternatives: string[];
  alternativeLectures: LectureSummary[];
  /** Why a rewatch was recommended (low quiz score, early quit, ...). */
  rewatchReason?: string | null;
};
