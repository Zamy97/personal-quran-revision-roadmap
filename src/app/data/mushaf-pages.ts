import { environment } from '../../environments/environment';

/**
 * Local 15-line Tajweed Color Quran PDF (656 pages).
 * Prefer environment.mushafPdfUrl when hosting remotely; otherwise local assets.
 *
 * Surah start pages are converted from the classic Madinah 604-page index
 * into this 656-page edition so "Open Mushaf" lands near the right spot.
 */
const MADINAH_SURAH_START_PAGE: number[] = [
  0, // unused (1-indexed)
  1, 2, 50, 77, 106, 128, 151, 177, 187, 208, 221, 235, 249, 255, 262, 267,
  282, 293, 305, 312, 322, 332, 342, 350, 359, 367, 377, 385, 396, 404, 411,
  415, 418, 428, 434, 440, 446, 453, 458, 467, 477, 483, 489, 496, 499, 502,
  507, 511, 515, 518, 520, 523, 526, 528, 531, 534, 537, 542, 545, 549, 551,
  553, 554, 556, 558, 560, 562, 564, 566, 568, 570, 572, 574, 575, 577, 578,
  580, 582, 583, 585, 586, 587, 587, 589, 590, 591, 591, 592, 593, 594, 595,
  595, 596, 596, 597, 597, 598, 598, 599, 599, 600, 600, 601, 601, 601, 602,
  602, 602, 603, 603, 603, 604, 604, 604
];

export const TOTAL_MUSHAF_PAGES = 656;
const MADINAH_TOTAL_PAGES = 604;

const LOCAL_MUSHAF_PDF_PATH =
  '/assets/quran/TAJWEED%20COLOR%20QURAN%20-%2015%20LINES.pdf';

/** PDF URL used by the in-app viewer (remote env URL or local assets). */
export const MUSHAF_PDF_PATH =
  (environment.mushafPdfUrl || '').trim() || LOCAL_MUSHAF_PDF_PATH;

export function madinahToLocalPage(madinahPage: number): number {
  const p = Math.max(1, Math.min(MADINAH_TOTAL_PAGES, Math.floor(madinahPage)));
  return Math.max(
    1,
    Math.min(
      TOTAL_MUSHAF_PAGES,
      Math.round(((p - 1) * (TOTAL_MUSHAF_PAGES - 1)) / (MADINAH_TOTAL_PAGES - 1)) + 1
    )
  );
}

export function startPageForSurah(surahNumber: number): number {
  if (surahNumber < 1 || surahNumber > 114) {
    return 1;
  }
  return madinahToLocalPage(MADINAH_SURAH_START_PAGE[surahNumber] || 1);
}

/** Direct PDF link opened at a specific page (browser viewer / full screen). */
export function mushafViewerUrl(page: number): string {
  const p = Math.max(1, Math.min(TOTAL_MUSHAF_PAGES, Math.floor(page)));
  return `${MUSHAF_PDF_PATH}#page=${p}`;
}
