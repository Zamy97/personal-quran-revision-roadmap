export type DailyTaskId = 'sabaqSabqi' | 'manzil';

export interface DailyBlueprintItem {
  id: DailyTaskId;
  order: number;
  title: string;
  duration: string;
}

export const DAILY_BLUEPRINT: DailyBlueprintItem[] = [
  {
    id: 'sabaqSabqi',
    order: 1,
    title: 'Sabaq & Sabqi (New Content)',
    duration: '25–30 min'
  },
  {
    id: 'manzil',
    order: 2,
    title: 'Manzil (High-Frequency Revision)',
    duration: '45–60 min'
  }
];

export interface RetentionReminder {
  title: string;
  detail: string;
}

export const RETENTION_REMINDERS: RetentionReminder[] = [
  {
    title: 'Eliminate the Gap',
    detail:
      'Repeating this 3-day loop twice a week means you never go more than 2 days without seeing a surah. Surahs like Nuh and Al-Jinn stay fresh.'
  },
  {
    title: 'The Commute Hack',
    detail:
      'Do your ~30m Sabaq/Sabqi sitting down at home. Do your Manzil revision in the car, on a walk, or in your head during daily chores.'
  },
  {
    title: 'Rebuilding Weak Surahs',
    detail:
      'For the first 2 weeks, don\'t test your memory on Nuh or Al-Jinn. Read them directly from the mushaf on Tuesday and Friday until they feel smooth.'
  }
];

export interface ManzilDay {
  day: string;
  dayIndex: number; // 1 = Monday ... 0 = Sunday (JS getDay)
  focusTitle: string;
  focusDetail: string;
  estimatedVolume: string;
  surahNumbers: number[];
}

export const DEFAULT_SURAH_NUMBER = 74;

const JUZ_30: number[] = [
  78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96,
  97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112,
  113, 114
];

// A mirrored 3-day loop, run twice a week (Mon=Thu, Tue=Fri, Wed=Sat) so every
// memorized surah is contacted at least twice a week. Sunday is a buffer.
//
// This is edited by hand as memorization grows — just tell me the new progress
// and I'll redistribute the surahs across these days.
const LOOP_A = {
  focusTitle: 'Surah Yasin & Juz 29 (First Half)',
  focusDetail: 'Yasin + Al-Mulk, Al-Qalam, Al-Haqqah, Al-Ma\'arij',
  estimatedVolume: '~13 Pages',
  surahNumbers: [36, 67, 68, 69, 70]
};

const LOOP_B = {
  focusTitle: 'Core Surahs & Juz 29 (Second Half)',
  focusDetail: 'As-Sajda, Ar-Rahman, Al-Waqi\'ah, Ad-Dukhan + Nuh & Al-Jinn',
  estimatedVolume: '~15 Pages',
  surahNumbers: [32, 55, 56, 44, 71, 72]
};

const LOOP_C = {
  focusTitle: 'Juz 30 (Complete)',
  focusDetail: 'Recite the whole Juz (split: half morning / half evening)',
  estimatedVolume: '~20 Pages',
  surahNumbers: JUZ_30
};

export const WEEKLY_MANZIL: ManzilDay[] = [
  { day: 'Monday', dayIndex: 1, ...LOOP_A },
  { day: 'Tuesday', dayIndex: 2, ...LOOP_B },
  { day: 'Wednesday', dayIndex: 3, ...LOOP_C },
  { day: 'Thursday', dayIndex: 4, ...LOOP_A },
  { day: 'Friday', dayIndex: 5, ...LOOP_B },
  { day: 'Saturday', dayIndex: 6, ...LOOP_C },
  {
    day: 'Sunday',
    dayIndex: 0,
    focusTitle: 'Buffer Day (Flexible Catch-Up)',
    focusDetail: 'Address any weak pages, listen to hard surahs, or rest',
    estimatedVolume: 'Flexible',
    surahNumbers: []
  }
];

/** Every surah already placed somewhere in the weekly plan. */
export const CORE_MANZIL_SURAH_NUMBERS: number[] = [
  ...new Set(WEEKLY_MANZIL.flatMap((day) => day.surahNumbers))
].sort((a, b) => a - b);

const CORE_SET = new Set(CORE_MANZIL_SURAH_NUMBERS);

export function isCoreManzilSurah(surahNumber: number): boolean {
  return CORE_SET.has(surahNumber);
}
