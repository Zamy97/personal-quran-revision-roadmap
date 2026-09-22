import { ManzilDay } from '../data/revision-plan';

/** Stored weekly day shape (same as ManzilDay; kept JSON-friendly). */
export type StoredManzilDay = ManzilDay;

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
  /** Portion id → YYYY-MM-DD of its most recent review. */
  memorizedReviews: Record<string, string>;
  updatedAt: string;

  /**
   * Explicit false = classmate still needs onboarding.
   * Missing/true = skip onboarding (legacy / finished).
   */
  onboardingComplete?: boolean;
  /** Full surahs the user has memorized (drives Memorized tab + weekly plan). */
  memorizedSurahNumbers?: number[];
  /** Generated Mon–Sun manzil loop for this user. */
  weeklyManzil?: StoredManzilDay[];
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

/** Classmates who have not finished the memorized-surah questionnaire. */
export function needsCurriculumOnboarding(
  progress: MemorizationProgress
): boolean {
  return progress.onboardingComplete === false;
}
