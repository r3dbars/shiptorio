# Public landing page (shiptorio.com)

Task 20, 2026-10-26. shiptorio.com is now public at `/`; the app stays behind the preview password.

- **Page:** `web/public/welcome/index.html`, plain static HTML (no React bundle), inline CSS. Vite copies `web/public/` to `web/dist/` as-is.
- **Look (Oct 26):** Black Iron (`docs/art/IRON-STYLE.md`): furnace sky hero, riveted plates, Silkscreen headings,
  JetBrains Mono body (both from `/fonts/*`, public past the gate), amber primary, aether-teal links, the wordmark
  from `/brand/wordmark.svg`. The tokens are inlined (same hex as `web/src/iron.css`); the page loads no app CSS.
  The video nameplate is a machine chip: IDLE on the poster, WORKING while the loop plays. The "loop" section uses
  IDLE / WORKING / NEEDS YOU chips to explain the game. Under reduced motion the chips, belt and ping stand still.
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
- **Video:** `loop.mp4` (1280×720) and `loop-640.mp4` (phones) are 30s of the real Black Iron line
  (`docs/black-iron.html`) rendered frame by frame in headless Playwright (three r128 routed to a local copy,
  `Math.random` seeded, rAF off, `IRON.debug.advance(1/24)` + `IRON.camStep` + `IRON.render` + a screenshot per frame),
  then ffmpeg. Camera tour: LINE → UNDERSIDE (mines, carts, ore lift) → assembler → splitter → launch pad (a NEEDS YOU
  merge hold, then liftoff). HUD/controls hidden, machine chips kept; the word "Spark" is rewritten to "AI" in the
  captured page so it never shows in footage. Posters are frame 0. Step images (`step-ore`, `step-build`,
  `step-follow` = the FOLLOW WORK camera, `step-launch`) are 960×600 stills downscaled to 720×450 webp.
  Desktop autoplays after load; phones start on first scroll/tap; reduced motion / Save-Data wait for Play.
- **Copy rule:** the only model credit is the footer line "powered by Meta Muse Spark". No "Spark" elsewhere.
- **Verified (local wrangler dev):** Lighthouse desktop 100/100/100/100 (LCP 0.5s), mobile 99/100/100/100
  (LCP 2.1s on simulated slow 4G, CLS 0).
