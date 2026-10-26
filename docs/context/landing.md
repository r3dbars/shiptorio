# Public landing page (shiptorio.com)

Task 20, 2026-10-26. shiptorio.com is now public at `/`; the app stays behind the preview password.

- **Page:** `web/public/welcome/index.html`, plain static HTML (no React bundle), inline CSS, self-hosted Barlow
  fonts (`font-display: optional`, zero layout shift). Vite copies `web/public/` to `web/dist/` as-is.
- **Routing (`server/src/access.ts` `publicRoute`, `server/src/landing.ts`):**
  - `GET /` with no valid `shiptorio_access` cookie → the landing page (`no-cache`, `Vary: cookie`, CSP).
    With the cookie (or `DEV_LOGIN` on localhost), `/` is the app as before.
  - Public files: `/welcome/*`, `/robots.txt`, `/sitemap.xml` (`public, max-age=3600`, byte ranges for Safari video).
  - `POST /api/waitlist` is public. Everything else (`/index.html`, `/assets/*`, `/api/*`, `/setup`, `/art/`) is still gated.
  - "Sign in" / "Enter the factory" link to `/access?next=%2F`: password form, then the app and its GitHub sign-in (#190 flow).
  - Only a bare `/` (or `utm_*`, `ref`, `joined` params) gets the landing; app deep links like `/?onboard=repo&source=live` still hit the password form with `next` kept.
- **Waitlist:** `server/src/waitlist.ts`, `POST /api/waitlist` (JSON or no-JS form; `email` + hidden `website`
  honeypot). Same-origin only, 5 per IP per hour via signup.ts `admit`, stored with `addPending` in the D1
  `signup_waitlist` table from #161, so landing signups show on `/admin` next to `/waitlist` ones. No Turnstile
  on the landing yet; add the widget there if bots get through.
- **Signup modes:** password mode (default) shows the landing to anyone without the preview cookie. In
  `SIGNUP_GATE_MODE=waitlist`, anyone with a `shiptorio_session` cookie skips the landing for the signup gate.
- **CSP:** security.ts sets `script-src 'self'` site-wide, so the page's JS lives in `/welcome/landing.js`.
- **Video:** `loop.mp4` (1280×720, 3MB) and `loop-640.mp4` (850KB, phones) are 30s of the real sim
  (`?source=sim&scenario=quiet-morning&autolaunch&intro=0`) recorded with Playwright and encoded with ffmpeg.
  Desktop autoplays after load; phones start on first scroll/tap; reduced motion / Save-Data wait for Play.
  To recapture after big art changes, re-record the same URL and replace the files (poster: frame at ~1s).
- **Copy rule:** the only model credit is the footer line "powered by Meta Muse Spark". No "Spark" elsewhere.
- **Verified (local wrangler dev):** Lighthouse desktop 100/100/100/100 (LCP 0.5s), mobile 99/100/100/100
  (LCP 2.1s on simulated slow 4G, CLS 0).
