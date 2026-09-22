import { pageCountForSurah, startPageForSurah, endPageForSurah } from './mushaf-pages';
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
 * Split memorized surahs into a mirrored 3-day loop (Mon=Thu, Tue=Fri, Wed=Sat).
 * Uses contiguous/juz-aware chunks + page balancing (see partitionIntoThree).
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

/**
 * Thoughtful 3-way split (mirrors the hand-built house plan ideas):
 * 1. Keep contiguous runs / same-juz blocks together when possible
 * 2. Prefer giving a solid Juz 30 block its own day (Wed/Sat)
 * 3. Pack remaining chunks by mushaf page weight onto the lightest days
 * 4. Local moves to even out volume without scattering a juz
 */
function partitionIntoThree(surahs: number[]): [number[], number[], number[]] {
  if (!surahs.length) {
    return [[], [], []];
  }

  const juz30: number[] = [];
  const rest: number[] = [];
  for (const n of surahs) {
    if (n >= 78 && n <= 114) {
      juz30.push(n);
    } else {
      rest.push(n);
    }
  }

  const buckets: number[][] = [[], [], []];
  const weights = [0, 0, 0];

  const juz30Weight = totalWeight(juz30);
  const restWeight = totalWeight(rest);
  const total = juz30Weight + restWeight;
  const target = total / 3;

  // House-style: a meaningful Juz 30 set gets its own revision day.
  const reserveJuz30 =
    juz30.length > 0 &&
    (juz30.length >= 20 ||
      juz30Weight >= Math.max(12, target * 0.55) ||
      (juz30.length === JUZ_30_SURAHS.length &&
        JUZ_30_SURAHS.every((n) => juz30.includes(n))));

  if (reserveJuz30) {
    placeInBucket(buckets, weights, 2, juz30);
  } else if (juz30.length) {
    rest.push(...juz30);
    rest.sort((a, b) => a - b);
  }

  const chunks = buildRevisionChunks(rest);

  // If we reserved Juz 30, pack everything else into days 0 & 1 first;
  // only overflow into day 2 when those two are clearly heavier.
  const preferredSlots = reserveJuz30 ? [0, 1] : [0, 1, 2];
  const orderedChunks = [...chunks].sort(
    (a, b) => b.weight - a.weight || a.surahs[0] - b.surahs[0]
  );

  for (const chunk of orderedChunks) {
    const slot = pickLightestSlot(weights, preferredSlots, reserveJuz30 ? 2 : -1);
    placeInBucket(buckets, weights, slot, chunk.surahs);
  }

  improveBalance(buckets, weights, reserveJuz30 ? 2 : -1);

  return [
    buckets[0].sort((a, b) => a - b),
    buckets[1].sort((a, b) => a - b),
    buckets[2].sort((a, b) => a - b)
  ];
}

interface RevisionChunk {
  surahs: number[];
  weight: number;
  juz: number;
}

/** Contiguous / same-juz blocks; oversized runs split at a page midpoint. */
function buildRevisionChunks(surahs: number[]): RevisionChunk[] {
  const sorted = normalizeSurahList(surahs);
  if (!sorted.length) {
    return [];
  }

  const runs: number[][] = [];
  let current: number[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const n = sorted[i];
    const contiguous = n === prev + 1;
    const sameJuz = juzForSurah(n) === juzForSurah(prev);
    if (contiguous || sameJuz) {
      current.push(n);
    } else {
      runs.push(current);
      current = [n];
    }
  }
  runs.push(current);

  const total = totalWeight(sorted);
  const maxChunk = Math.max(10, total / 3 + 4);
  const chunks: RevisionChunk[] = [];

  for (const run of runs) {
    for (const piece of splitHeavyRun(run, maxChunk)) {
      chunks.push({
        surahs: piece,
        weight: totalWeight(piece),
        juz: juzForSurah(piece[0])
      });
    }
  }
  return chunks;
}

/** Split a long contiguous run into page-balanced contiguous pieces. */
function splitHeavyRun(run: number[], maxChunk: number): number[][] {
  const weight = totalWeight(run);
  if (run.length <= 1 || weight <= maxChunk) {
    return [run];
  }

  let bestSplit = Math.max(1, Math.floor(run.length / 2));
  let bestDiff = Number.POSITIVE_INFINITY;
  let left = 0;
  for (let i = 0; i < run.length - 1; i++) {
    left += surahWeight(run[i]);
    const right = weight - left;
    const diff = Math.abs(left - right);
    const leftCount = i + 1;
    const rightCount = run.length - leftCount;
    // Avoid peeling off a single tiny surah when the run is long.
    const balancedCounts =
      run.length <= 3 || (leftCount >= 2 && rightCount >= 2);
    if (diff < bestDiff && balancedCounts) {
      bestDiff = diff;
      bestSplit = leftCount;
    }
  }

  const leftRun = run.slice(0, bestSplit);
  const rightRun = run.slice(bestSplit);
  return [
    ...splitHeavyRun(leftRun, maxChunk),
    ...splitHeavyRun(rightRun, maxChunk)
  ];
}

function pickLightestSlot(
  weights: number[],
  preferred: number[],
  reservedHeavy: number
): number {
  let best = preferred[0];
  for (const i of preferred) {
    if (weights[i] < weights[best]) {
      best = i;
    }
  }

  // Overflow into the reserved Juz-30 day only when preferred days are much heavier.
  if (
    reservedHeavy >= 0 &&
    !preferred.includes(reservedHeavy) &&
    weights[best] > weights[reservedHeavy] + 6
  ) {
    return reservedHeavy;
  }
  return best;
}

function placeInBucket(
  buckets: number[][],
  weights: number[],
  slot: number,
  surahs: number[]
): void {
  buckets[slot].push(...surahs);
  weights[slot] += totalWeight(surahs);
}

/**
 * Try moving same-juz contiguous groups between days to shrink the heaviest/lightest gap.
 * Does not break reserved Juz 30 when `reservedSlot` is set (moves only non-juz-30 out/in carefully).
 */
function improveBalance(
  buckets: number[][],
  weights: number[],
  reservedSlot: number
): void {
  for (let pass = 0; pass < 4; pass++) {
    let improved = false;
    const heavy = indexOfMax(weights);
    const light = indexOfMin(weights);
    if (weights[heavy] - weights[light] < 3) {
      return;
    }

    const movable = extractMoveCandidates(buckets[heavy], reservedSlot === heavy);
    for (const group of movable) {
      const w = totalWeight(group);
      // Only move if it actually evens things out.
      const newHeavy = weights[heavy] - w;
      const newLight = weights[light] + w;
      const before = weights[heavy] - weights[light];
      const after = Math.abs(newHeavy - newLight);
      if (after + 0.5 < before && newLight - newHeavy < before) {
        // Apply move
        const heavySet = new Set(group);
        buckets[heavy] = buckets[heavy].filter((n) => !heavySet.has(n));
        buckets[light].push(...group);
        weights[heavy] -= w;
        weights[light] += w;
        improved = true;
        break;
      }
    }
    if (!improved) {
      return;
    }
  }
}

function extractMoveCandidates(bucket: number[], protectJuz30: boolean): number[][] {
  const sorted = [...bucket].sort((a, b) => a - b);
  const usable = protectJuz30
    ? sorted.filter((n) => n < 78 || n > 114)
    : sorted;
  if (!usable.length) {
    return [];
  }

  // Prefer moving small contiguous tails / solos rather than ripping a whole juz.
  const groups: number[][] = [];
  let current: number[] = [usable[0]];
  for (let i = 1; i < usable.length; i++) {
    if (
      usable[i] === usable[i - 1] + 1 &&
      juzForSurah(usable[i]) === juzForSurah(usable[i - 1])
    ) {
      current.push(usable[i]);
    } else {
      groups.push(current);
      current = [usable[i]];
    }
  }
  groups.push(current);

  // Try lighter groups first (less disruptive).
  return groups.sort((a, b) => totalWeight(a) - totalWeight(b) || a.length - b.length);
}

function totalWeight(surahs: number[]): number {
  return readingPages(surahs);
}

/**
 * Realistic mushaf page volume. Contiguous / same-juz sets use the span from
 * first start page → last end page (avoids double-counting short surahs that
 * share a page). Scattered surahs fall back to summing each surah’s pages.
 */
function readingPages(surahs: number[]): number {
  if (!surahs.length) {
    return 0;
  }
  const sorted = [...surahs].sort((a, b) => a - b);
  const contiguous = sorted.every(
    (n, i) => i === 0 || n === sorted[i - 1] + 1
  );
  const sameJuz = sorted.every(
    (n) => juzForSurah(n) === juzForSurah(sorted[0])
  );
  if (contiguous || sameJuz) {
    const start = startPageForSurah(sorted[0]);
    const end = endPageForSurah(sorted[sorted.length - 1]);
    return Math.max(1, end - start + 1);
  }
  return sorted.reduce((sum, n) => sum + surahWeight(n), 0);
}

function indexOfMax(values: number[]): number {
  let best = 0;
  for (let i = 1; i < values.length; i++) {
    if (values[i] > values[best]) {
      best = i;
    }
  }
  return best;
}

function indexOfMin(values: number[]): number {
  let best = 0;
  for (let i = 1; i < values.length; i++) {
    if (values[i] < values[best]) {
      best = i;
    }
  }
  return best;
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

  const pages = readingPages(sorted);
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
