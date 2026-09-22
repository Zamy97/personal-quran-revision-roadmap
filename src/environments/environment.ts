export const environment = {
  production: false,
  /** Empty = same-origin `/api` via `proxy.conf.json` → localhost:8084 */
  apiBaseUrl: '',
  /** Per-surah PDFs from the local surahs list (001.pdf…114.pdf). */
  mushafSurahPdfBaseUrl: '/assets/quran/surahs/'
};
