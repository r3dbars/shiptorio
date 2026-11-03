# The deck front door

Current source: `server/src/{redirect,access,landing}.ts`, checked 2026-10-30.

- The only game app is `web/deck.html` → `web/src/deck2d/`. After access checks, `/` redirects to
  `/deck?source=live`; old sample links keep their source/scenario while obsolete React switches are dropped.
- On shiptorio.dev, the deck and its static assets are public. The signed-out story is scripted and spends
  no model calls. It does not build or merge a real PR.
- Creating a factory asks for the preview password before GitHub sign-in. Then the deck handles repo choice
  and connecting the player's local Codex or Muse Code runner. Account APIs, sockets and real work stay gated.
- shiptorio.com retains its public landing/password behavior until an explicitly requested promotion changes
  it. Public availability is host-specific; a merged dev change is not proof of a production deployment.
- `/judge` serves the deck story. The old React game, shaft and island map are deleted.

The retained landing assets and waitlist endpoint are compatibility surfaces, not another game.
[Earlier landing implementation and capture notes](archive/landing-before-cleanup.md) are historical.
No new tour work: freeze Oct 31, record Nov 1, submit Nov 4 at noon CT.
