export const environment = {
  production: true,
  /**
   * Render (or other) URL for quran-revision-api — no trailing slash.
   * Example: https://quran-revision-api.onrender.com
   */
  apiBaseUrl: 'https://quran-revision-api.onrender.com',
  /**
   * Per-surah PDFs shipped with the site at /assets/quran/surahs/.
   * Override with a Blob/CDN folder URL if you host them separately.
   */
  mushafSurahPdfBaseUrl: '/assets/quran/surahs/'
};
