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

const JUZ_30_SURAHS = Array.from({ length: 37 }, (_, i) => 78 + i);

/**
 * Split memorized surahs into a mirrored 3-day loop (Mon=Thu, Tue=Fri, Wed=Sat)
 * balanced by mushaf page volume — same structure as the hand-built weekly plan.
 */
export function buildWeeklyManzil(surahNumbers: number[]): ManzilDay[] {
  const unique = normalizeSurahList(surahNumbers);
  const [bucketA, bucketB, bucketC] = partitionIntoThree(unique);
  const loops = [bucketA, bucketB, bucketC].map((nums) => describeDayFocus(nums));

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

/**
 * Refresh auto-generated "Loop A/B/C" titles on saved plans so the UI matches
 * the descriptive house style (surah / juz names).
 */
export function withDescriptiveDayTitles(days: ManzilDay[]): ManzilDay[] {
  return days.map((day) => {
    if (day.dayIndex === 0) {
      return day;
    }
    if (!isAutoLoopTitle(day.focusTitle)) {
      return day;
    }
    return { ...day, ...describeDayFocus(day.surahNumbers || []) };
  });
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

/** Content-based titles like the hand-built house plan (no Loop A/B/C). */
export function describeDayFocus(
  surahNumbers: number[]
): Omit<ManzilDay, 'day' | 'dayIndex'> {
  const sorted = normalizeSurahList(surahNumbers);
  if (!sorted.length) {
    return {
      focusTitle: 'Open day',
      focusDetail: 'Add more memorized surahs to fill this day',
      estimatedVolume: '—',
      surahNumbers: []
    };
  }

  const pages = sorted.reduce((sum, n) => sum + surahWeight(n), 0);
  const volume = `~${pages} page${pages === 1 ? '' : 's'}`;
  const names = sorted.map((n) => getSurah(n)?.name || String(n));
  const nameDetail =
    names.length <= 6
      ? names.join(', ')
      : `${names.slice(0, 5).join(', ')} + ${names.length - 5} more`;

  if (sorted.length === 1) {
    return {
      focusTitle: formatSurahName(sorted[0]),
      focusDetail: nameDetail,
      estimatedVolume: volume,
      surahNumbers: sorted
    };
  }

  const allJuz30 = sorted.every((n) => n >= 78 && n <= 114);
  const completeJuz30 =
    allJuz30 && JUZ_30_SURAHS.every((n) => sorted.includes(n));
  if (completeJuz30) {
    return {
      focusTitle: 'Juz 30 (Complete)',
      focusDetail: 'Recite the whole Juz (split: half morning / half evening)',
      estimatedVolume: volume,
      surahNumbers: sorted
    };
  }
  if (allJuz30) {
    return {
      focusTitle: `Juz 30 · ${sorted.length} surahs`,
      focusDetail: nameDetail,
      estimatedVolume: volume,
      surahNumbers: sorted
    };
  }

  const byJuz = new Map<number, number[]>();
  for (const n of sorted) {
    const juz = juzForSurah(n);
    const list = byJuz.get(juz) ?? [];
    list.push(n);
    byJuz.set(juz, list);
  }
  const juzEntries = [...byJuz.entries()].sort((a, b) => a[0] - b[0]);

  if (juzEntries.length === 1) {
    const [juz, list] = juzEntries[0];
    return {
      focusTitle: `Juz ${juz} · ${list.length} surahs`,
      focusDetail: nameDetail,
      estimatedVolume: volume,
      surahNumbers: sorted
    };
  }

  // Mixed buckets: name lone surahs, label denser juz groups — e.g. "Surah Yasin & Juz 29"
  const namedLeads: string[] = [];
  const juzChunks: string[] = [];
  for (const [juz, list] of juzEntries) {
    if (list.length === 1 && juz !== 30) {
      namedLeads.push(formatSurahName(list[0]));
    } else if (juz === 30) {
      juzChunks.push(
        list.length >= 30 ? 'Juz 30' : `Juz 30 (${list.length} surahs)`
      );
    } else if (list.length >= 3) {
      juzChunks.push(`Juz ${juz}`);
    } else {
      namedLeads.push(...list.map((n) => formatSurahName(n)));
    }
  }

  const parts = [...namedLeads, ...juzChunks];
  let focusTitle: string;
  if (parts.length === 0) {
    focusTitle = `${sorted.length} surahs`;
  } else if (parts.length === 1) {
    focusTitle = parts[0];
  } else if (parts.length === 2) {
    focusTitle = `${parts[0]} & ${parts[1]}`;
  } else if (parts.length === 3) {
    focusTitle = `${parts[0]}, ${parts[1]} & ${parts[2]}`;
  } else {
    focusTitle = `${parts[0]}, ${parts[1]} & more`;
  }

  return {
    focusTitle,
    focusDetail: nameDetail,
    estimatedVolume: volume,
    surahNumbers: sorted
  };
}

function isAutoLoopTitle(title: string | undefined): boolean {
  if (!title) {
    return true;
  }
  return /^Loop\s+[ABC]\b/i.test(title.trim());
}

/** @deprecated keep DAY_NAMES referenced for clarity if needed later */
export function weekdayName(dayIndex: number): string {
  return DAY_NAMES[((dayIndex % 7) + 7) % 7];
}
