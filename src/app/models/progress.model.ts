export interface DailyCompletion {
  date: string; // YYYY-MM-DD
  sabaq: boolean;
  sabqi: boolean;
  manzil: boolean;
}

export interface MemorizationProgress {
  currentPhase: string;
  /** Latest ayah/line reached in the current phase surah */
  currentLine: number;
  daily: DailyCompletion;
  updatedAt: string;
}

export function todayKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function emptyDaily(date = new Date()): DailyCompletion {
  return {
    date: todayKey(date),
    sabaq: false,
    sabqi: false,
    manzil: false
  };
}
