# Local / remote mushaf PDF

## Anchors (this edition)

- Al-Fatiha → page **29**/656  
- Al-Baqarah → page **30**/656  
- Quran text ≈ pages **29–632** (Madinah index + 28)

## Per-surah splits (local)

`surahs/001.pdf` … `surahs/114.pdf` (~108MB total) are generated locally and
**gitignored**. Upload them to Blob when you want faster per-chapter loads:

```bash
export BLOB_READ_WRITE_TOKEN='…'
npm run upload:mushaf-surahs
```

Then set `mushafSurahPdfBaseUrl` in `environment.prod.ts` to the printed folder URL.

Until then, the app uses the full Blob PDF with the corrected surah start pages.
