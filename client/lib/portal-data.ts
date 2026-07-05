export const difficultyLabels = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
} as const;

export const segmentLabels = ["Segment 1", "Segment 2", "Segment 3"] as const;

export const quizStatusLabels = {
  pending: "Pending review",
  approved: "Approved",
  rejected: "Rejected",
  edited: "Teacher edited",
} as const;

export function formatDate(value?: string | null) {
  if (!value) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export function formatDateTime(value?: string | null) {
  if (!value) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatDuration(minutes?: number | null) {
  if (!minutes && minutes !== 0) {
    return "--";
  }

  return `${minutes} min`;
}

export function initials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function lower(value: string | null | undefined) {
  return value?.toLowerCase() ?? "";
}
