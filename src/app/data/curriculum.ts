import { pageCountForSurah } from './mushaf-pages';
import {
  MemorizedJuzGroup,
  MemorizedPortion,
  juzForSurah
} from './memorized-portions';
import { ManzilDay } from './revision-plan';
import { getSurah, formatSurahName } from './surahs';

const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday'
] as const;

/**
 * Split memorized surahs into a mirrored 3-day loop (Mon=Thu, Tue=Fri, Wed=Sat)
 * balanced by mushaf page volume — same structure as the hand-built weekly plan.
 */
export function buildWeeklyManzil(surahNumbers: number[]): ManzilDay[] {
  const unique = normalizeSurahList(surahNumbers);
  const [loopA, loopB, loopC] = partitionIntoThree(unique);
  const loops = [makeLoop(loopA, 'A'), makeLoop(loopB, 'B'), makeLoop(loopC, 'C')];

  const week: ManzilDay[] = [
    { day: 'Monday', dayIndex: 1, ...loops[0] },
    { day: 'Tuesday', dayIndex: 2, ...loops[1] },
    { day: 'Wednesday', dayIndex: 3, ...loops[2] },
    { day: 'Thursday', dayIndex: 4, ...loops[0] },
    { day: 'Friday', dayIndex: 5, ...loops[1] },
    { day: 'Saturday', dayIndex: 6, ...loops[2] },
    {
      day: 'Sunday',
      dayIndex: 0,
      focusTitle: 'Buffer Day (Flexible Catch-Up)',
      focusDetail: 'Address any weak pages, listen to hard surahs, or rest',
      estimatedVolume: 'Flexible',
      surahNumbers: []
    }
  ];
  return week;
}

export function buildMemorizedPortions(
  surahNumbers: number[]
): MemorizedPortion[] {
  return normalizeSurahList(surahNumbers).map((surahNumber) => {
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
}

export function groupMemorizedByJuz(
  portions: MemorizedPortion[]
): MemorizedJuzGroup[] {
  const byJuz = new Map<number, MemorizedPortion[]>();
  for (const portion of portions) {
    const list = byJuz.get(portion.juz) ?? [];
    list.push(portion);
    byJuz.set(portion.juz, list);
  }
  return [...byJuz.entries()]
    .sort(([a], [b]) => a - b)
    .map(([juz, list]) => ({
      juz,
      label: `Juz ${juz}`,
      portions: list.sort(
        (a, b) => a.surahNumber - b.surahNumber || a.id.localeCompare(b.id)
      )
    }));
}

export function normalizeSurahList(surahNumbers: number[]): number[] {
  return [
    ...new Set(
      (surahNumbers || [])
        .map((n) => Math.floor(Number(n)))
        .filter((n) => n >= 1 && n <= 114)
    )
  ].sort((a, b) => a - b);
}

function partitionIntoThree(surahs: number[]): [number[], number[], number[]] {
  if (!surahs.length) {
    return [[], [], []];
  }
  const buckets: number[][] = [[], [], []];
  const weights = [0, 0, 0];
  const ordered = [...surahs].sort(
    (a, b) => surahWeight(b) - surahWeight(a) || a - b
  );
  for (const surah of ordered) {
    let best = 0;
    for (let i = 1; i < 3; i++) {
      if (weights[i] < weights[best]) {
        best = i;
      }
    }
    buckets[best].push(surah);
    weights[best] += surahWeight(surah);
  }
  return [
    buckets[0].sort((a, b) => a - b),
    buckets[1].sort((a, b) => a - b),
    buckets[2].sort((a, b) => a - b)
  ];
}

function surahWeight(surahNumber: number): number {
  return Math.max(1, pageCountForSurah(surahNumber));
}

function makeLoop(
  surahNumbers: number[],
  label: string
): Omit<ManzilDay, 'day' | 'dayIndex'> {
  if (!surahNumbers.length) {
    return {
      focusTitle: `Loop ${label} (empty)`,
      focusDetail: 'Add more memorized surahs to fill this day',
      estimatedVolume: '—',
      surahNumbers: []
    };
  }
  const names = surahNumbers.map((n) => getSurah(n)?.name || String(n));
  const pages = surahNumbers.reduce((sum, n) => sum + surahWeight(n), 0);
  const detail =
    names.length <= 6
      ? names.join(', ')
      : `${names.slice(0, 5).join(', ')} + ${names.length - 5} more`;
  return {
    focusTitle:
      surahNumbers.length === 1
        ? formatSurahName(surahNumbers[0])
        : `Loop ${label} · ${surahNumbers.length} surahs`,
    focusDetail: detail,
    estimatedVolume: `~${pages} page${pages === 1 ? '' : 's'}`,
    surahNumbers
  };
}

/** @deprecated keep DAY_NAMES referenced for clarity if needed later */
export function weekdayName(dayIndex: number): string {
  return DAY_NAMES[((dayIndex % 7) + 7) % 7];
}
