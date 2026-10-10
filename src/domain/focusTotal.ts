import { localDateKey } from './time.ts';

export function focusSecondsToday(
  sessions: {
    endedAt: string | null;
    actualSeconds: number | null;
    status: string;
    phase: string;
  }[],
  today: Date,
): number {
  const todayKey = localDateKey(today);
  let total = 0;
  for (const session of sessions) {
    if (session.status !== 'completed' || session.phase !== 'focus') continue;
    if (session.endedAt == null) continue;
    const ended = new Date(session.endedAt);
    if (Number.isNaN(ended.getTime()) || localDateKey(ended) !== todayKey) continue;
    if (typeof session.actualSeconds === 'number' && Number.isFinite(session.actualSeconds)) {
      total += session.actualSeconds;
    }
  }
  return total;
}
