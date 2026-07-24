# Local / remote mushaf PDF

## Local file (dev)

Keep your personal copy here as:

`TAJWEED COLOR QURAN - 15 LINES.pdf`

It is **gitignored** (~123MB). GitHub rejects normal git files over 100MB.

## Remote backup on GitHub

Use a **Release asset** (supports up to 2GB), not a normal commit:

```bash
gh auth login
gh release create mushaf-pdf \
  --title "Tajweed 15-line mushaf PDF" \
  --notes "Personal mushaf backup for the revision roadmap." \
  "src/assets/quran/TAJWEED COLOR QURAN - 15 LINES.pdf"
```

## Host for the live app

PDF.js needs a public HTTPS URL with **CORS** and **HTTP range** support.

Good options: Cloudflare R2, AWS S3, Backblaze B2.

Then set the URL in:

- `src/environments/environment.prod.ts` → `mushafPdfUrl: 'https://…/file.pdf'`
- Optionally the same in `environment.ts` for local testing against the remote file

Leave `mushafPdfUrl` empty to use the local assets file during `ng serve`.
