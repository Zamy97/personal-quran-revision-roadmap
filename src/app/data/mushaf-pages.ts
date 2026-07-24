import { environment } from '../../environments/environment';

/**
 * Tajweed Color Quran — per-surah PDFs in /assets/quran/surahs/ (001.pdf…114.pdf).
 *
 * Absolute page anchors (for split generation / reference only):
 *   Al-Fatiha = 29, Al-Baqarah = 30, Ad-Dukhan = 523–526, last = 632
 */
export const TOTAL_MUSHAF_PAGES = 656;
export const FIRST_QURAN_PAGE = 29;
export const LAST_QURAN_PAGE = 632;

/** Absolute mushaf page where each surah begins (used to size each slice). */
export const SURAH_START_PAGE: number[] = [
  0, 29, 30, 78, 105, 134, 156, 179, 205, 215, 236, 249, 263, 276, 282, 289,
  294, 309, 320, 332, 339, 349, 359, 369, 377, 386, 394, 404, 412, 423, 431,
  438, 442, 445, 455, 461, 467, 473, 480, 485, 494, 504, 510, 516, 523, 527,
  529, 534, 538, 542, 545, 547, 550, 553, 555, 558, 561, 564, 569, 572, 576,
  579, 581, 582, 584, 586, 588, 590, 592, 594, 596, 598, 600, 602, 603, 605,
  606, 608, 610, 611, 613, 614, 615, 615, 617, 618, 619, 619, 620, 621, 622,
  623, 623, 624, 624, 625, 625, 626, 626, 627, 627, 628, 628, 629, 629, 629,
  630, 630, 630, 631, 631, 631, 632, 632, 632
];

/** Last absolute page included in each surah PDF slice. */
export const SURAH_END_PAGE: number[] = [
  0, 29, 77, 104, 133, 155, 178, 204, 214, 235, 248, 262, 275, 281, 288, 293,
  308, 319, 331, 338, 348, 358, 368, 376, 385, 393, 403, 411, 422, 430, 437,
  441, 444, 454, 460, 466, 472, 479, 484, 493, 503, 509, 515, 522, 526, 528,
  533, 537, 541, 544, 546, 549, 552, 554, 557, 560, 563, 568, 571, 575, 578,
  580, 581, 583, 585, 587, 589, 591, 593, 595, 597, 599, 601, 602, 604, 605,
  607, 609, 610, 612, 613, 614, 615, 616, 617, 618, 619, 619, 620, 621, 622,
  623, 623, 624, 624, 625, 625, 626, 626, 627, 627, 628, 628, 629, 629, 629,
  630, 630, 630, 631, 631, 631, 632, 632, 632
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

/**
 * Page index inside the surah PDF (1-based).
 * `pageWithinSurah` is already relative when using the surahs list.
 */
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
