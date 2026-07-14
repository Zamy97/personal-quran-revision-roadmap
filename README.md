# Quran Revision Roadmap

Angular app for tracking a personal Quran memorization journey: daily **Sabaq**, **Sabqi**, and weekly **Manzil** loops.

Progress is stored in the browser (`localStorage`). No backend required. Export/import JSON backups anytime.

## Local development

```bash
npm install
npm start
```

Open `http://localhost:4200/`.

## Build

```bash
npm run build
```

Output: `dist/quran-revision-roadmap/browser`

## Push to GitHub

```bash
cd Quran_Revision_Roadmap
git init
git add .
git commit -m "Initial Quran revision roadmap tracker"
gh repo create Quran_Revision_Roadmap --public --source=. --remote=origin --push
```

Or create an empty repo on GitHub, then:

```bash
git remote add origin https://github.com/<your-user>/Quran_Revision_Roadmap.git
git branch -M main
git push -u origin main
```

## Deploy on Vercel

1. Import the GitHub repo in [Vercel](https://vercel.com/new).
2. Framework preset can be **Other** — `vercel.json` already sets:
   - Build command: `npm run build`
   - Output directory: `dist/quran-revision-roadmap/browser`
3. Deploy. No environment variables needed.

CLI option:

```bash
npx vercel
```

## Features

- Daily checklist for Sabaq (15m), Sabqi (15m), Manzil (30m)
- Weekly Manzil table with today highlighted
- Editable current phase and line/ayah progress
- JSON backup download and restore
