# Public landing page (shiptorio.com)

## Approved landing refresh (2026-10-28)

- Justin selected the transparent brass wordmark, “Build the factory, ship the code.” and one brass “Join the waitlist” button over full-screen gameplay. The email field and Join action open in a native dialog; Escape or the backdrop dismisses it.
- Compact video and sound controls sit together at the top right. Video starts muted; music and effects require an explicit click. Reduced motion and Save-Data retain the poster until playback is requested.
- The subtle footer link opens the existing production password gate at `/access?next=%2F`; signup and authentication handling are unchanged.
- Desktop (1600×900) and phone (600×800) clips were recorded from the game renderer at main `c5e23309f221b4e4397bfc63d497e81a1648ea40`, using its seeded demo driver. The completed merge gate and rocket launch are visible. The 10-second loops crossfade their seam. Audio is a separate 32-second recording of that revision’s procedural music, ambience and sound effects, with staged effect cues. These are game previews, not recordings of real PR activity.
- The refresh is scoped to `web/public/welcome/` and its logo asset; it does not replace the app/password-page branding in PR #467 or the separate layout workshop in #469. Justin explicitly requested this web work outside Codex’s usual backend lane. Checkpoint: October 28 landing-page polish.

## Previous implementation

Task 20, 2026-10-26. shiptorio.com is now public at `/`; the app stays behind the preview password.

- **Page:** `web/public/welcome/index.html`, plain static HTML (no React bundle), inline CSS. Vite copies `web/public/` to `web/dist/` as-is.
- **Look (Oct 27, stripped down):** Justin: "super duper simple, it looks so vibe coded". The page is only the
  wordmark (`/brand/wordmark.svg`), one line ("Your repo is a factory. Teach it to run itself."), the art full bleed,
  one email field + "Get an invite", a small "Sign in" link and the "powered by Meta Muse Spark" credit. No sections,
  no chips, no explainer copy. Desktop: art covers the viewport with soot gradients top and bottom for the words.
  Phones (<760px): words on top, a tall cut of the art fills the middle, form below. Tokens inlined from iron.css.
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
- **Art:** `hero.webp` (1600×900) / `hero-1024.webp` / `hero-phone.webp` (600×800 cut of the dome + rocket) are frame 0
  of `hero.mp4` / `hero-phone.mp4`: 10s of the real Black Iron line (`docs/black-iron.html`), DECK view, fixed camera,
  every overlay (HUD, chips, tags, ticker, controls) hidden. Rendered frame by frame in headless Playwright (three r128
  routed to a local copy, seeded `Math.random`, rAF off, `IRON.debug.advance(1/24)` + `camStep` + `render` + screenshot),
  the last second crossfaded into the first so it loops without a seam, then ffmpeg. The still paints first; the loop
  fades in after load and never under reduced motion or Save-Data. A small pause button sits top right (bottom of the art on phones).
- **Copy rule:** the only model credit is the footer line "powered by Meta Muse Spark". No "Spark" elsewhere.
- **Verified (local wrangler dev):** Lighthouse desktop 100/100/100/100 (LCP 0.5s), mobile 99/100/100/100
  (LCP 2.1s on simulated slow 4G, CLS 0).
