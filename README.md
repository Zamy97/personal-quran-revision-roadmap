# Quran Revision Roadmap

Angular app for a personal Quran memorization journey: weekly manzil revision, mushaf viewer, Memorize (EveryAyah + mic practice), and Memorized portions.

**Auth** matches the budget / personal-hub pattern: email + password JWT via [`quran-revision-api`](../quran-revision-api). Progress syncs to the API per user. The **first** signup on a fresh database can claim existing browser `localStorage` progress.

## Local development

Terminal 1 — API (port **8084**):

```bash
cd ../quran-revision-api
./mvnw spring-boot:run
```

Terminal 2 — site:

```bash
npm install
npm start
```

Open `http://localhost:4200/`. Dev proxy forwards `/api` → `http://localhost:8084`.

Leave `APP_SIGNUP_INVITE_CODE` empty for open signup locally. Set it when you deploy so classmates need an invite.

## Build

```bash
npm run build
```

Output: `dist/quran-revision-roadmap/browser`

## Deploy

1. Deploy **quran-revision-api** on Render (Docker) with Neon Postgres — see that repo’s README.
2. Set `apiBaseUrl` in `src/environments/environment.prod.ts` to the Render URL.
3. Import this repo in Vercel (`vercel.json` already configures build/output).
4. Add the Vercel origin to the API’s `APP_CORS_ALLOWED_ORIGINS`.

## Features

- Sign in / sign up (optional invite code)
- Weekly revision roadmap + Listen & Mushaf
- Memorize tab (IntelliJ-style audio, mushaf follow, mic recite-along)
- Memorized portions by juz
- Progress backup / restore (also synced to your account when signed in)
