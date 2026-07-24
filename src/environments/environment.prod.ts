export const environment = {
  production: true,
  /**
   * Full mushaf PDF on Vercel Blob (CORS + range requests for PDF.js).
   */
  mushafPdfUrl:
    'https://p9iodc7pzt5v2a3e.public.blob.vercel-storage.com/TAJWEED%20COLOR%20QURAN%20-%2015%20LINES.pdf',
  /**
   * Optional folder of 001.pdf…114.pdf on Blob. Empty = use full PDF + page map.
   * Example: 'https://….public.blob.vercel-storage.com/surahs/'
   */
  mushafSurahPdfBaseUrl: ''
};
