import { CORE_MANZIL_SURAH_NUMBERS } from './revision-plan';
import { getSurah } from './surahs';

export interface MemorizedPortion {
  id: string;
  surahNumber: number;
  title: string;
  detail: string;
  section: 'Full Surah' | 'Ayahs' | 'Pages';
  /** Page inside the per-surah PDF where this portion starts. */
  page: number | 'last' | 'last-two';
  /** Juz this portion belongs to (for partials: where that portion falls). */
  juz: number;
}

export interface MemorizedJuzGroup {
  juz: number;
  label: string;
  portions: MemorizedPortion[];
}

/**
 * Juz where each surah begins (index = surah number; 0 unused).
 * Used when a memorized entry is the full surah.
 */
const SURAH_START_JUZ: number[] = [
  0, 1, 1, 3, 4, 6, 7, 8, 9, 10, 11, 11, 12, 13, 13, 14, 14, 15, 15, 16, 16,
  17, 17, 18, 18, 18, 19, 19, 20, 20, 21, 21, 21, 21, 22, 22, 22, 23, 23, 23,
  24, 24, 25, 25, 25, 25, 26, 26, 26, 26, 26, 26, 27, 27, 27, 27, 27, 27, 28,
  28, 28, 28, 28, 28, 28, 28, 28, 29, 29, 29, 29, 29, 29, 29, 29, 29, 29, 29,
  30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
  30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30
];

export function juzForSurah(surahNumber: number): number {
  if (surahNumber < 1 || surahNumber > 114) {
    return 1;
  }
  return SURAH_START_JUZ[surahNumber] || 1;
}

/**
 * The memorized collection is intentionally kept in one small list so new
 * surahs, pages, and ayah ranges can be added as the collection grows.
 */
export const MEMORIZED_SELECTIONS: MemorizedPortion[] = [
  {
    id: 'baqarah-last-three',
    surahNumber: 2,
    title: 'Surah Al-Baqarah',
    detail: 'Last 3 ayahs · 284–286',
    section: 'Ayahs',
    page: 'last',
    juz: 3
  },
  {
    id: 'ali-imran-first-page',
    surahNumber: 3,
    title: 'Surah Ali ‘Imran',
    detail: 'First page',
    section: 'Pages',
    page: 1,
    juz: 3
  },
  {
    id: 'ali-imran-last-two-pages',
    surahNumber: 3,
    title: 'Surah Ali ‘Imran',
    detail: 'Last 2 pages',
    section: 'Pages',
    page: 'last-two',
    juz: 4
  }
];

/** Full surahs already identified as memorized by the weekly revision plan. */
export const FULL_MEMORIZED_SURAHS: MemorizedPortion[] =
  CORE_MANZIL_SURAH_NUMBERS.map((surahNumber) => {
    const surah = getSurah(surahNumber)!;
    return {
      id: `surah-${surahNumber}`,
      surahNumber,
      title: `Surah ${surah.name}`,
      detail: `Complete surah · ${surah.ayahCount} ayahs`,
      section: 'Full Surah' as const,
      page: 1,
      juz: juzForSurah(surahNumber)
    };
  });

export const MEMORIZED_PORTIONS: MemorizedPortion[] = [
  ...FULL_MEMORIZED_SURAHS,
  ...MEMORIZED_SELECTIONS
].sort((a, b) => a.juz - b.juz || a.surahNumber - b.surahNumber);

/** Memorized portions grouped by juz, ascending. */
export const MEMORIZED_BY_JUZ: MemorizedJuzGroup[] = (() => {
  const byJuz = new Map<number, MemorizedPortion[]>();
  for (const portion of MEMORIZED_PORTIONS) {
    const list = byJuz.get(portion.juz) ?? [];
    list.push(portion);
    byJuz.set(portion.juz, list);
  }
  return [...byJuz.entries()]
    .sort(([a], [b]) => a - b)
    .map(([juz, portions]) => ({
      juz,
      label: `Juz ${juz}`,
      portions
    }));
})();
