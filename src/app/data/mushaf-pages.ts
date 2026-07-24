import { environment } from '../../environments/environment';

/**
 * Tajweed Color Quran — 15 lines, 656-page PDF.
 *
 * Quran text starts after 28 front-matter pages:
 *   Al-Fatiha = page 29, Al-Baqarah = page 30
 * Start pages follow the classic Madinah 604-page index + 28.
 * Quran content ends at page 632 (pages 633–656 are back matter).
 */
export const TOTAL_MUSHAF_PAGES = 656;
export const FIRST_QURAN_PAGE = 29;
export const LAST_QURAN_PAGE = 632;

/** Absolute mushaf page where each surah begins (1-indexed; index 0 unused). */
export const SURAH_START_PAGE: number[] = [
  0, 29, 30, 78, 105, 134, 156, 179, 205, 215, 236, 249, 263, 277, 283, 290,
  295, 310, 321, 333, 340, 350, 360, 370, 378, 387, 395, 405, 413, 424, 432,
  439, 443, 446, 456, 462, 468, 474, 481, 486, 495, 505, 511, 517, 524, 527,
  530, 535, 539, 543, 546, 548, 551, 554, 556, 559, 562, 565, 570, 573, 577,
  579, 581, 582, 584, 586, 588, 590, 592, 594, 596, 598, 600, 602, 603, 605,
  606, 608, 610, 611, 613, 614, 615, 615, 617, 618, 619, 619, 620, 621, 622,
  623, 623, 624, 624, 625, 625, 626, 626, 627, 627, 628, 628, 629, 629, 629,
  630, 630, 630, 631, 631, 631, 632, 632, 632
];

/** Last absolute page included in each surah PDF slice. */
export const SURAH_END_PAGE: number[] = [
  0, 29, 77, 104, 133, 155, 178, 204, 214, 235, 248, 262, 276, 282, 289, 294,
  309, 320, 332, 339, 349, 359, 369, 377, 386, 394, 404, 412, 423, 431, 438,
  442, 445, 455, 461, 467, 473, 480, 485, 494, 504, 510, 516, 523, 526, 529,
  534, 538, 542, 545, 547, 550, 553, 555, 558, 561, 564, 569, 572, 576, 578,
  580, 581, 583, 585, 587, 589, 591, 593, 595, 597, 599, 601, 602, 604, 605,
  607, 609, 610, 612, 613, 614, 615, 616, 617, 618, 619, 619, 620, 621, 622,
  623, 623, 624, 624, 625, 625, 626, 626, 627, 627, 628, 628, 629, 629, 629,
  630, 630, 630, 631, 631, 631, 632, 632, 632
];

const LOCAL_MUSHAF_PDF_PATH =
  '/assets/quran/TAJWEED%20COLOR%20QURAN%20-%2015%20LINES.pdf';

/** Full mushaf PDF (remote Blob or local assets). */
export const MUSHAF_PDF_PATH =
  (environment.mushafPdfUrl || '').trim() || LOCAL_MUSHAF_PDF_PATH;

/**
 * Optional base URL for per-surah PDFs (`001.pdf` … `114.pdf`).
 * Example: https://….public.blob.vercel-storage.com/surahs/
 * Empty = use the full mushaf PDF and jump to the surah start page.
 */
export const MUSHAF_SURAH_PDF_BASE = (
  environment.mushafSurahPdfBaseUrl || ''
).trim();

export function startPageForSurah(surahNumber: number): number {
  if (surahNumber < 1 || surahNumber > 114) {
    return FIRST_QURAN_PAGE;
  }
  return SURAH_START_PAGE[surahNumber] || FIRST_QURAN_PAGE;
}

export function endPageForSurah(surahNumber: number): number {
  if (surahNumber < 1 || surahNumber > 114) {
    return LAST_QURAN_PAGE;
  }
  return SURAH_END_PAGE[surahNumber] || LAST_QURAN_PAGE;
}

export function pageCountForSurah(surahNumber: number): number {
  return endPageForSurah(surahNumber) - startPageForSurah(surahNumber) + 1;
}

export function surahPdfFileName(surahNumber: number): string {
  const n = Math.max(1, Math.min(114, Math.floor(surahNumber)));
  return `${String(n).padStart(3, '0')}.pdf`;
}

/** PDF URL for a surah slice, or the full mushaf when base is unset. */
export function mushafPdfUrlForSurah(surahNumber: number): string {
  if (MUSHAF_SURAH_PDF_BASE) {
    const base = MUSHAF_SURAH_PDF_BASE.endsWith('/')
      ? MUSHAF_SURAH_PDF_BASE
      : `${MUSHAF_SURAH_PDF_BASE}/`;
    return `${base}${surahPdfFileName(surahNumber)}`;
  }
  return MUSHAF_PDF_PATH;
}

/** Whether the viewer loads a single-surah PDF (page 1 = start of surah). */
export function usesPerSurahPdf(): boolean {
  return !!MUSHAF_SURAH_PDF_BASE;
}

/** Absolute mushaf page → page index inside the active PDF document. */
export function documentPageForMushafPage(
  surahNumber: number,
  mushafPage: number
): number {
  if (!usesPerSurahPdf()) {
    return Math.max(1, Math.min(TOTAL_MUSHAF_PAGES, mushafPage));
  }
  const start = startPageForSurah(surahNumber);
  const count = pageCountForSurah(surahNumber);
  return Math.max(1, Math.min(count, mushafPage - start + 1));
}

/** Direct PDF link (browser / full screen). */
export function mushafViewerUrl(page: number, surahNumber?: number): string {
  if (surahNumber && usesPerSurahPdf()) {
    const docPage = documentPageForMushafPage(surahNumber, page);
    return `${mushafPdfUrlForSurah(surahNumber)}#page=${docPage}`;
  }
  const p = Math.max(1, Math.min(TOTAL_MUSHAF_PAGES, Math.floor(page)));
  return `${MUSHAF_PDF_PATH}#page=${p}`;
}
