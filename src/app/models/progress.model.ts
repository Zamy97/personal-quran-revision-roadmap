export interface DailyCompletion {
  date: string; // YYYY-MM-DD
  sabaqSabqi: boolean;
  manzil: boolean;
}

export interface MemorizationProgress {
  /** Surah currently being memorized (1–114) */
  currentSurahNumber: number;
  /** Latest ayah reached in the current surah */
  currentAyah: number;
  /** Kept for older backups / display compatibility */
  currentPhase: string;
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
    sabaqSabqi: false,
    manzil: false
  };
}
