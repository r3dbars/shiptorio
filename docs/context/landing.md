# Public landing page (shiptorio.com)

## shiptorio.dev: tutorial first, password at "create your factory" (2026-10-29)

- Justin: anyone who visits shiptorio.dev goes straight into the tutorial. No password, waitlist or landing page in front.
- Public on shiptorio.dev only (GET/HEAD): `/` (302 to `/deck?source=live`), `/deck`, `/deck.html`, `/deck/{art,px,traces}/*` and the already-public hashed `/assets/*`, `/fonts/*`, `/brand/*`. See `server/src/access.ts` `isPublicDeck`; the route table is `server/test/public-deck.test.ts`.
- Everything else still needs the preview password, exactly as before: `/api/*` (including `/api/me`, so anonymous visitors create no guest rows), `/auth/callback`, `/connect/*`, runner, sockets, admin, the old app. The tutorial is scripted in the page, so it makes no Spark calls.
- The password is asked at the sign-in card after the tutorial (story-connect → "Sign in to your factory" → Sign in). The deck shows a small popup (`web/src/deck2d/password.ts`) that posts the same `/access` form, then goes to `/auth/login`. A browser that already has the password skips the popup.
- shiptorio.com is unchanged (landing + gate) until Justin asks for a promotion.

## Approved landing refresh (2026-10-28)

- Justin selected the transparent brass wordmark, “Build the factory, ship the code.” and one brass “Join the waitlist” button over full-screen gameplay. The email field and Join action open in a native dialog; Escape or the backdrop dismisses it.
- Compact video and sound controls sit together at the top right. Video starts muted; music and effects require an explicit click. Reduced motion and Save-Data retain the poster until playback is requested.
- The subtle footer link opens the existing production password gate at `/access?next=%2F`; signup and authentication handling are unchanged.
- Desktop (1600×900) and phone (600×800) clips were recorded from the game renderer at main `c5e23309f221b4e4397bfc63d497e81a1648ea40`, using its seeded demo driver. The completed merge gate and rocket launch are visible. The 10-second loops crossfade their seam. Audio is a separate 32-second recording of that revision’s procedural music, ambience and sound effects, with staged effect cues. These are game previews, not recordings of real PR activity.
- The refresh is scoped to `web/public/welcome/` and its logo asset; it does not replace the app/password-page branding in PR #467 or the separate layout workshop in #469. Justin explicitly requested this web work outside Codex’s usual backend lane. Checkpoint: October 28 landing-page polish.

## Waitlist collection follow-up (2026-10-28)

- Signup uses the existing public `POST /api/waitlist` Worker endpoint. It normalizes and deduplicates the address in D1 `signup_waitlist`, with `kind=email` and `status=pending`; owners review it at `/admin/signup`. This collects addresses only; no automatic email is sent.
- The dialog requires both a successful HTTP response and `{ok:true}` before showing “You're on the waitlist.” Redirects, HTML, malformed replies and database failures retain the email for retry. Requests time out after 15 seconds instead of staying busy indefinitely. A confirmed signup hides the input form.
- For a working local preview, run `bun run dev` (Worker plus build), or keep `bun run dev:web` and the server dev script running together. The server dev script sets `--infer-origin-from-routes=false` so Wrangler preserves localhost instead of inferring shiptorio.com and triggering the HTTPS gate. This does not change production origin checks.
- Browser regression tests in `tests/e2e/waitlist.pw.ts` submit through the real Worker and verify a single normalized D1 row after repeat signup on desktop, iPhone and Pixel. They also refuse false success from HTML, missing save receipts, redirects and database failures. The D1 receipt reader exists only in the existing test Worker.

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
- **Art:** `hero.webp` (1600×900) / `hero-1024.webp` / `hero-phone.webp` (600×800) are frame 0 of `hero.mp4` /
  `hero-phone.mp4`: 10s of the real vertical shaft map (the game's default), the build floor on desktop and the launch
  floor on phones, judge scenario, every overlay hidden. Re-record with `node docs/art/shaft-hero.mjs` against a running
  `vite --port 5310` (seeded `Math.random`, `?raf=0`, `__shaft.advance(1/24)` + `render` + screenshot per frame, the
  last second crossfaded into the first so it loops without a seam, then ffmpeg). Take it again whenever the shaft art
  changes a lot. The still paints first; the loop fades in after load and never under reduced motion or Save-Data. A
  small pause button sits top right (bottom of the art on phones).
- **Copy rule:** the only model credit is the footer line "powered by Meta Muse Spark". No "Spark" elsewhere.
- **Verified (local wrangler dev):** Lighthouse desktop 100/100/100/100 (LCP 0.5s), mobile 99/100/100/100
  (LCP 2.1s on simulated slow 4G, CLS 0).
