# Demo video script (2:00)

Written 2026-10-29 for the Meta hackathon video (cutoff Nov 4 8 PM CT, aim Nov 3). Justin films it himself on the
real deck. Follows the locked story (docs/context/demo-plan.md): software is a factory → there's always a
bottleneck, waiting on your calls → swipe and it moves → approve twice more and it's automatic → the rocket ships.
Artifact version: https://claude.ai/artifact/12QE9JhGHZrRL6XKASVWRk

Voiceover is about 210 words, so there's room to breathe at a normal pace. Never say "you are the bottleneck".
Say "it's waiting on your call".

## Three takes, then cut

| Take | What | URL | Length |
| --- | --- | --- | --- |
| A | The intro story, one continuous run (shots 1-3, 5, 6) | `shiptorio.dev/deck?seed=1` | ~80s raw |
| B | The real loop on the live deck or a replay of it (shots 4, 7, 8) | `shiptorio.dev/deck?source=live&repo=r3dbars/Testing` or `/deck?source=replay&trace=<name>&speed=2` | ~60s raw |
| C | Cut-ins from real tabs: Testing issue, Codex on the Mac, Testing PR checks, merge | github.com/r3dbars/Testing | ~20s raw |

Setup: Chrome at 1920×1080, 100% zoom, bookmarks bar hidden, sound on (the hum and the lever). Record voiceover
separately and lay it over.

## Shot list

| # | Time | On screen | URL / state | Say |
| --- | --- | --- | --- | --- |
| 1 | 0:00–0:08 | The deck opens on a working line. Crates moving. | Take A, first frame of `/deck?seed=1` | "This is a codebase. Except here it's a factory." |
| 2 | 0:08–0:22 | Let it roll. Crates ride up Repo → Planner → Builder → Checks → Review → Gate → Launch. Two crates ship. | Take A, 0–8s | "Issues come in as crates. They get planned, built, checked, reviewed, and shipped. Every crate is a real piece of work." |
| 3 | 0:22–0:34 | Review jams. The pile grows to 3, the card slides up. | Take A, ~8–12s (card at ~9s) | "And there's always a bottleneck. Right now it's review. It's just sitting there, waiting on your call." |
| 4 | 0:34–0:48 | Shippy parks the camera on the stop Meta picked, with one plain line why and a Suggested tag. | Take B: live deck with #623 merged. Fallback: replay of a recorded live run | "Shippy's brain is Meta Muse Spark. It reads the whole factory, picks the one jam that matters, and tells you why in one line. It never writes the code. It decides what's next." |
| 5 | 0:48–0:58 | Swipe the card to Continue. The jam clears, crates move. | Back to Take A, first card | "Swipe. And it moves." |
| 6 | 0:58–1:14 | Approve two more. On the third, Shippy unfolds, walks to Review and pulls the lever. Review runs on its own. One crate ships with no card, the rocket goes up, then the camera pulls back to the city (24 s, ends on the sign-in card; `?reveal=1` replays just that ending). | Take A, cards 2 and 3 | "Approve the same kind of thing twice more... and now it's automatic. Shippy's got review. So you're free to go fix the next jam." |
| 7 | 1:14–1:42 | It's real. Intercut: Testing issue on GitHub → Start build card on the deck → Codex working on the Mac → PR with green checks → hold Ship it → GitHub merges → rocket flies. | Take B (live or replay at 2×) + Take C cut-ins | "And this isn't a mockup. That's a real GitHub issue. Muse Spark plans it. My own Codex builds it, right on my laptop. Real pull request. Real checks. Hold Ship it... it merges, and the rocket goes." |
| 8 | 1:42–1:52 | The real level-up: a fourth same-kind Testing issue starts building with no card. | Take B, live deck after three yeses (#618) | "Three yeses in a row, and the fourth one just starts. No card." |
| 9 | 1:52–2:00 | Wide deck, rocket in the sky. End card: Shiptorio · shiptorio.dev · powered by Meta Muse Spark. | Any calm frame + title in the editor | "Shiptorio. Find the jam. Clear it. Automate it. Then go find the next one." |

If shot 8 isn't ready: drop it and give shot 7 the extra 10 seconds (hold longer on the rocket).
If shot 4 isn't ready: show the story's Suggested card with a lower-third "Shippy's brain: Meta Muse Spark" and keep
the same line.

## Honesty notes

- Takes A and the swipes are the built-in intro story (same deck, scripted factory). It's the first thing a new player
  sees, so it's fair to show, but the "it's real" moment is shot 7 on the real loop.
- Replay is read-only: cards show but swipes do nothing. That's why swipes come from Take A.
- The checked-in sample `/deck?source=replay&trace=testing-16-sample` shows a "Replay · fixture sample" tag. Don't
  present it as the real run. Use a recorded live trace for shot 7 (below).

## Recording a real run for clean takes

1. Open `shiptorio.dev/deck?source=live&repo=r3dbars/Testing&record=1` and play the real run (Testing issue → Start build → Codex → PR →
   checks → hold Ship it). A "Save trace" button sits top right.
2. Click Save trace. It downloads a sanitized `shiptorio-live-trace.json` (tokens, emails and secrets stripped).
3. Hand the file to any Claude thread to commit as `web/public/deck/traces/<name>.json` into dev.
4. Re-film as often as you like at `shiptorio.dev/deck?source=replay&trace=<name>&speed=2` (speed 1, 2 or 4). The tag
   reads "Replay · recorded live".

## What must work, and who owns it

| Shot | Must work | Owner | Status 2026-10-29 |
| --- | --- | --- | --- |
| 1-3, 5, 6 | Story opens on a working line, card at ~9s, third approve → Shippy lever at Review | Thread "Build the first-run story on the deck" | Merged, works on dev |
| 1-6 | Shippy calm and on the ground, never floating | Codex #57 | PR #622 (draft) |
| all | Plain words on cards | Codex #50 | Queued |
| 4 | Live deck parks on Meta's pick with one line why | Codex #47 | PR #623 (draft) |
| 7 | Runner on Justin's Mac takes the build | Justin (Codex app, plugins-off paste) | Waiting on Justin |
| 7 | Hold Ship it on Testing PR #27 merges and the rocket flies | Justin's hold; wiring #608/#610 | Waiting on Justin |
| 7 | Replay of a recorded live run | Codex #45 (#616 merged); Justin records, a Claude thread commits the trace | Replay merged, trace not recorded yet |
| 8 | Three same-kind yeses → the fourth starts alone | Codex #43 + Launch taps on Testing #19, #20 | PR #618 open; taps wait on Justin |
| all | Nothing breaks on camera (stale factories, CI) | Codex #44, #48 | #615, #621 |

## Justin's filming checklist

1. Wait for #618, #622, #623 to land on dev (Claude threads merge on green).
2. Do the real run once with `&record=1`, hold Ship it on PR #27, save the trace.
3. Film Take A twice (`/deck?seed=1`), Take B from the replay, Take C from GitHub and the Codex app.
4. Record the voiceover, cut to 2:00.
