import { GlobalWorkerOptions } from 'pdfjs-dist';

/**
 * Point PDF.js at a real Worker instead of `import(workerSrc)`.
 * That avoids Vite's "dynamic import cannot be analyzed" warning.
 */
export function configurePdfWorker(): void {
  if (typeof Worker === 'undefined') {
    return;
  }
  if (GlobalWorkerOptions.workerPort) {
    return;
  }

  GlobalWorkerOptions.workerPort = new Worker(
    '/assets/quran/pdf.worker.min.mjs',
    { type: 'module' }
  );
}
