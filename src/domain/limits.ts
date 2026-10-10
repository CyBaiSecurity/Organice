export const LIMITS = {
  lists: 100,
  openTasks: 2000,
  completions: 5000,
  ideas: 1000,
  sectionsPerList: 30,
  habits: 40,
  checklist: 100,
  title: 500,
  notes: 20000,
  habitName: 200,
  habitUnit: 20,
  habitGoalMax: 10000,
  focusDays: 365,
  lengthMin: 1,
  lengthMax: 180,
  longBreakEveryMin: 2,
  longBreakEveryMax: 12,
  intervalMin: 1,
  intervalMax: 365,
} as const;

export function cleanText(value: string, max: number): string {
  return value.trim().slice(0, max);
}

export function requireText(value: string, max: number): string {
  const cleaned = cleanText(value, max);
  if (cleaned.length === 0) {
    throw new Error('Title is required');
  }
  return cleaned;
}
