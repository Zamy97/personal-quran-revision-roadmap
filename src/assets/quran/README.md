# Local / remote mushaf PDF

## Local file (dev)

Keep your personal copy here as:

`TAJWEED COLOR QURAN - 15 LINES.pdf`

It is **gitignored** (~123MB). GitHub rejects normal git files over 100MB, and
GitHub’s web Release upload caps at **25MB**.

## Host on Vercel (recommended)

Do **not** put the PDF in the website deploy (Hobby deploy limit is ~100MB).
Use **Vercel Blob** instead:

1. [vercel.com](https://vercel.com) → your project → **Storage** → create a **Blob** store (Public)
2. Copy `BLOB_READ_WRITE_TOKEN`
3. From this repo:

```bash
vercel login
export BLOB_READ_WRITE_TOKEN='vercel_blob_rw_…'
npm run upload:mushaf
```

4. Paste the printed URL into `src/environments/environment.prod.ts` as `mushafPdfUrl`
5. Commit, push, and let Vercel redeploy

PDF.js needs **HTTPS + CORS + range requests** — public Blob URLs support that.
