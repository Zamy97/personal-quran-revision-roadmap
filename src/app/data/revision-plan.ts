export interface ManzilDay {
  day: string; // Monday ... Sunday
  dayIndex: number; // 1 = Monday ... 0 = Sunday (JS getDay)
  focusTitle: string;
  focusDetail: string;
  estimatedVolume: string;
}

export interface DailyBlueprintItem {
  id: 'sabaq' | 'sabqi' | 'manzil';
  order: number;
  title: string;
  durationMinutes: number;
}

export const DAILY_BLUEPRINT: DailyBlueprintItem[] = [
  { id: 'sabaq', order: 1, title: 'Sabaq (New)', durationMinutes: 15 },
  { id: 'sabqi', order: 2, title: 'Sabqi (Recent)', durationMinutes: 15 },
  { id: 'manzil', order: 3, title: 'Manzil (Core Revision)', durationMinutes: 30 }
];

export const WEEKLY_MANZIL: ManzilDay[] = [
  {
    day: 'Monday',
    dayIndex: 1,
    focusTitle: 'Surah Yasin & Surah As-Sajda',
    focusDetail: 'Independent core surahs',
    estimatedVolume: '~8 Pages'
  },
  {
    day: 'Tuesday',
    dayIndex: 2,
    focusTitle: 'Surah Ar-Rahman & Surah Al-Waqi\'ah',
    focusDetail: 'Independent core surahs',
    estimatedVolume: '~7 Pages'
  },
  {
    day: 'Wednesday',
    dayIndex: 3,
    focusTitle: 'Surah Ad-Dukhan & Juz 29 Start',
    focusDetail: 'Surah Al-Mulk to Surah Al-Qalam',
    estimatedVolume: '~7 Pages'
  },
  {
    day: 'Thursday',
    dayIndex: 4,
    focusTitle: 'Juz 29 Remainder',
    focusDetail: 'Surah Al-Haqqah up to Surah Al-Jinn',
    estimatedVolume: '~6 Pages'
  },
  {
    day: 'Friday',
    dayIndex: 5,
    focusTitle: 'Juz 30 First Half',
    focusDetail: 'Surah An-Naba to Surah Al-Inshiqaq',
    estimatedVolume: '~6 Pages'
  },
  {
    day: 'Saturday',
    dayIndex: 6,
    focusTitle: 'Juz 30 Second Half',
    focusDetail: 'Surah Al-Buruj to Surah An-Nas',
    estimatedVolume: '~6 Pages'
  },
  {
    day: 'Sunday',
    dayIndex: 0,
    focusTitle: 'Buffer Day',
    focusDetail: 'Catch up, reinforce weak spots, or rest',
    estimatedVolume: 'Flexible'
  }
];

export const DEFAULT_PHASE = 'Surah Al-Muddaththir';
