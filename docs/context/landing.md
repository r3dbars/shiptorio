# Public landing page (shiptorio.com)

Task 20, 2026-10-26. shiptorio.com is now public at `/`; the app stays behind the preview password.

- **Page:** `web/public/welcome/index.html`, plain static HTML (no React bundle), inline CSS, self-hosted Barlow
  fonts (`font-display: optional`, zero layout shift). Vite copies `web/public/` to `web/dist/` as-is.
- **Routing (`server/src/access.ts` `publicRoute`, `server/src/landing.ts`):**
  - `GET /` with no valid `shiptorio_access` cookie → the landing page (`no-cache`, `Vary: cookie`, CSP).
    With the cookie (or `DEV_LOGIN` on localhost), `/` is the app as before.
  - Public files: `/welcome/*`, `/robots.txt`, `/sitemap.xml` (`public, max-age=3600`, byte ranges for Safari video).
  - `POST /api/waitlist` is public. Everything else (`/index.html`, `/assets/*`, `/api/*`, `/setup`, `/art/`) is still gated.
  - "Enter the factory" links to `/access?next=%2F`, which shows the password form and lands on the app.
- **Waitlist:** `server/src/waitlist.ts`. JSON or form post `{email, website (honeypot), ref}`. Stored in KV
  `CACHE` as `waitlist:email:<email>` → `{email, at, ref}`, 5 tries per IP per hour, same-origin only.
  **Codex goal 12 (PR #161, D1 `signup_waitlist` + Turnstile) can take this route over**: import the KV keys
  (`wrangler kv key list --binding CACHE --prefix waitlist:email:`) and point `joinWaitlist` at `addPending`.
- **Video:** `loop.mp4` (1280×720, 3MB) and `loop-640.mp4` (850KB, phones) are 30s of the real sim
  (`?source=sim&scenario=quiet-morning&autolaunch&intro=0`) recorded with Playwright and encoded with ffmpeg.
  Desktop autoplays after load; phones start on first scroll/tap; reduced motion / Save-Data wait for Play.
  To recapture after big art changes, re-record the same URL and replace the files (poster: frame at ~1s).
- **Copy rule:** the only model credit is the footer line "powered by Meta Muse Spark". No "Spark" elsewhere.
- **Verified (local wrangler dev):** Lighthouse desktop 100/100/100/100 (LCP 0.5s), mobile 99/100/100/100
  (LCP 2.1s on simulated slow 4G, CLS 0).
