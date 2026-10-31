# Demo video script (2:00)

Rewritten 2026-10-31 to match what runs on shiptorio.dev today (dev at `cf3a097`). Justin films Tue Nov 3 and Wed Nov 4;
cutoff Nov 4, 8 PM CT. Judges only see the video. Shot-list page: see the "Demo shot list" artifact linked in
docs/context/threads.md.

The story is locked (docs/context/demo-plan.md): software is a factory → there's always a bottleneck, and it's waiting
on your call → swipe and it moves → approve twice more and it's automatic → the rocket ships. Never say "you are the
bottleneck". Say "it's waiting on your call". Shippy is the only character. Shippy's brain is Meta Muse Spark 1.3
(`server/src/spark.ts`, default `muse-spark-1.3`).

Voiceover is about 220 words. Record it separately and lay it over.

## What's where on shiptorio.dev now

| URL | What plays | Signed in? |
| --- | --- | --- |
| `shiptorio.dev` (302 → `/deck?source=live`) | **Meet Shippy tour** (`story/tour.ts`): hi, "Powered by Meta", Shippy builds each station and names it, steam engine, one fix rides the line and you hold to ship it, rocket, then the camera pulls back over the city of islands. Ends on "Start with your repo" → password popup → GitHub. No password before that. | No |
| `shiptorio.dev/deck?seed=1` | **Jam-and-swipe story** (`story/index.ts`): a working line, crates pile at Review, the card says it's waiting on your call, swipe, approve twice more, Shippy walks to Review and pulls the lever, one crate ships with no card, rocket, city reveal. `&reveal=1` starts at the city ending. | No |
| `shiptorio.dev/deck?source=live&repo=r3dbars/Testing` | **The real factory** on the Testing repo: real issues, Spark's cards, your Codex on the Mac, real PRs, real checks, Ship it merges on GitHub. | Yes |
| `…&record=1` on the live URL | Same, plus a "Save trace" button (sanitized JSON) for a replay take. | Yes |
| `shiptorio.dev/deck?source=replay&trace=<name>&speed=2` | Read-only replay of a saved trace. Cards show, swipes do nothing. | No |

## Takes

| Take | What | URL | Raw length |
| --- | --- | --- | --- |
| A | Front door tour, private window | `shiptorio.dev` (or `shiptorio.dev/deck?fresh=1`) | ~2 min, you cut to ~30s |
| B | Jam, swipe, climax, city | `shiptorio.dev/deck?seed=1` | ~80s |
| C | The real loop on Testing: 3 yeses, the 4th runs itself, hold Ship it | `shiptorio.dev/deck?source=live&repo=r3dbars/Testing&record=1` | 10–20 min, you cut to ~40s |
| D | Cut-ins: GitHub issue, Codex working on the Mac, PR checks going green, merged PR | github.com/r3dbars/Testing + Codex app | ~20s |

Setup: Chrome, 1920×1080 window, 100% zoom, bookmarks bar hidden, extensions off (use a clean profile), sound on
(the hum and the lever). Desktop is the main take. A phone take of Take A is a nice 3-second cut-in, nothing more.

## Shot list

| # | Time | Take | On screen | Say |
| --- | --- | --- | --- | --- |
| 1 | 0:00–0:07 | A | Tour opens close on Shippy waving: "Hi, I'm Shippy!" | "This is Shippy. And this is a game that turns your GitHub repo into a factory." |
| 2 | 0:07–0:15 | A | "Powered by Meta" card, then "Software is a factory" | "Shippy's brain is Meta Muse Spark. It reads your whole factory and suggests what to do next." |
| 3 | 0:15–0:25 | A | Speed-ramp the build: Repo, Planner, Builder, Checks, Review, Gate go up one by one, then the steam engine | "Issues come in. They get planned, built, checked, reviewed, and shipped. The engine is your own coding agent." |
| 4 | 0:25–0:37 | B | Line running, crates pile at Review, the card slides up | "And there's always a bottleneck. Right now it's review. It's just sitting there, waiting on your call." |
| 5 | 0:37–0:44 | B | Swipe. Pile releases, rockets go | "Swipe. And it moves." |
| 6 | 0:44–1:00 | B | Approve two more. Shippy walks to Review, pulls the lever, a crate rolls the whole line with no card, rocket | "Approve the same kind of thing twice more... and now it's automatic. Shippy's got review." |
| 7 | 1:00–1:28 | C + D | It's real. Testing issue on GitHub → the plan card on the deck with its dots → yes → Codex working on the Mac → PR with green checks → hold Ship it → merged on GitHub → rocket | "And this isn't a mockup. That's a real GitHub issue. Muse Spark plans it, my own Codex builds it on my laptop. Real pull request, real checks. Hold Ship it... it merges, and the rocket goes." |
| 8 | 1:28–1:45 | C | The third yes fills the dots and the card says "Learned." Next docs issue: its plan is approved by the factory on its own, no card | "Three yeses on the same kind of work... and the fourth one just starts. No card. Merging still waits for me." |
| 9 | 1:45–2:00 | B (`?reveal=1`) or A | Camera pulls back over the city of islands. End card: Shiptorio · shiptorio.dev · powered by Meta Muse Spark | "Find the jam. Clear it. Automate it. Then go find the next one. Shiptorio." |

## Take C, step by step (the real loop)

Use the docs issues **#31–#37** on r3dbars/Testing. All seven are open, have no PR, touch only `docs/`, and are still
true on main as of 2026-10-31 (checked: `SHIPING.md` link, `$3.5`, FAQ `TODO`, no SKU, glossary unsorted, no "where to
ask", no docs index). They're one kind of work (`docs` district), so they share one trust meter.

| Take | First three yeses | Fourth (runs on its own) |
| --- | --- | --- |
| 1 | #31 broken shipping link, #32 sticker price `$3.5`, #33 FAQ `TODO` | #34 add SKU to the glossary |
| 2 (backup) | #35 sort glossary, #36 FAQ "where to ask", #37 docs index | needs one more docs issue (ask any thread to file it) |

1. Open the live URL with `&record=1`. The Testing factory loads with the dots at zero.
2. Shippy's card at Repo: "An issue is ready to start". Yes.
3. Planner card for the plan, with its dots. Yes. Dot 1 fills. Codex on the Mac picks it up (cut to it).
4. Watch it ride Builder → Checks → Review. It stops at the Gate. Hold Ship it. GitHub merges, rocket goes.
5. Repeat for the next two issues. The third yes fills the last dot: "Learned."
6. The fourth issue's plan is approved by the factory itself ("Approved on its own"). It builds with no card.
   It still stops at the Gate: Ship it is always a human hold.
7. Click Save trace before you leave the page.

Codex time per issue was about 4 minutes in the 2026-10-30/31 runs, so plan ~20 minutes for one take.

## Reset between takes

| What | How |
| --- | --- |
| Front door tour again | `shiptorio.dev/deck?fresh=1` (signs out, clears the browser, replays from "Hi, I'm Shippy!"). Or a fresh private window. |
| Jam story again | Reload `shiptorio.dev/deck?seed=1`. "Replay" on its last card works too. |
| Trust dots back to zero | `bun scripts/e2e/real-loop.ts forget` on the Mac (in `~/shiptorio-e2e`), or "Ask me again" in the game. `?fresh=1` does not reset learned trust. |
| Put #31–#37 back on the line | They were parked off the line on 2026-10-30. Run `bun scripts/e2e/real-loop.ts unpark` on the Mac before filming. |
| Merged an issue by accident | Use the next one in the table. Don't reopen merged ones. |

## Before you film (Mon Nov 2 evening)

1. **Stage check** on the live Testing deck: only the issues you'll use are queued, nothing old sits at the Gate,
   dots are at zero. Stale items to keep off camera: #45 + PR #51, #56 + PR #57, #58, PR #18 (red, old Codex PR).
   Ask the thread "Prove the real loop end to end" to run `unpark`, park the strays, and `forget`.
2. **Runner online**: Codex app open on the Mac, the runner shows ready on the steam engine.
3. **Spark budget**: Shippy's daily Spark share resets at 00:00 UTC (6 PM CT). Film on a fresh day and don't run long
   `watch` scripts before. Caps are $5 per account and $50 per site per day; the card says so plainly if one is hit.
4. Take A in a private window so nothing remembers you.

## Backup takes

| If | Then |
| --- | --- |
| Codex is slow or fails on camera | Film from the saved trace: `shiptorio.dev/deck?source=replay&trace=<name>&speed=2`. Hand the downloaded JSON to any thread to commit as `web/public/deck/traces/<name>.json` on dev. The tag reads "Replay · recorded live". |
| The 4th issue doesn't start by itself | Drop shot 8, give shot 7 the extra 15 seconds, and keep the "approve twice more" climax from Take B. |
| Spark is over budget | Shippy falls back to rule picks (no tool calls). Cards still work. Film the next day after 6 PM CT. |
| The live deck won't load | Take A and B need no sign-in and no server work. Shots 1–6 + 9 stand on their own; use Take D GitHub cut-ins for "it's real". |
| A phone shot is wanted | `shiptorio.dev` on the phone, private tab. The tour fits 320px+. |

## Honesty notes

- Takes A and B are the built-in tour and story: the same deck a stranger sees first, but scripted. Say it's real only
  over Take C and D.
- Never present `testing-16-sample` or `all-clear` traces as the real run. They're fixtures.
- Muse Code: name it only if a real run used it (needs a paid Muse account). Otherwise say "my own Codex".
- Ship it is never automatic. Don't imply the factory merges on its own.
