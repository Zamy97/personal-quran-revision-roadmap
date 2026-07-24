/**
 * One-shot upload of the local mushaf PDF to Vercel Blob.
 *
 * Setup:
 * 1. vercel login
 * 2. In Vercel Dashboard → Storage → Create Blob store (Public)
 *    Link it to this project and copy BLOB_READ_WRITE_TOKEN
 * 3. export BLOB_READ_WRITE_TOKEN='vercel_blob_rw_…'
 * 4. npm run upload:mushaf
 *
 * Then paste the printed URL into src/environments/environment.prod.ts
 * as mushafPdfUrl and redeploy.
 */
import { put } from '@vercel/blob';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    console.error('Missing BLOB_READ_WRITE_TOKEN.');
    console.error(
      'Create a Blob store in the Vercel dashboard and export the token.'
    );
    process.exit(1);
  }

  const pdfPath = path.join(
    __dirname,
    '..',
    'src',
    'assets',
    'quran',
    'TAJWEED COLOR QURAN - 15 LINES.pdf'
  );
  if (!fs.existsSync(pdfPath)) {
    console.error('PDF not found at', pdfPath);
    process.exit(1);
  }

  const sizeMb = (fs.statSync(pdfPath).size / (1024 * 1024)).toFixed(1);
  console.log(`Uploading mushaf PDF (${sizeMb} MB) to Vercel Blob…`);

  const blob = await put(
    'mushaf/tajweed-15-lines.pdf',
    fs.createReadStream(pdfPath),
    {
      access: 'public',
      token,
      multipart: true,
      contentType: 'application/pdf',
      addRandomSuffix: false
    }
  );

  console.log('\nDone. Public URL:\n');
  console.log(blob.url);
  console.log(
    '\nSet this as mushafPdfUrl in environment.prod.ts, then commit & push.'
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
