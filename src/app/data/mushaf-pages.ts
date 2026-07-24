import { environment } from '../../environments/environment';

/**
 * Tajweed Color Quran — per-surah PDFs in /assets/quran/surahs/ (001.pdf…114.pdf).
 *
 * Page ranges verified manually against this edition (PDF page numbers).
 * Quran text spans pages 29–638.
 */
export const TOTAL_MUSHAF_PAGES = 656;
export const FIRST_QURAN_PAGE = 29;
export const LAST_QURAN_PAGE = 638;

/** Absolute mushaf page where each surah begins (1-indexed; index 0 unused). */
export const SURAH_START_PAGE: number[] = [
  0, 29, 30, 78, 105, 135, 156, 179, 205, 215, 236, 250, 264, 277, 283, 289,
  295, 310, 321, 333, 340, 350, 359, 370, 378, 387, 394, 404, 413, 424, 432,
  439, 443, 445, 456, 462, 468, 473, 480, 486, 495, 505, 511, 517, 523, 526,
  530, 534, 539, 543, 546, 548, 551, 554, 556, 559, 562, 565, 570, 573, 577,
  579, 581, 582, 584, 586, 588, 590, 592, 595, 597, 599, 601, 604, 606, 608,
  610, 612, 614, 615, 617, 618, 619, 620, 622, 623, 624, 625, 625, 626, 628,
  628, 629, 630, 630, 631, 631, 632, 632, 633, 633, 634, 634, 635, 635, 635,
  636, 636, 636, 636, 637, 637, 637, 638, 638
];

/** Last absolute page included in each surah PDF slice. */
export const SURAH_END_PAGE: number[] = [
  0, 29, 77, 104, 134, 155, 178, 204, 214, 235, 249, 263, 276, 283, 289, 295,
  309, 320, 333, 340, 349, 359, 369, 377, 387, 394, 404, 413, 424, 432, 439,
  442, 445, 455, 462, 468, 473, 480, 486, 495, 504, 510, 517, 523, 526, 529,
  534, 538, 543, 545, 548, 551, 553, 556, 559, 562, 565, 569, 573, 576, 579,
  581, 582, 583, 585, 587, 589, 592, 595, 597, 599, 601, 604, 605, 608, 609,
  612, 613, 615, 617, 618, 619, 620, 622, 623, 624, 625, 625, 626, 627, 628,
  629, 630, 630, 630, 631, 632, 632, 633, 633, 634, 634, 634, 635, 635, 635,
  636, 636, 636, 637, 637, 637, 637, 638, 638
];

const DEFAULT_SURAH_PDF_BASE = '/assets/quran/surahs/';

/** Folder of 001.pdf…114.pdf (local assets or hosted CDN/Blob). */
export const MUSHAF_SURAH_PDF_BASE = (
  environment.mushafSurahPdfBaseUrl || DEFAULT_SURAH_PDF_BASE
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

/** Pages inside that surah’s PDF (1…N). */
export function pageCountForSurah(surahNumber: number): number {
  return Math.max(
    1,
    endPageForSurah(surahNumber) - startPageForSurah(surahNumber) + 1
  );
}

export function surahPdfFileName(surahNumber: number): string {
  const n = Math.max(1, Math.min(114, Math.floor(surahNumber)));
  return `${String(n).padStart(3, '0')}.pdf`;
}

/** Always loads the matching file from the surahs list. */
export function mushafPdfUrlForSurah(surahNumber: number): string {
  const base = MUSHAF_SURAH_PDF_BASE.endsWith('/')
    ? MUSHAF_SURAH_PDF_BASE
    : `${MUSHAF_SURAH_PDF_BASE}/`;
  return `${base}${surahPdfFileName(surahNumber)}`;
}

/** Page index inside the surah PDF (1-based). */
export function documentPageForSurah(
  surahNumber: number,
  pageWithinSurah: number
): number {
  const count = pageCountForSurah(surahNumber);
  return Math.max(1, Math.min(count, Math.floor(pageWithinSurah)));
}

/** Direct PDF link (browser / full screen) at a page within the surah file. */
export function mushafViewerUrl(
  pageWithinSurah: number,
  surahNumber?: number
): string {
  const surah = surahNumber && surahNumber >= 1 ? surahNumber : 1;
  const docPage = documentPageForSurah(surah, pageWithinSurah);
  return `${mushafPdfUrlForSurah(surah)}#page=${docPage}`;
}
