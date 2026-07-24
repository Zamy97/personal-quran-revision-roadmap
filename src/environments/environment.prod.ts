export const environment = {
  production: true,
  /**
   * Full mushaf PDF fallback (Vercel Blob).
   */
  mushafPdfUrl:
    'https://p9iodc7pzt5v2a3e.public.blob.vercel-storage.com/TAJWEED%20COLOR%20QURAN%20-%2015%20LINES.pdf',
  /**
   * Per-surah PDFs (001.pdf…114.pdf) from the repo via jsDelivr CDN.
   */
  mushafSurahPdfBaseUrl:
    'https://cdn.jsdelivr.net/gh/Zamy97/personal-quran-revision-roadmap@main/src/assets/quran/surahs/'
};
