/**
 * Upload 001.pdf … 114.pdf from src/assets/quran/surahs/ to Vercel Blob.
 *
 *   export BLOB_READ_WRITE_TOKEN='…'
 *   npm run upload:mushaf-surahs
 *
 * Then set environment.prod.ts:
 *   mushafSurahPdfBaseUrl: 'https://….public.blob.vercel-storage.com/surahs/'
 */
import { put } from '@vercel/blob';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SURAH_DIR = path.join(__dirname, '..', 'src', 'assets', 'quran', 'surahs');

async function main() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    console.error('Missing BLOB_READ_WRITE_TOKEN.');
    process.exit(1);
  }
  if (!fs.existsSync(path.join(SURAH_DIR, '001.pdf'))) {
    console.error('No surah PDFs found. Split the mushaf first.');
    process.exit(1);
  }

  let lastUrl = '';
  for (let i = 1; i <= 114; i++) {
    const name = `${String(i).padStart(3, '0')}.pdf`;
    const filePath = path.join(SURAH_DIR, name);
    process.stdout.write(`Uploading ${name}… `);
    const blob = await put(`surahs/${name}`, fs.createReadStream(filePath), {
      access: 'public',
      token,
      multipart: true,
      contentType: 'application/pdf',
      addRandomSuffix: false
    });
    lastUrl = blob.url;
    console.log('ok');
  }

  const base = lastUrl.replace(/114\.pdf$/, '');
  console.log('\nDone. Set mushafSurahPdfBaseUrl to:\n');
  console.log(base);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
