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
    page: 'last'
  },
  {
    id: 'ali-imran-first-page',
    surahNumber: 3,
    title: 'Surah Ali ‘Imran',
    detail: 'First page',
    section: 'Pages',
    page: 1
  },
  {
    id: 'ali-imran-last-two-pages',
    surahNumber: 3,
    title: 'Surah Ali ‘Imran',
    detail: 'Last 2 pages',
    section: 'Pages',
    page: 'last-two'
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
      page: 1
    };
  });

export const MEMORIZED_PORTIONS: MemorizedPortion[] = [
  ...FULL_MEMORIZED_SURAHS,
  ...MEMORIZED_SELECTIONS
];
