# Claude project threads (as of 2026-10-26 ~20:40 UTC)

`codex/machine-animation-preview` collects Justin's Oct 29 deck iteration: yellow human attention versus red faults, pixel-contour selection with existing swipe cards, Shippy's fold/charge/start sequence, stable integer zoom, full machine-to-machine conveyor connections with labeled issue/PR cargo, and continuous longer rocket flights. Local previews stay simulated; the GitHub/Meta rollout plan is in `docs/context/github-deck-loop.md`. Targets `dev` after checks; staging rollout explicitly requested.

PR #598 (`codex/dev-deck-default`) makes authorized bare visits to shiptorio.dev open the approved pixel deck with the automatic Shippy watch loop. Explicit repo/onboarding links and production behavior stay unchanged; the existing access gate still runs first. Justin requested this as the staging default.

## Deck visual iteration (Codex, 2026-10-28)

PR #596 (`codex/deck-visuals`) adds a deeper foreground floor, grounded machines and Shippy, green/red conveyor flow, a pulsing blocked-state orb, persistent macOS pinch zoom, and detailed rocket launch/return effects. Justin approved the descent and fast side jets; later requests add a substantial fractured-rock underside and a short, braced engine cradle instead of the long exposed center pipe. Before/after phone and desktop shots are in `docs/evidence/deck-visuals/`. Targets `dev`; no deployment or merge is authorized by this visual PR.

The final pass adds layered cascading cliffs, animated cyan seams and floating fragments, Shippy's walking/building rehearsal, real factory job-driven poses, and a simulator-only automatic build → failed check → repair → rocket loop (`/deck.html?source=sim&scenario=deck-watch&watch=1`). Justin selected this style as the baseline going forward. Live factory approvals remain manual.

## Browser signing key reuse (Codex, 2026-10-28)

Session cookies and preview-form proofs now reuse the existing bounded, isolate-local HMAC key cache. Before: every sign/verification imported a key; after: concurrent checks with the same secret share one import. Cookie signatures, expiry, password rotation and fresh authorization checks remain unchanged. Focused session/gate/cache tests pass; full check and exact-head dev CI govern merge. This CPU reduction is not a claim that the connection latency target has been achieved.

## Hosted tester playthrough fixes (Codex, 2026-10-28)

The hosted test-newbie run observed a real factory-socket launched transition and PR #7 merged inside the isolated fixture, but failed on the newly enabled overview's 403 and a stale button wait after Launch. Allow only the signed tester's read-only overview through the existing private fixture; production, mutations and repo overrides stay denied. The bot now ends an outstanding action when its authoritative Launch transition arrives; earlier action failures still fail. Focused boundary/action tests pass; full check, dev CI and a fresh hosted playthrough remain required. This is fixture proof, not a real GitHub/Codex ship.
## GitHub connection reliability (Codex, 2026-10-28)

Backend GitHub connection reliability: cancellation, missing setup, invalid provider JSON and network/provider failures now have safe retry pages; the token exchange is bounded. No new session is issued after failed repository discovery. Guest merge and normal sign-in retain their checks. See `github-connect.md`; new 2D frontend paths remain untouched. Focused failure tests reproduce the previous unhandled errors; full check and exact-head dev CI govern release.

## Polished logo dev refresh (Codex, 2026-10-28)

#467 updates the shared Wordmark, password gate and server-page brand image to the approved polished asset, with a quiet gate background. Password/session/CSRF code is untouched. The approved brass public welcome page remains byte-for-byte unchanged. Product-source local check: 1,421 passed, two existing skips, zero failures; lint/types/build green. Earlier Miniflare previews at 390×844 and 1440×900 verified image loading, full form visibility and wrong-password feedback. Refreshed onto dev; exact-head quick CI, Stranger and CodeQL govern merge. Production remains an explicit dev-to-main promotion.

## Simplify the whole game UI (Claude, 2026-10-28)

- Justin: the live factory is overwhelming (4 ways to say "needs you", 3 "not connected" mine tags, a stale red Steer card, two different 12s). Audit + 10 A/B picks: https://claude.ai/artifact/F2Rd8CtzAxJhH1sfDCriLT. Rules in docs/SIMPLE-UI.md.
- Built behind `?simple=1` (`simpleOn()` in web/src/flags.ts): `SlowSpotLine` (one sentence: "You · 3 waiting" / the jammed stage / all clear, `ui/slowSpot.ts`), `TaskTray` (one card, "2 of 9", swipe or arrows browse and fly the camera via `setFocus(move.focus)`, Go / Later / Edit-More, autonomy "N more ..., then the factory stops asking"), quiet shaft HUD (`ShaftHud.quiet`: no chips, tags or pings except the card's machine), compact floor card. Don't add new map labels or second "needs you" surfaces; asks go in the tray.
- Runner light + one-plan-card-at-a-time is PR #474 (thread "Make it obvious the runner is working"); `<MachineLight/>` slots into the simple HUD once it lands.

## Teach the factory to automate what you approve (Claude, 2026-10-28)

- Justin's journey pick #11. 3 Continues in a row on one card class (`kind|scope`) and the factory does that class on its own: `server/src/learn.ts`, `runLearned()` in the Factory tick, dots meter `web/src/ui/LearnDots.tsx` from `Move.learn`, learned list + "Ask me again" in Make it yours. Only plans and plan approvals can be learned, never Launch. Dismiss "Just this one" leaves the planner a try-something-different note. Flag `learn` (default on). docs/LEARN.md. The simple tray (#477) swaps its `.tearn` line for `<LearnDots>`.

## Locked dedicated Keychain restart (Codex, 2026-10-27)

- Existing dedicated Keychains must unlock before `set-keychain-settings`; a locked service restart otherwise fails before credential discovery. The real macOS regression now locks the isolated store and calls prepare directly, preserving the password, saved canary, sandbox boundary and personal default Keychain checks.


## Steam & iron sound picks (Claude, 2026-10-27)

- Soundboard thread owns all SFX and music now (the gameplay thread handed over `claude/gameplay-sound`). Justin picked every sound on the A/B soundboard (https://claude.ai/artifact/EdGMjvx9LP9xTfzNv9Cwe3); recipes live in `web/src/sound/steamIron.ts` with the take each one is (`PICKS`).
- Machine taps play when the camera flies in (`tapFor` in steamIron, called from `useFactorySound`); close-ups get a mood layer (working / stuck / rework / idle, `moodOf`); the hold-to-launch button is a 4-tick countdown clank; card Continue / Later, unlock, merged, caught a bug and ore arriving replaced the chiptune versions. Repair sounds play when a build-out hold completes: tunnel = `repair_pry` (Crowbar), boiler = `repair_boiler` (Ignite), issue = `repair_cart` (Hammer); see `REPAIR_SFX` in web/src/ui/Buildout.tsx.
- Music (2026-10-28): Justin's 7 soundtrack picks are the default score. Pure score + picks + role rules in `web/src/sound/soundtrack.ts` (tests: `web/test/soundtrack.test.ts`), Web Audio port of the soundboard instruments in `soundtrackPlayer.ts`. Idle = Iron Lullaby, working = Night Shift, stuck = Pressure, after a launch = Liftoff (30 s), orbit watch close-up = Aether Drift, mines close-up = Deep Shaft, first run / welcome tour / guided build-out = Boiler Waltz. Calm rule: the floor's mood can only change the track after 8 bars; your own moves switch on the next bar with a 2.2 s crossfade. `?music=2` = old "Up from the Mine", `?music=1` = first adaptive score. Audition any track: `renderSoundtrackPreview(role)`.

## Let players play first, sign in later (Claude, 2026-10-27)

- A bare visit plays the welcome tour, then drops signed-out players straight into the demo shop sandbox. GitHub sign-in is an unlock: the floor card's "Demo shop · Use your repo" chip, and a Suggested card after the first rocket. See docs/context/accounts.md "Play first". Codex prompt 3 (guest accounts, server side) builds on this; the intro story/look stays with "Fix the onboarding from Justin's playtest".

## Build the agent loop that picks the bottleneck (Claude, 2026-10-27)

- Loop core of the bottleneck brain (docs/BRAIN.md): `server/src/diagnose.ts` (one bottleneck + one unlock per pass, memory of Later/Continue/wins, throttle: main-signal change or 30 min, 24 a day, stops at half the model budget, rule fallback), `server/src/unlocks.ts` (playbook by signal kind; actions are only `inspect_bottleneck`, `connect_source`, `ask_goal`, everything else is a link), `server/src/signals/index.ts` (collector registry, `bind()` for collectors with their own ctx, plus the `factory:*` collector over bottleneck.ts).
- Factory: `kickBrain` runs off the tick (one pass in flight, ≥30 s apart), stores `brainMemory`, `brainSignals`, `brainDiagnoses` (last 50, for the eval harness). Model calls go through `Factory.think("diagnose")`. Behind the `brain` flag, off by default.
- Collector threads add one line to `COLLECTORS`. Eval entry point: `runDiagnose()` with an injectable `think`.

## Give Spark tools and full understanding (Claude, 2026-10-27)

- Owns Spark's tool layer: `server/src/spark-tools.ts` (toolbox, planner loop, review loop) and `spark-context.ts` (what the tools see). The "Make Meta Muse Spark central" thread keeps the audit (docs/context/spark-audit.md); this thread owns the planner and review prompts.
- Planner: 8 turns over 9 read-only tools; review: 6 turns, reads the repo at the PR head. Acceptance cases: Testing #12 (`--coupon` vs `argv[2]`) and #13 (`$50 or more` vs `> 50`).

## Claude private Keychain persistence (Codex, 2026-10-26)

- Live Testing #2 acceptance found a gap after #274: the isolated HOME had no `Library/Preferences` or default Keychain. Claude saved account metadata, but a new status process had no credential; neither a fake provider nor a signed-out native startup test proved persistence.
- `codex/claude-private-keychain` initializes a separate encrypted Keychain plus private preferences under `.agent-home`, with a random 0600 password beside the home (outside the sandbox). The trusted runner unlocks it before Claude auth checks; settings lock it on sleep and after 30 minutes. Reinstall reuses the store. Never points at or copies the personal login Keychain.
- Real macOS test: create a non-secret credential through the isolated default store, read it in a second process and inside the agent sandbox, lock/unlock/restart, verify the personal default is unchanged, and verify the agent cannot read the unlock password. Focused subscription/native tests and runner typecheck pass; full Linux CI gates merge to avoid duplicate heavy local runs.
- Runner bundle reinstall is required; PR includes the paste. Testing #2 still needs actual Claude sign-in and a real PR receipt. Justin authorized the allowance 21 → 22 for one attempt only; no build attempt has been submitted by this chat yet.

## Codex: Testing real-loop acceptance (2026-10-26)

Real Spark and the local Codex runner opened [Testing #12](https://github.com/r3dbars/Testing/pull/12)
for issue #5. CI, docs verify and AI review passed, but executing the README coupon example
on the exact PR head found an ignored flag; the run published a genuine failing manual status.
Testing #13 also completed a real docs-only Spark/local Codex run. Both PRs remained open and
unmerged in the read-only 2026-10-27 11:53 UTC recheck. The earlier Actions billing block and
local deployment handoff are historical: Shiptorio Deploy40498676438 succeeded at61ef296.
The receipt does not certify current runner/process state or a completed rework and in-game
Launch. No factory PR was merged directly by this documentation run.
[Evidence and remaining proof](testing-live-acceptance.md).

## Codex isolated tester rebase onto dev — PR #354

Retains production-disabled negative-ID identities and scoped fixture delegation while preserving current administrator controls and request redaction. The bot workflow now pins existing reviewed action SHAs and disables persisted checkout credentials. No fixture resources or configuration were changed. Local proof and exact-head dev CI are required before merge.

## Stranger E2E: latest status (2026-10-26)

| PR | State | Result |
| --- | --- | --- |
| #252 | merged after CI + Stranger passed | Fix Chromium runner approval submitting opaque Origin under no-referrer; retain exact-origin checks. |
| #260 | merged after CI + Stranger passed | Preserve the password gate script nonce on fast and wrapped paths while retaining the other global CSP restrictions. |
| #256 | full E2E suite | Signup → App install → repo → signed issue/retry → Spark plan → browser approval → runner PR → stale/current CI → verify + AI review → visible Launch → merge/rocket. Every PR to main runs the suite, including drafts and docs-only changes, and retains screenshots, timing/state and browser trace. GitHub, Spark and runner build results are fixtures; no real bot PR merges. Local 16-step run passed in 60.9s. Fixture runner heartbeats keep slow CI render time from simulating an unplugged machine. |

## Mobile startup and stale chunk recovery (Codex, Oct 27, 2026)

Entry-point splitting keeps judge off default factory startup and preserves current play-first Root/account callbacks; HTML preload hints start the required shaft art early; recovery installs before game/vendor imports and permits one session-guarded reload, then shows a refresh action. A manifest-based gzip budget includes startup's shaft art; `bun run --filter './web' test:chunks` covers transient/persistent missing chunks, preload errors, unavailable storage and unrelated errors. App.tsx remains untouched; a four-line FactoryMap exception defers the alternate island renderer to selection/fallback. Recovery cases resolve the current hashed game asset from a fresh build. The original 781,902-byte budget remains fixed; measurements and release checks are recorded in the PR.


## GPU recovery investigation (Codex, 2026-10-28)

#366 restores through normal GPU/physical-hold admission: the first two frames show real current geometry with temporary unlit palette/map/alpha materials and original unbuilt-piece masks, then at most 24 exact material/layout groups per admitted frame return to original lighting and finish. Original references return between draws; source textures remain caller-owned; loss/rebuild/disposal cancel the temporary resources. Cached live-context LINK checks fail closed before use, and the non-shadowed legacy loop retains the original shadow path.

With the earlier 16-group cap, local SwiftShader repeated losses at 390×844 and 1440×900 produced completed first images in 0.86–1.06s and completed full-original frames in 12.96–15.94s. These are separate milestones, not instant full-lighting recovery. Native Metal: all 14 recovery/physical-hold/fresh-canvas/React/WebGL/invalid-vertex/invalid-fragment cases pass; trusted Menu input took 1–144ms from event timestamp to actual UI effect during recovery. Browser-clock deadlines remain 2s/30s; a separate host hang bound prevents tracing/snapshot transport latency from masquerading as product latency. Normal-art frozen native comparisons across six views differ at no more than 54 of 329,160 pixels (>3 channel delta), visually unchanged. Linux CI exposed a 33.1–33.7s full-original recovery at the 16-group cap and cold full-detail startup on replacement canvases. The 24-group cap reduces repeated warm-up draws; only SCENE_REBUILD generations now start with the recovery renderer, leaving ordinary startup unchanged. Product deadlines remain 2s first image, 6s replacement and 30s full originals; exact-head dev CI governs merge and production promotion is separate.

## Codex: pre-hackathon security pass (2026-10-26)

- Completed the server route, factory isolation, GitHub/Sentry signature,
  Spark tool/secret and logging audit at baseline `44942fd` (63 source files),
  plus the subsequently added runner-health display helper.
- Four findings, each with a small fix PR and regression: [#267](https://github.com/r3dbars/shiptorio/pull/267)
  reauthorizes empire summaries; [#270](https://github.com/r3dbars/shiptorio/pull/270)
  separates read and writer authority; [#271](https://github.com/r3dbars/shiptorio/pull/271)
  rejects incomplete PR-file inspection; [#273](https://github.com/r3dbars/shiptorio/pull/273)
  binds automatic permits to current files and head. PR links retain CI/merge evidence.
- Full local checks passed on each fix. No additional confirmed webhook,
  Spark secret-tool or log-secret vulnerability; no production exploitation or
  live model red-team claim. Details and limitations: [security.md](security.md).
- **Production verified (2026-10-27 UTC / 2026-10-26 CT):** all four fixes are
  ancestors of `06b355a82f54b1f91af483a4ce6a46c362e5cfd8`.
  [Deploy + live smoke passed](https://github.com/r3dbars/shiptorio/actions/runs/40434908855);
  `/api/version` independently returned that commit and `/api/health` reported
  D1, KV and Durable Objects healthy. #278 and #282 resolved the Linux sandbox
  test dependency blocking earlier deploys. This is the verified rollout snapshot;
  later deployments may advance production. Combined local check: 723 passed,
  two skipped, zero failures, plus typechecks/builds.
- No manual deployment, Cloudflare resource or web source changes. Merges use
  green CI; existing deployment automation remains responsible for rollout.

What each thread in the Claude "Shiptorio" project did. Threads live on claude.ai, so this
is the only copy agents outside it (Codex) can see.

> **Plan through Nov 4 (locked 2026-10-27):** prove the loop (Testing #5 + 5 to 10 more clean ships + one real
> autonomy level-up), nail the vertical map to the mockup, judge mode + 2-min video, feature freeze ~Nov 1,
> park build mode / pricing / empire / new mines. Codex is on reliability prompts only. Details: `docs/VISION.md`.

| Thread | State | What it did / produced |
| --- | --- | --- |
| Design the core gameplay mechanics | waiting on Justin's A/B picks | `docs/GAMEPLAY.md`: core loop, six verbs (phone + desk), world vs UI rule, abandoned-foundry first run, repair-and-unlock ladder tied to real outcomes, 24 A/B decisions. Playbook https://claude.ai/artifact/QDvFEZePgx5bzBv7TBHZz8, A/B picks https://claude.ai/artifact/HTDQR39URzPniTeugbZGkR. Also VISION.md "Current focus" now = great player experience first (Justin 10:50); judge mode frozen as is. |
| Design a calm attention system for players | v1 behind flag | `docs/ATTENTION.md` (PR #268). One Needs you tray, three kinds (approve / steer / suggested, `attentionOf` in shared), every card is Continue or Later, Continue streaks steer deck ranking + planner feedback. Behind flag `attention` (off by default; try `?attention=1`). Mockup: https://claude.ai/artifact/Qb9bkmAVvmPYtZdWt2LrQb |
| Review Justin's GitHub repos | done | Found `r3dbars/shiptorio` (then just a README) |
| Review Justin's Cloudflare account | done | Surveyed the account before setup. Nothing Shiptorio yet, R2 not enabled |
| Build Shiptorio on Cloudflare for the hackathon | working | PR #1 (merged): Cloudflare Worker + GitHub App + D1/KV, reshaped into `shared/` `server/` `web/` bun workspaces, Spark client, issue → Spark → PR first cut, Three.js pixel map + `?source=sim`. Created D1 `shiptorio` + KV `shiptorio-cache`. Rebuilt the repo handoff doc as PR #5 (merged: PLAN.md, docs/ARCHITECTURE.md, docs/ART.md, briefs/, both prototypes). Now porting the Pixel Prototype art into `web/` (draft PR #8: shader, models, scene rebuilt, prototype-style HUD as of 16:53) |
| Find the Shiptorio Claude doc | done | Found the plan doc and made the repo handoff doc (the local `~/omni/shiptorio` files, which were on Justin's other computer) |
| Design Shiptorio's first-time signup experience | PR #84 | Welcome intro after sign-in (verify, then automate), two worlds (Check in / Build) with a first read after the scan, field guide. Mockup: `docs/onboarding-mockup.html` |
| Write Codex prompts for Shiptorio | working | AGENTS.md (PR #2, merged) + paste prompt for Codex. Now the Codex prompt desk: paste-ready prompt packs for Justin, and tracks what Codex has pushed (see below) |
| Define Meta Spark as Shiptorio's game agent | working | Writing the spec for how Muse Spark runs the factory. Codex prompts follow from it |
| Move and push local Shiptorio folder | blocked | Looked for `~/omni/shiptorio` on Justin's Mac; it isn't there (it was on another machine). Superseded by PR #5 |
| Iterate on pixel art direction | working | Confirmed the locked look (pixel 3D, slate/amber, Silkscreen); Feedback Factory canvas is layout-only now. Reworked the launch pad base and solar panel in the Item Lab, PR #7 (merged, now the art baseline) |
| Commit all Shiptorio context to repo | done | This folder (`docs/context/`), PRs #6 and #9 |
| Design Shiptorio's verification loop one-pager | working | `docs/LOOP.md` + `docs/loop.html` (live: https://claude.ai/artifact/3thVDxNxToYkyKTTqoFnbr). The verification gauntlet (CI inspector → verify bay → AI review → launch pad → orbit watch), rework belt with scar tags, promote-a-check, research stations, click-to-act station panel. PRODUCT.md updated (stages, tools, contract, web). |
| Build Shiptorio onboarding flow | working | `web/` first 60 seconds (PR #36, merged): sign in → pick a repo → Spark scans it → starter factory → power → first build. Round 2: progressive disclosure tour in `first-run` (`web/src/ui/tutorial.tsx`): HUD hidden until Spark introduces each concept, keyed by `show(concept)` shared with the UI redesign thread. Live repo picker needs `GET /api/repos` (backend lane) |
| Connect Sentry and PostHog as mines | PR #97 | Contract #90 (posthog SourceKind/OreSource). Sentry webhook `/webhooks/sentry` + PostHog poller on the Factory alarm turn errors and traffic drops into ore on the right district (`server/src/sources/{sentry,posthog,creds}.ts`). `/connect/<kind>` page: paste the key once, stored in KV. Fake modes: `bun run fake:sentry`, `FAKE_POSTHOG=1`. Sim: `?source=sim&scenario=mines`. Map ghost deposits are the signup thread's. Covers Phases B and C of `codex-prompts/connect-the-mines.md`, so Codex can skip them |
| Make Meta Muse Spark central | PR (branch claude/project-thread-rg09k0) | Audit of every decision point: `docs/context/spark-audit.md`. Added the decision log (`server/src/brain.ts`, `FactoryState.brain`), Spark game master ranking the deck and wording the bottleneck card (`spark.ts` `gameMaster`), Spark plan comment on GitHub issues, triage reasons, live foreman drone. Web: "How it thinks" sheet behind the one credit (bell tray, Power sheet, `?thinks=1`) |
| Add sound to Shiptorio | working | PR #33 (merged): procedural chiptune sound in `web/src/sound/`, driven by FactoryState diffs. Second pass: focused audio. Click into anything and its own soundscape (`web/src/sound/scapes.ts`, one per station/machine/power type) plays up close while the floor ducks and muffles; Esc eases back |
| Design the swipe check-in for Shiptorio | working | Justin's idea: the human is the bottleneck, so a check-in deck of 8–12 swipeable Next Moves (right do it, left later, down never + why, up details, tap zoom). Mockup https://claude.ai/artifact/5SvtzSthAEgSuozz2J8SVH. PR #54: PRODUCT.md "Check-in", VISION principle, contract (`FactoryState.deck`, Move `kind/focus/grows/evidence/locked/plan`, `defer_move`, `dismiss_move`), `web/src/ui/CheckIn.tsx`, sim `checkin` scenario. Backend: fill `deck` from the bottleneck engine |
| Make Shiptorio mobile friendly | working | PR #53: phone layout (slim top bar, Next Move docked, Power/Pad/Line/Log in a pull-up sheet, station panels as bottom sheets), pinch zoom + drag pan + tap-to-pick on the map, safe areas, smaller shadow map on phones. Fixes playtest #43 |
| Make the floating island look real | working | Justin disliked the grassy hanging-moss edge. Mockup of 3 options from his reference photo (https://claude.ai/artifact/XogJ8LQk47YobCSA7jQQbN); he locked A (moss cap + faceted tapered rock, waterfalls into mist, floating chunks). Built in `web/src/map/models.ts`, ART.md updated. B (glass fish-tank lake) saved as a later unlock |
| Build the research tree for checks | PR open | `shared/src/research.ts` (8 techs, 3 tiers, real diff checks, scar suggestions, line insert), researched stations run after CI in `server/src/gauntlet.ts` (`withChecks`/`runChecks`), `research` WebToServer message, research card from repeated scars, `web/src/ui/Research.tsx` (flask in the top bar), tinted inspector per check on the map, sim `scenario=research`. Tier 3 (perf, visual, canary) shown as coming soon |
| Wire the first real ship loop | working | PR #73: live gauntlet (`server/src/gauntlet.ts`): `ci-1 → verify-1 → review-1 → gate-1` machines + live `stations`, verify bay v1 (test in diff), Spark AI review posted on the PR, Launch card merges on tap → rocket. Next for Codex: rework belt for runner PRs + real verify bay (`docs/context/live-loop.md`) |
| Add adaptive factory music | PR #182 | Generative score on top of the sound engine (`web/src/sound/music.ts` pure mapping + tests, `musicPlayer.ts` step sequencer). Pad always; bass/arp/drums/snare layer in as items move; bottleneck pile-ups and catches switch to a tense progression + heartbeat; a launch ducks under the roar and cadences V→I. ♪ toggle in Sound settings; AudioContext suspends when muted |
| Build orbit watch station | PR #122 | Station 5 live: every launch is watched 24h on its merge commit (`server/src/orbit.ts`). Trips on a Sentry comeback (same error after a 15m deploy grace, or a new error spiking 3+ events on that folder), a revert PR, or a failed check on the merge commit. Trip = orbit scar, rework belt for a fresh PR, lane permit revoked, escaped defect. Uses existing App events (pull_request, check_*), no new subscriptions. Panel lists watched launches with time left. Sim: `?source=sim&scenario=orbit&autolaunch` |
| Add progression and daily streaks | PR #172 | XP from real results, levels, daily streak + shields, unlocks on the island (glass lake, lanterns, gold pad), morning brief with the deck-size trend, check-in end tally, opt-in "you're the bottleneck" notification. `shared/src/progression.ts`, `web/src/ui/Progress.tsx`. Behind `?progress=1` (`?progress=demo` in the sim) |
| Grow the factory across many repos | PR open | The empire, behind `?empire=1` (remembered; `?empire=0` off). Every other repo you connect floats as a satellite island beyond the main one, tied by a sky rail with crates (`web/src/map/empire.ts`: real island, districts and launch pad, flattened to ~25 draw calls, no shadows). Island chip in the top bar opens the overview: camera pulls back over every island, sheet rolls up shipped, weighted Automated %, waiting on you, and the most stuck island; tap an island to sail there (`web/src/ui/Empire.tsx`). `IslandSummary` + `rollup` in `shared/src/empire.ts`; `GET /api/empire` asks each repo's Factory `summary()` (player's own repos via `reposFor`). Sim shows shiptorio, testing, transcripted |
| Always show a next move after rockets | PR open | #105 follow-up. `web/src/ui/whatsNext.ts`: when no Next Move card is open, one clear move is always picked from state (launch, check in, stuck station, research, connect a mine, near permit, place a builder, the line, grow) and shown in the Next Move slot, live and sim. Sim planner keeps dealing moves after scripted ore runs out (connect a mine, then "pull 3 more open issues"). Check: `node web/scripts/next-move-check.mjs` (10 rockets, card within 2s each) |
| Rebuild the map as a vertical mine-to-launch factory | PR #311 | Justin 2026-10-27: the map goes vertical (VISION principle 10), and it's the map for everyone (the island stays behind `?world=iron` for one release). `web/src/map/shaft/`: quarry floor with mines in a cliff (inbox, GitHub, Sentry, PostHog) → ore lift → build floor (planner, assemblers) → tubes up → checks floor (CI, researched checks, verify, review) → freight lift → launch floor (gate, pad, rocket, orbit). Engine ported from the Black Iron mockup (`docs/art/black-iron/`), art in `shaft/modules/*.js` per `shaft/CONTRACT.md`, layout contract `shaft/layout.js`. Dev harness `web/shaft.html` + `web/scripts/shaft-shot.mjs`. In the game: `ShaftScene.ts` (FactoryScene's API), `plan.ts` (plan from FactoryState), `driver.ts` (real items drive it). The Black Iron thread owns `hud.ts`, `frame.ts`, `shaft.css` (chips, tags, pings, floor panel, phone framing); the HUD (#248) owns fixed chrome. The art passes (#311) finish every module against the mockup: planner, assemblers, launch floor, structure, power, belts, mine, and the checks floor with the merge gate (side-by-sides in project files `shiptorio/shaft/side-by-side/`). Static parts are merged into vertex-coloured meshes, so the default plan draws the stack in 1372 calls (build 823, checks 768, launch 578). Known limit: 7+ researched checks run the checks row off the deck's left end; `layout.js` needs a second row (after Nov 4) |
| Design build mode and Codex task pack | parked (after Nov 4) | Justin 2026-10-27: optional Factorio / RCT-style build mode (place, move, rotate, rewire machines and belts). Spec `docs/BUILD-MODE.md`: every piece, its real pipeline meaning and ports, the per-tier grid on the vertical shaft (`web/src/map/shaft/layout.js`), the `Blueprint` model, `compile()` from layout to real pipeline config, safety rules, server draft/apply, web tools behind `?build=1`. 8-prompt Codex pack in project files `shiptorio/codex-prompts/build-mode.md`, parked until after Nov 4, then needs the shaft map on main |

## Staging burst harness — PR #372 (Codex, 2026-10-28)

Staging fixtures/analytics and public judge/version recovery produced failed supplemental 250-socket receipts; the requested 200 judge HTTP/sim + 50 socket profile remains unmeasured. Rebased onto dev as harness/docs/evidence only, withdrawing unproven runtime changes. Local CLI tests now require loopback and verify the socket adapter before startup after a possible 50 unauthenticated staging-handshake escape from an ineffective mock. Full local check: 1,506 passed, two existing platform skips, zero failures. No further hosted load or production promotion; exact-head quick checks and Staging are separate gates. Evidence and limitations: [reliability.md](reliability.md).

## Codex: public judge replay (2026-10-26)

- Landing-page follow-up: a Black Iron “Try the 90-second walkthrough” link below the tagline goes
  directly to `/judge`, labeled “No sign-in required · simulated factory”. Requested frontend-lane
  change, limited to `web/public/welcome/index.html`; no map, auth or simulator changes.

- Goal: `/judge` is a no-login, public exception to the preview/signup gate. Play starts a roughly
  90-second, explicitly labeled simulation; query parameters cannot select a live repo.
- Story: Sentry checkout crash + linked inbox report + GitHub docs issue → foreman plan → subscription
  assembler → CI / verify rejection + scar / rework / independent review → docs permit card → automatic
  docs rocket → human checkout merge rocket → approved reply → earned Advisor-to-Floor unlock.
  The permit can be clicked or the simulated player grants it around 65 seconds. Replay resets the run.
- UI uses `iron.css`, copy in `copy.ts`. No files under `web/src/map/` change: only the public
  `FactoryMap` props, `useFactory` protocol, and existing sound/ship events drive the presentation.
  This request explicitly authorizes the otherwise frontend-owned judge surface and sim fixture.
- Server explicitly serves the app shell for `/judge` and `/judge/`, plus public content-hashed build
  JS/CSS and already-public fonts/brand files. APIs, factory websockets, source maps, setup and private
  app routes keep their existing gates. Judge boot skips telemetry/flags and makes no API calls.
- Verification: `SHIPTORIO_TEST_PORT=8809 bun run test:e2e tests/e2e/judge.pw.ts` runs the full paced story
  at desktop, iPhone and Pixel sizes, including passive playback, interactive permit, scar, three green
  receipts, two actual ship events, 112 simulated users unblocked, Floor and replay reset. The optional
  test port avoids collisions with other agents; default remains 8799. Gate tests: `server/test/judge.test.ts`.
- PR: [#254](https://github.com/r3dbars/shiptorio/pull/254), branch `codex/judge-mode`.
  Local `bun run test:fast`: 662 passed, 2 platform skips; 26 playtest cases / 332 decisions, no findings.
  These are simulated outcomes, not proof of live AI/provider execution.

## PRs at a glance

Rule since 18:44 UTC: every agent merges its own PR once CI is green, then checks the Deploy run (AGENTS.md).

| PR | What | State |
| --- | --- | --- |
| #1–#9 | Scaffold, AGENTS.md, plan/art docs, context, Item Lab, pixel art port | merged |
| #29–#60 | Gauntlet on the map, click-to-zoom panels, hover labels, playtest fixes, sound, onboarding v1, mobile, check-in deck | merged |
| #65, #66, #69 | Floating island, ship celebration + sound | merged |
| #67, #78 | HUD v3 (top bar, dock, sheets, activity tray) + phone fixes | merged |
| #68, #70, #72 | Actions minutes (PR-only CI, skip docs, cancel stale), merge-own-green-PR rule, push-often rule | merged |
| #73 | Live ship loop: gauntlet stations, AI review, verify bay, merge gate | merged |
| #84 | New onboarding (welcome intro, two worlds, field guide) | merged |
| #81, #82, #83, #86 | Codex: in-game plan approval, scar-driven rework + real verify receipts, approval card fix, runner independent of checkout | merged |
| #85 | Codex: repeatable whole-game playtests + papercut reports | merged |
| #87 | Made by the game itself (Spark plan → local Codex → verify bay): direnv path guard | merged |
| #89, #91 | Sound for every gauntlet station; stations feel alive (verdict beats, CAUGHT! moment) | merged |
| #90, #97 | PostHog + Sentry mines: errors and traffic drops become ore | merged |
| #92 | Launch permits for real: earn, auto-launch, revoke, Automated % | merged |
| #93, #112 | Map tags name the code each machine works on; v3 consistency pass | merged |
| #94, #114 | Intro off by default, empty mines, Make it yours tools; welcome tour on the real map (`?intro=1`) | merged |
| #99, #102, #110, #115, #116 | Art passes 1–4: real rocket, calm paving, mechanical machines + stations, conveyor frames | merged |
| #109, #120, #121 | Playtest round 3, dogfood friction log, Spark capture plan | merged |
| #122 | Orbit watch: last station watches every launch for 24h | merged |
| #124 | Muse Spark visibly drives the factory: decision log, game master, plan comments | merged |
| #127 | Research tree: unlock real checks with science packs | merged |
| #174 | Achievements: 14 badges for real outcomes (first rocket, auto-launch, verify catch, 10 clean...), unlock toast + sound, HUD sheet, account pref | merged |
| #95, #98, #101, #111 | Codex: phone + Firefox login, security hardening, fresh CI before merge | merged |
| #96 | Codex: live bottleneck + check-in deck from factory state | merged |
| #100, #103, #117 | Codex: mobile/onboarding papercuts, first-run loop never idles | merged |
| #104, #123, #126 | Codex: sandboxed local verify, release receipts, orbit replay deadlines | merged |
| #118, #119 | Codex: live repo picker, disposed factories stop reconnecting | merged |
| #176 | Support mine: customer emails + Intercom chats → support well, Spark drafts replies, player taps Send (docs/context/support-mine.md) | open |
| #177 | Growth loop prototype: funnel drop → experiment → gauntlet → measure station (`?scenario=growth`, docs/context/growth-loop.md) | open |
| #175 | Geothermal power: local models (Ollama / OpenAI-compatible) as a free assembler for small jobs; fixed guard + planner route; map plant, power accounting, sim `?scenario=geothermal`. Docs: docs/runner-local-models.md | in progress |
| #3, #4 | Old pre-#1 drafts | closed |

## Runner resilience (Codex, 2026-10-26)

- [PR #259](https://github.com/r3dbars/shiptorio/pull/259), branch `codex/runner-resilience`, rebased onto current main; checkpoint: Oct 29 local runner.
- Implemented: per-repository capped reconnect backoff, private lease-bound recovery journal, automatic completion receipt retry, explicit subscription sign-in cards, and doctor auth/sandbox/pairing probes. Builds still require player approval; expired/revoked leases never resume automatically. No deployment requested.
- Focused macOS validation: 54 tests passed, including real sandbox/publication tests and card lifecycle through Factory reload; HTTP polling smoke also passed with dropped requests and an expired fake sign-in. Added immutable patch recovery, automatic receipt replay even when claim is empty, and cached-auth failure latching. Local full validation after rebase: `bun run test:fast` passed (671 tests, 2 platform skips; 24 playtest cases / 306 decisions / no findings), plus `bun run build`. Includes real macOS sandbox/publication probes and a doctor subprocess test. PR checks and merge result are on the linked PR. Merge gate: CI and stranger-path checks green on the exact head; native GitHub auto-merge is disabled, so the chat performs that gate.

## Real assembler edit doctor (Codex, 2026-10-26)

- [PR #275](https://github.com/r3dbars/shiptorio/pull/275), branch `codex/runner-edit-doctor`: add an explicit real subscription edit probe, proving exact file bytes and untouched canaries in a disposable checkout. Basic doctor stays inference-free.
- Integrates the merged supervisor proposal fix in PR #272 rather than replacing or weakening its outer OS sandbox. This branch does not touch the real #170 job, pairing or watcher.
- Fixture tests reject no-op success, extra/unapproved edits and provider failure. Real Codex 0.162.1 plus the unchanged OS boundary and scoped supervisor produced `answer = 1` → `answer = 2`; the unapproved file and outside canary were unchanged and git scope was exactly `example.ts`. This used immutable prerequisite #272 source plus the new shared job/doctor assembler helper in a disposable fixture. Public runner documentation describes the probe and nested Seatbelt failure. The full `doctor --edit codex` command reported PASS for Codex auth, sandbox, pairing and actual edit; it correctly exited nonzero for the separate missing Claude sign-in/sandbox. Integrated runner tests: 45 passed, 2 platform skips. Full `bun run check` passed after integration (726 tests, 2 platform skips; all workspace typechecks and production/web/standalone-runner build). CI/merge outcome is on PR #275.

## Codex guest progress on dev — PR #355

Rebased the guest-only save routes onto dev without replacing administrator view, write guards or progress reset versions. Guest GET progress reports resetVersion zero; signed-in stale reset writes still fail. Guest schema is migration0019 after admin/index/taps0016–0018. Full checks and exact-head dev CI are pending; password gate retained.

## Codex: self-host runner origin and live pairing (2026-10-26)

- `codex/selfhost-runner-origin` fixes the Power panel install command to use the current origin and pass it to the shell side of the pipeline. The installer downloads that origin's bundle, saves its endpoint for later invocations, and rejects cross-server reuse of existing pairings. The CLI accepts self-hosted HTTPS origins and loopback-only HTTP.
- Preserves the concurrently merged single-use join-code command: join arguments stay on the shell side of the same-origin installer pipeline; focused join-code and legacy device-pairing tests both pass.
- Narrow `web/` lane exception: `RunnerConnection.tsx` and its command helper, needed to correct the self-host setup defect; no layout/art changes or shared protocol changes.
- [PR #293](https://github.com/r3dbars/shiptorio/pull/293). Focused installation/update/pairing, saved-origin, cross-server refusal, HTTPS/loopback and shell-quoting tests passed; CI and stranger checks passed for the implementation.
- Live acceptance on a fresh clone at `3c99157`: temporary Worker `shiptorio-selfhost-test-c78b8e`; the rendered Power command and install/manifest/bundle downloads all used its workers.dev origin. A real GitHub App and OAuth session, installed only on the disposable same-name repo, authorized the browser device-pairing flow. The downloaded runner saved a 0600 pairing; the real Worker accepted heartbeat and empty job polling (200), refused a different repo (401), and the UI showed online. A fresh `once` launch without SHIPTORIO_URL retained the origin/token; cross-server reinstall failed before network activity.
- Pairing-only fixture: a synthetic local agent reports readiness; no real provider sign-in or agent build is claimed. All state and binaries used dedicated temporary directories, preserving the installed runner. Browser page identity/content, empty error/warning log, Power interaction and command/online screenshots were checked. Final combined version at `dd319f8` also passed the real one-paste join flow: its consumed code returns 410, and the installed bundle matches the deployment manifest. Cleanup is verified: token revoked (401), App/installation/repo deleted, temporary Worker/D1/KV/DO removed, isolated runner/token files deleted. No existing Worker was deployed or reconfigured.
- Merge blocked by GitHub Actions account billing: final-head jobs refused to start before any steps ([run 40440466519](https://github.com/r3dbars/shiptorio/actions/runs/40440466519)); previous implementation checks were green before the required one-paste integration rebase. Final focused install/pairing/join/origin/docs tests and runner/web typechecks passed locally. PR remains open until final CI can run; no checks were bypassed.
- Justin requested no existing Worker changes. Once green, the authorized squash merge must carry a workflow-skip marker so the main push does not trigger production Deploy. No repository deployment settings were changed.

## Codex (outside the Claude project)

Only what Codex has pushed is visible here, not its live session. Codex commits show as "J B" or "Redbars". As of ~17:20 UTC:

| PR | What | State |
| --- | --- | --- |
| #13 | Private preview (password gate), hardened issue → Spark → PR → inspector/rework loop, bounded alarm jobs, stale-check handling | merged. Supersedes #4's fixes |
| Game music | PR #263; merge authorized after green CI | Original 16-bar foundry score, activity layers, blocked brass and launch fanfare; separate persisted music volume, CC0, no audio downloads/decoded stems. Desktop/phone controls and two 65s recordings verified. Justin approved the live audition and requested the new theme as default; `?music=1` retains the older score for comparison. Code: `web/src/sound/foundryScore.ts`; evidence: `docs/evidence/music/`. |
| #19, #21 | Auto-deploy of `main` verified, `/api/version` shows the live SHA, shiptorio.com + shiptorio.dev live | merged |
| #3, #4 | Old protocol / factory drafts on the pre-#1 scaffold | superseded by #13 and the #14/#17 contract. Close them |
| Add real user accounts and sign-in | working | D1 `users`/`sessions`/`user_installations`/`user_repos`/`user_prefs` (migration 0004), revocable sessions, repo membership on every factory route, per-repo Sentry/PostHog keys + per-repo Sentry webhook, `requireUser` helper. Password gate stays in front. Next: web install link + prefs sync |
| Draft Shiptorio pricing options | PR open | Task 22. Three pricing models (BYO key / flat plans with fuel / pay per launch), unit cost from the code (≈$0.12 Spark per launch, ≈$0.40 Cloudflare per active factory), recommends flat plans: Free 20 launches, $19 solo 150, $59 crew 400. `docs/context/pricing.md`, numbers in `shared/src/pricing.ts`. Artifact: https://claude.ai/artifact/LrSxaUpsbMXnq5i9hxc8XH. Landing page gets a hidden `#pricing` block (`?pricing=1`) after the landing thread's PR merges |
| Write the Shiptorio docs site | PR #183 | Public docs at shiptorio.com/docs: markdown in `docs/site/`, built by `web/docs-site.ts` (search index, link-check test), `/docs` exempt from the preview password. 14 pages written from the code on main, not the plan. Gaps found while writing are listed in the PR |
| Build the Shiptorio landing page | PR (branch claude/project-thread-9fgomx) | Public landing at shiptorio.com `/` (static `web/public/welcome/`, real sim loop video, waitlist `POST /api/waitlist` in KV), app stays gated. See `docs/context/landing.md`. Codex #161 can adopt the waitlist |
| Make Shiptorio fast on phones | Merged #167 | Static batching `web/src/map/bake.ts` (models swept through `ART_STATES` in scene.ts; add a state there if a new part only moves in it), frame governor `web/src/map/quality.ts` (`?quality=0|1|2`), `?perf` overlay + `window.__shipPerf()`, `web/scripts/perf-bench.mjs`. Draw calls 2,673 → ~1,300, phone first paint 2.65s → ~0.65s. Next: lazy zod in progression, Worker latency (Codex prompt `shiptorio/codex-prompts/worker-latency.md`) |

Next for Codex: the "connect the mines" prompt (GitHub App end to end, then Sentry, then email + Stripe test mode).
Prompt packs for Justin live in the Claude project's files under `shiptorio/codex-prompts/`.


## Deploy browser smoke (Codex, 2026-10-28)

- #367 adds actual canvas pixels, zero console/page errors and screenshot artifacts at 390×844/1440×900, including restored-version browser smoke after rollback. Preserves pinned Actions and real-storage checks; the judge-only CSP correction is user-authorized.
- Local full check: 1,422 passed, two existing platform skips, zero failures; types/builds pass. The built-game local drill passes healthy → exact deliberate JS crash rejected → original assets restored at both sizes, with six screenshots. On-demand GPU readback allows 30s startup inside the unchanged 45s CLI cap; earlier local timing failures are preserved.
- [Earlier Deploy 40572720445](https://github.com/r3dbars/shiptorio/actions/runs/40572720445) failed screenshot stabilization, restored the saved Worker and passed restored API smoke; restored browser smoke correctly flagged the old CSP error. The failed run remains intact; capture now uses Chromium’s compositor.
- New policy: target `dev`, merge only on exact-head check/selfhost/Stranger/CodeQL, then verify Staging. Production fault drills remain prohibited and unproven; no green main Deploy containing this gate is claimed. Live-socket/account work is separate. The prepared production fault branch has never been dispatched.

## Deploy smoke + automatic rollback (Codex, 2026-10-26)

- Day 1 deploy reliability checkpoint, extending merged #173: one local/CI smoke
  script checks access form 200, wrong password 401, GitHub redirect, exact build
  SHA, landing/private gates and HTTPS. Explicit GET /access is now 200; GET
  /auth/login can start OAuth before preview access (private routes stay gated).
- Deploy saves the active Worker version before mutation, rolls back on deploy or
  smoke failure, verifies recovery, and leaves a red job with error annotations
  and a summary. Manual branch deploys share the production concurrency lock.
- Implementation [#250](https://github.com/r3dbars/shiptorio/pull/250) merged after CI
  and stranger-path checks passed. Local validation: 656 tests passed, 2 platform
  skips; workspace + test typechecks, build, 24 playtest cases (306 decisions) passed.
- Healthy production [Deploy 40428675804](https://github.com/r3dbars/shiptorio/actions/runs/40428675804)
  passed every smoke at `dc2843715157e0835c52019db00cccb16537718d`.
- **Live rollback proved**, 2026-10-26 7:52 PM CT: temporary branch
  `codex/deploy-smoke-drill`, commit `bd4bd76d4ebc6814a64d748311c8fe5a2a73e175`,
  deliberately returned 503 for Cloudflare GET /access. [Deploy 40428959075](https://github.com/r3dbars/shiptorio/actions/runs/40428959075)
  deployed bad Worker version `8ab17ba2-93fa-45fb-8749-b72db215a017`, failed smoke
  with “GET /access: expected 200, got 503”, then automatically ran Wrangler rollback
  to captured version `e06a9ca5-cda0-4097-912a-112034233b87` at 100% traffic.
  Cloudflare's active-version check and all restored-site smoke probes passed at
  `dc28437`; the job remained **failed**, with an error annotation and summary.
  Failure detected 00:52:28Z; restored smoke passed 00:52:32Z (about four seconds).
  The fault branch was never merged and was deleted after the drill.
- See scripts/smoke/README.md for local use and repeating the drill. No data/schema
  rollback is claimed; cancellation/timeout cannot guarantee automatic recovery.

| Stranger E2E: browser runner pairing | in progress | Full browser journey exposed Chromium submitting the device approval form with opaque Origin under no-referrer, rejected by the same-origin guard. Pairing page now uses same-origin referrer policy; foreign and missing origins remain rejected. Day 4 runner checkpoint. |

## Spark spend and factory budgets (Codex, 2026-10-26; PR #255)

- Checkpoint: Friday cost/power guardrails. `codex/spark-spend` adds migration `0012_spark_spend.sql` (checked against #150's gapless-number guard).
- D1 records each factory's UTC day, calls, measured input/output/cache tokens and estimated USD. Default daily budget: **$5 per factory**; the stable payer can change it in whole cents, including $0 to pause.
- Before each Meta attempt, reserve UTF-8 input upper bound plus capped output at Spark 1.3 standard rates. Concurrent reservations are atomic. Reported usage settles once; missing usage/errors keep a conservative reservation and show as unmeasured. Existing account call/token limits remain in force. Unknown model prices fail closed.
- Owner HUD chip → How it thinks: usage, 80% warning card, daily budget form, 100% stop explanation/reset at 00:00 UTC. Admin `/admin` has a Black Iron spend table. Early stop is possible when the remaining budget cannot cover the next reservation. No additional model call is spent explaining a stop.
- Explicitly crosses into `web/` for the requested owner UI; adds a REST endpoint rather than changing the shared websocket contract. Simulator remains independent.
- Pricing source, checked 2026-10-26: https://dev.meta.ai/docs/pricing-rate-limits — $1.25/M input, $0.15/M cached input, $4.25/M output. These are estimates, not invoices. No historical backfill: old account totals cannot recover per-factory token splits.
- Validation: full fast suite passes (662 passed, 2 skipped), all workspace/test typechecks, build, and 24 playtest cases / 306 decisions. Playwright budget flow passes on desktop, iPhone 14 and Pixel 7; admin table refresh renders without console errors in a local authenticated SQLite fixture. No paid API request was made for validation.
- Tests: real SQLite concurrency, isolation, cached pricing, idempotent settlement, missing usage, midnight rollover, zero budget, pre-fetch denial, owner-only reads/writes and origin/amount validation; browser budget save/stop/resume and warning checks.
| Stranger E2E: preview gate CSP | in progress | Browser console assertion caught the outer security middleware replacing the preview gate nonce policy, blocking the gate animation script. Carry the server-generated gate nonce into the global script rule on both fast and wrapped paths, retaining all other global restrictions; application-page policies remain unchanged. Separate fix for the first-day signup checkpoint. |

## Codex merge helper — October 28, 14:33 UTC

- Check-only: [#473](https://github.com/r3dbars/shiptorio/pull/473), exact head `5a944c875918d650e729cfd7ae090e6766772824`, had no manual browser/load run. Dispatched [CI 40707196857](https://github.com/r3dbars/shiptorio/actions/runs/40707196857); pending, not ready or merged. Regular check/selfhost were green.
- #449 (`63a783cc`) and #388 (`54ec7483`) are already incorporated in root release #445; avoided competing owner dispatches. Root candidate `c851afaf` remains held after desktop buildout deadlines in [full CI 40702699687](https://github.com/r3dbars/shiptorio/actions/runs/40702699687); root diagnostic [40706832104](https://github.com/r3dbars/shiptorio/actions/runs/40706832104) is running on new diagnostic source, not accepted release evidence.
- Drafts and factory PRs were excluded. No branch retarget, merge or Cloudflare mutation.

- 14:43 UTC recheck: #473 remains at `5a944c875918d650e729cfd7ae090e6766772824`. In [40707196857](https://github.com/r3dbars/shiptorio/actions/runs/40707196857), check/selfhost and Pixel browser passed; load failed its budget and desktop/iPhone remain running. The owner already [commented once with the failing run](https://github.com/r3dbars/shiptorio/pull/473#issuecomment-6471950027). Preserved the failed head/run, no duplicate comment or retry, not marked ready. #449/#388 remain incorporated in root’s held batch; no competing dispatch.

- 14:53 UTC final #473 receipt: [40707196857](https://github.com/r3dbars/shiptorio/actions/runs/40707196857) finished failed on the unchanged `5a944c87` head: desktop/iPhone browser and load failed; Pixel/check/selfhost passed. Regular Stranger and CodeQL passed. The owner already linked the [browser failure](https://github.com/r3dbars/shiptorio/pull/473#issuecomment-6472174282). No duplicate comment, unchanged-head rerun, merge or ready claim; root retains the failed evidence for its next changed-source release candidate.

- 15:26 UTC check-only dispatches for newly ready Claude heads: [#477](https://github.com/r3dbars/shiptorio/pull/477) `785c1fd850a3b8eb9df3367bfeab13166b0691bb` → [40716107444](https://github.com/r3dbars/shiptorio/actions/runs/40716107444); [#480](https://github.com/r3dbars/shiptorio/pull/480) `a7fec674e94c8893df10fb27d708d8b4b10df25c` → [40716111907](https://github.com/r3dbars/shiptorio/actions/runs/40716111907). Neither had manual browser/load coverage at its exact head; dispatched sequentially, pending, not marked ready or merged. Both remain outside root’s frozen `272faa75` release. #473 failed run preserved; #449/#388 already incorporated, no competing dispatch.

Historical check-only receipts above predate the dev-first flow; the ten-minute helper is stopped. Current work targets dev and does not use release batches or manual release-validation stamps.

## Codex: BYOK self-hosting (2026-10-26)

- Branch `codex/selfhost`: `bun run selfhost` creates dedicated D1/KV through Wrangler, migrates, uploads Meta/GitHub/preview/session/encryption secrets, bootstraps the GitHub App setup page, deploys and prints the workers.dev URL. Uses an ignored owner config and resumable non-secret progress; never inherits production domains, IDs, users or mines.
- Public Black Iron docs: `docs/site/self-host.md`; docs index and maintainer setup guide link to it.
- Bootstrap: the existing `/setup` requires GitHub auth before an App exists. The self-host config explicitly opts into preview-password-authenticated setup only until `GITHUB_APP_ID` is set, then the wizard disables it. Normal deployments retain their existing login requirement.
- CI `selfhost` job uses a fresh clone with no Cloudflare credentials, builds assets/runner, applies local D1 migrations and runs real `wrangler deploy --dry-run`. Focused tests cover isolated config, forbidden Worker names, resume and failures.
- Local dry run passed with all 12 migrations and Worker/assets bundle. Live resource creation, credential upload, GitHub callbacks and end-to-end factory operation are not exercised by the dry run. No Cloudflare resources were changed during development.
- Advances the Day 1 Cloudflare/GitHub setup checkpoint for open-source users with their own keys: [PR #266](https://github.com/r3dbars/shiptorio/pull/266). Local validation: 677 tests passed, 2 platform skips; all workspace/test typechecks; 26 playtest cases / 332 decisions; fresh-clone install, local migrations and Wrangler dry-run passed with a clean tracked tree. CI gates the merge. GitHub auto-merge is disabled for this repository, so Codex will merge only after green checks, as requested.

## Factory-triggered Spark spend proof (Codex, 2026-10-26)

- [Live proof](spark-spend-live-proof.md): recovered the exhausted 20/day allowance to 21 without resetting usage, after quota fix #269 deployed. Requested Plan #10 through the testing factory's real websocket action; Spark completed a plan awaiting approval.
- Five real Worker Meta calls, 2,795 input / 2,231 output tokens (369 cached input), $0.0125696 estimated; zero unmeasured calls. Admin and owner endpoint match; real browser admin row, HUD chip and How it thinks panel verified. Build run usage stayed 20/21 throughout planning. Public [Spark docs](../site/spark.md) now describe spend and quota recovery.

## Quota recovery (Codex, 2026-10-26; PR #269)

- Day 1 loop reliability: [PR #269](https://github.com/r3dbars/shiptorio/pull/269), `codex/quota-recovery`.
- Black Iron live card warns at 80% and at exhaustion, naming the allowance, used/limit,
  local reset time and 00:00 UTC. `/admin/signup?login=…` selects the correct run owner or
  stable Spark payer for quota increases. Resource caps have no timed reset; job slots
  free on completion. Dollar totals remain private to the stable payer, who can open
  the existing thinking-budget editor. Global Spark pause and refresh failures stay visible.
- Card refreshes every 15s, on focus/visibility, and after budget edits. Requests time out
  so a hung refresh can recover. Raising run/call/token caps takes effect on the next
  attempt, with no restart. Migration `0013_quota_controls.sql` adds nullable per-account
  Spark call/token overrides; blank inherits Worker defaults, zero pauses that allowance.
- Local planning only checks run capacity; actual dispatch charges it. Lost claim responses
  reuse the lease without another charge. Failed, declined or stale plans spend no run.
  Quota-paused ready jobs remain ready and poll without abuse-counter writes.
- Failed planning persists a per-issue UTC-day ledger: 1m, 2m, then until midnight after
  three failures. Restarting the factory or changing the issue does not bypass it. Early
  plan cards disappear; the alarm wakes at cooldown expiry. A new plan still requires
  the player's approval. The optional hosted assembler also charges after successful
  scoping, when writing starts, and uses the same cooldown after scoping failures.
- Rebases include #259 runner resilience, #262 approval binding and #265's separate
  per-autopilot-session attempt cap. Narrow `web/` edits implement Justin's requested
  card; shared websocket contracts and the simulator remain unchanged.
- Validation: all workspace/test typechecks; full fast suite (697 passed, 2 platform
  skips); 26 playtest cases / 332 decisions, no findings; production build. SQL-backed
  enforcement/reset/admin/access tests plus real Factory failure/restart/dispatch tests.
  Playwright card warning → stop → admin link → recovery → retry cooldown passes on
  desktop (1440×900) and iPhone 14 (390×664), with no page or console errors. Existing
  spend-panel save/stop/resume also passes on both. Browser plugin unavailable; used
  project Playwright. Browser quota states are mocked; backend enforcement uses SQLite.
- No manual deploy or Cloudflare resource changes. Production recovery remains untested;
  migration 0013 must run through the existing deployment workflow. No historical run
  counters were reset or refunded.
## Claude runner login and two subscription plants (Codex, 2026-10-26)

- Checkpoint: Oct 29 local runner / Oct 30 power routing. Branch `codex/claude-runner-power`, [PR #274](https://github.com/r3dbars/shiptorio/pull/274); based on current main including #235 and runner recovery #259.
- Claude subscription login explicitly uses its canonical private `.agent-home/.claude` via `CLAUDE_CONFIG_DIR`, shared by login, status, doctor and sandbox execution. Claude temp files are isolated too; the macOS agent profile can read only the system timezone database needed to avoid an ICU/Intl startup spin; no personal agent homes or inherited API keys are exposed. A successful login wakes the expired-auth guard even when credentials live only in Keychain.
- Recheck sign-ins before each assignment. Use Spark's preferred subscription when free, otherwise another signed-in subscription runs the unchanged approved plan/scope. Retain the one-build supervisor and original provider on recovery; never downgrade a subscription assignment to geothermal.
- Heartbeats publish separate Codex / Claude Code plants before the first job, update logout/offline state, and clear stale/revoked plants. Power sheet shows availability rather than an invented remaining subscription quota. Crosses into `web/` only for this requested Power sheet behavior; no shared schema change.
- **Justin must reinstall the runner bundle after merge** (standalone installer or legacy `runner:service install`). Existing running helpers do not update with the website. Sign into Claude using the installed runner's real data root; macOS Keychain identity depends on that path. The PR includes the reinstall paste.
- Validation: full fast suite passes after rebase (723 tests, 2 platform skips), workspace/test typechecks, build, 26 playtests / 332 decisions / no findings; Power sheet browser checks pass on desktop/iPhone 14/Pixel 7. CLI login → stored status → real sandbox uses a provider fixture; native Claude 2.1.310 separately reaches its expected signed-out error in the macOS sandbox with zero tokens. Provider dispatch, unchanged recovery leases and independent auth guards are covered. Justin's dedicated browser sign-in and a real Claude-produced PR remain acceptance steps. CI gates merge; repository auto-merge is disabled, so this chat merges the verified head after green checks.


## Owner quota recovery (Codex, 2026-10-26)

PR #281 fixes the Day 1 issue-to-PR checkpoint blocker: migration 0014 upserts `r3dbars`
with 99999 factories/repos, 200 runs/day, inherited Worker Spark quotas, enabled access,
and deletes only `runs:r3dbars` from the abuse ledger. Explicit `ADMIN_LOGINS` identities
(default `r3dbars`) bypass resource caps and retain a 200-run floor even without a row;
signup/repo authorization and explicit revocation still apply. Quota telemetry uses the
same effective limits. The existing #269 failed-plan accounting stays in place: no build
run until dispatch; per-issue backoff of 1m, 2m, then midnight UTC after three failures.
The daily retry cap now also holds when a stored cooldown timestamp has elapsed.
Regression tests cover absent/low/high owner limits, ordinary users, wildcard configuration,
resource attribution, migration upsert/cleanup, zero-charge failed plans across restarts,
and independent issue retry caps. Validation and merge are tracked in
[PR #281](https://github.com/r3dbars/shiptorio/pull/281); its final verification comment
links the successful Deploy run, including D1 migration application and live smoke.

## Live quota admin form recovery (Codex, 2026-10-26)

Follow-up [PR #284](https://github.com/r3dbars/shiptorio/pull/284) to #269 on `codex/quota-admin-origin`: verified Deploy run 40432397609
succeeded and production SHA `6c7bca1` includes its merge. The real
r3dbars/shiptorio card showed 20/21 runs and correctly linked to the prefilled owner
admin page. Native Save returned 403 `invalid origin`; no quota change persisted.
The global `no-referrer` policy makes Chromium's native form Origin opaque, as with
the already-fixed pairing form. Use `same-origin` only on `/admin/signup` as well;
retain exact Origin/CSRF checks and hide off-site referrers. Replace the mocked
admin popup in quota browser tests with the real authenticated form and persisted
save/reload checks, passing on desktop and iPhone. Public FAQ now explains quotas and
recovery. PR #284 carries the deployment and live stop/recovery verification receipt.
The rejected production saves left all original account limits intact.

## Overnight paper-cut sweep (Codex, Oct 26–27, 2026)

Oct 26, 9:22–10:08 PM CT: #302 merged (browser QA imports), 160 page checks, 10 logged cuts; GitHub billing blocked Deploy and report #309. Protected work untouched. Receipts/resume: [papercuts.md](papercuts.md).
## Runner overnight recovery

Codex: eight-hour grant expiry plus final-hour, job-loop-only renewal explains the
reproducible sleep gap left after #340's persistence fix. Extending bounded grants and
renewing from the independent heartbeat; preserving revocation and saved work.


## Codex merge helper

- 2026-10-27: root queue release integrates #443 governance-slot fix, reviewed #442 pinned action updates and #376 check-only receipts. #170 fresh plan awaits Justin; UI #444 and factory #373 remain excluded. Exact combined checks and production deployment are required before release.

- 2026-10-27 23:13 UTC: ready Claude heads inspected after root #438 deployed. #433 exact `dbf5df18300712090f452a1e126a902aaff77ea0` had no manual browser/load run; dispatched [40600771254](https://github.com/r3dbars/shiptorio/actions/runs/40600771254) once. Queued; not ready proof. One manual PR at a time. #427 remains under root hold for buildout acceptance coverage/rendering; no duplicate dispatch, no merges or retargets, no factory changes.

Historical check-only dispatch receipt (heads below are superseded; queued was never counted as green):
- 2026-10-27 19:50 UTC: check-only batch helper; no merges or retargets. Ready Claude PRs had green check/selfhost and Stranger on the heads below, but browser/load were skipped. Dispatched each missing manual CI once; queued is not ready-to-release proof:
  - #357, `89268d9ae8c8524acb46c0f9480ce776b844b502`: [CI 40572747521](https://github.com/r3dbars/shiptorio/actions/runs/40572747521), queued.
  - #359, `38f60297ed4f2fe769dba24238b636f9ba436843`: [CI 40572751171](https://github.com/r3dbars/shiptorio/actions/runs/40572751171), queued.
  - #363, `92e4e5232bfb995befe8e24a5083e385193c62ab`: [CI 40572754927](https://github.com/r3dbars/shiptorio/actions/runs/40572754927), queued.
- Root owns final combined release checks and Deploy. Factory PRs untouched; password gate unchanged.

- 2026-10-27: #342 head `1dbb4fc376a2cfe4673b66b770f31d689465ae71` passed required check/selfhost/Stranger and full manual browser/load [40564032048](https://github.com/r3dbars/shiptorio/actions/runs/40564032048). Squash merged as `7304199df5ed6259e7a8fff8d5402f21dfe67ab5`; [Deploy 40565415889](https://github.com/r3dbars/shiptorio/actions/runs/40565415889) green; live version matched and private factory returned 401 anonymously.
- 2026-10-27: #346 was already merged. Updated its branch from main through merge commit `db5614982220d4eafeff107cf82e022b6c6f4501` (identical tree to deployed main at dispatch). Manual browser/load [40565878063](https://github.com/r3dbars/shiptorio/actions/runs/40565878063) passed all jobs. [Deploy 40566612966](https://github.com/r3dbars/shiptorio/actions/runs/40566612966) passed at verified descendant `1bdeeb4`; no second PR merge attempted.
- 2026-10-27: #345 is already merged; updating the historical branch from main `1bdeeb4` returned a merge conflict. Owner notified in the PR; no code was edited. Its integrated code was covered by the green full manual run for #346.
- 2026-10-27: #350 updated from main using GitHub update-branch, head `42b5bfcf1a64cf4fa1b16e4dd0aff3125d5bda82`. Full manual check [40567425171](https://github.com/r3dbars/shiptorio/actions/runs/40567425171) dispatched; merge awaits exact-head checks.
- 2026-10-27: Justin replaced per-PR deployment with tested release batches every 30–60 minutes. Individual changes remain small reviewed PRs; a frozen combined batch gets full browser/load checks and one verified main deployment. The pending source-branch manual run for #350 was superseded, not counted as a pass.
- First batch [#362](https://github.com/r3dbars/shiptorio/pull/362): #351 (`775d152`), #350 (`98be03e`), #352 (`4446c59`) and #353 (`e23ab13`) passed individual check/selfhost/Stranger and were squash-integrated into `release/2026-10-27-runner`. These are integration results, not production release claims.

- Batch #362 also integrates #360 (overnight recovery) and this log. The combined runtime at `87ce41e` passed local full check: 993 passed, two existing platform skips, zero failures, plus types and builds. Final batch CI and production deployment remain pending.
# Judge duration regression

Codex: preserve the advertised 90-second public judge replay after ordinary sandbox
ticks were slowed to 1.4 seconds. The unchanged iPhone end-to-end test caught the
first tick failing to advance at 900 ms; only judge cadence returns to 900 ms.

## Journey navigation readiness

Codex: the desktop CI trace returned the correct factory document in 33 ms but
delayed committing/booting it by about 29.5 seconds. Observe navigation commit
explicitly, then retain URL, live snapshot, approval, PR, gauntlet and launch
assertions. This is test synchronization, not a claim of improved product speed.


## Preserve owner AI limits during deploy

Codex: the operational production-owner upsert replaced raised call/token limits
with NULL on every deploy. Preserve existing values, including explicit zero; a
new owner row still uses normal defaults. Regression executes the actual deploy SQL
twice and checks raised, zero and fresh-row cases. No usage ledger is reset.

## Browser verification rendering mode

Codex: the final release desktop trace spent tens of seconds on ordinary clicks
and document readiness, leaving only six seconds for the final rocket assertion.
Use Chromium WebGL-only SwiftShader fallback rather than SwANGLE for the whole
compositor. Preserve actual 3D rendering and every test assertion, deadline and
visual baseline. Extracted narrowly from the CI performance lane; full370 stays
for the next batch. Failed40574810643 is retained.

## See what players say yes and no to (Claude, Oct 27, 2026)

Card tap log + eval: every dealt card, the planner's reason, the tap (Continue/other/Later/Never chip/untapped),
time to decide and the approved work's outcome go to D1 `card_taps`. `/admin/taps` shows yes rates by kind and
area, model vs rules, most skipped and outcome quality; `signals/taps.ts` is the brain's taps collector and the
game master reads a short `taps` brief. Doc: [taps.md](taps.md). Meta API audit: [meta-api.md](meta-api.md) (native structured output behind `SPARK_NATIVE_JSON=1`; native tools/Responses API deferred). Migration 0016 may need renumbering in the batch.
## Vertical judge clock and suite completion

Codex:72219fb fixed the desktop journey (hosted2.2m pass) but the separate
shaft replay relied on real timers and missed scar1 within60s. Drive its same
900ms ticks explicitly and capture verifiedbeat4 whilepaused; preserveevery
assertion and180s testdeadline. Nine serial desktop cases overran the12min job
as the failed report printed, so only the wholejob budget is18min to retain
complete evidence. No production runtime or visual baselines change.

## Public repository guardrails (Codex, Oct 27, 2026)

Added advisory CodeQL, grouped weekly dependency updates, private reporting/scope policy,
and HTML response-header regression coverage preserving the preview nonce. Full-history
secret-scan counts and validation receipts are recorded in the PR; see [security.md](security.md).

## AI review eval (Codex, Oct 27, 2026)

Day 2 gauntlet trust checkpoint: pinned 15 Testing patches (10 bad, 5 good), executable witnesses and a live production-reviewer harness. Results and limitations are generated in [EVAL.md](../EVAL.md) from raw receipts; no production reviewer changes.

## Codex private CPU preparation on dev — PR #428

Rebased only the four original adapter commits onto updated isolated-test source #354, keeping the nine-file measurement delta separate from historical unrelated UI work. Local projection tests pass (four tests,28 assertions), and the private real-workerd probe passes signed webhook, heartbeat, empty claim, native alarm, replay/argument/public-route denial and zero native egress. No remote caller, resource/configuration change or measurement was authorized or executed; the historical A/B pair and30% target remain unproven. Merge after #354 and current dev checks; no production promotion.

## Codex persistent private staging fixture — PR #495

Normal Staging deploys retain the tester flag/service binding only on shiptorio.dev and update the already-approved private fixture using committed nonsecret resource IDs. Read-only preflight refuses missing/mismatched resources, public subdomain exposure or missing secret names; no creation, credential generation, production-config change or native provider call is permitted. A post-deploy preview-gated signed request verifies key compatibility without installing/resetting/building/launching. First manual bot verification does not enable nightly readiness; actual hosted proof is pending.

## Codex gauntlet progress — PR #502

Periodic reconciliation could spend nine installation request slots between verify and AI review, making the unchanged 45-second Stranger acceptance depend on alarm timing. The real Factory now advances at most two stations for one unchanged PR before background polling, retaining per-station fresh GitHub evidence, inspection identity, resource cooldowns and operator pauses. No API limits or test deadlines change; no merge is automatic. Focused scheduling/freshness/rework/permit coverage passes; final full check and exact-head CI are required before dev merge. The first hosted run passed the unchanged gauntlet deadline and real hold-to-Launch fixture, then exposed a separate harness parser bug treating the legitimate exact `pong` heartbeat as malformed JSON. Only that reserved text frame is now classified separately; malformed/unknown non-JSON frames still fail and all gameplay assertions remain enabled.

## Testing proving ground (Codex, 2026-10-27)

[Testing PR #18](https://github.com/r3dbars/Testing/pull/18) adds CI and new tests only: executable README examples, source/built CLI coupon checks, and fixtures proving the gate rejects #12's silently ignored `--coupon SAVE10` form. Nine tests, types, build, and five gate fixtures pass locally; the real README gate remains red on main's stale npm Setup until the separately owned README rework lands. No merge of #12/#13 was attempted (#13 was already merged at inspection). All ten ladder drafts (2 docs, 3 reproduced bugs, 3 tests, 2 tiny features), scopes, and acceptance lines are in #18's description. Justin explicitly asked to hold publication until the queue clears: the live check found 12 stuck queued items and shared usage of 214/400 calls, 956879/1000000 tokens. Open nothing until a fresh queue/budget check permits the first batch, then release 3/3/3/1. Testing #18 stays draft and unmerged until its real README check is green; these receipts do not certify clean factory ships or an autonomy level-up.

### Codex reconnect-safe decision transport (2026-10-28)

Draft #524 follows #517 replay-idempotency: live choose/defer/dismiss taps remain in source-scoped memory through reconnect, replay only after matching fresh snapshot/unchanged action scope, and clear on resolution or disposal. Missing acknowledgements force resync after10s, max3 send attempts/60s, then visible retry warning. No machine-write replay or persistent client storage. Native Stranger approval socket-cut regression preserves all existing runner/PR/Launch assertions; hosted evidence pending. Focused28 transport tests/108 assertions pass.

## Quiet live reconnect (Codex, 2026-10-27)

Day 2 live-map checkpoint: replace sleeping sockets on tab return/network recovery,
use heartbeat deadlines and jittered retry, and resync from one sequenced full snapshot.
A small Reconnecting… notice waits three seconds; short blips retain the current map.
Existing transport lifecycle tests move to web/test; factory.ts needs the small
sequence/snapshot/heartbeat wiring because browser-socket.ts does not own delivery.
Contract/journey assertions recognize seq/pong; the deck fixture drains background
check-in work and the goal assertion allows transport metadata. Comeback, sound,
shaft, source/index.ts and other active lanes remain untouched.

## Root release reconciliation (2026-10-27)

Main received #427 as c5e23309 while #445 was completing its green older-base checks. Deploy40604211672 cancellation raced Cloudflare acceptance; root restored the recorded verified eb6a820 Worker using [Rollback40604702919](https://github.com/r3dbars/shiptorio/actions/runs/40604702919). Live version matched eb6a820 and anonymous factory access remained401. Preserve all merged main code in the repair candidate, apply only the reviewed buildout elapsed-clock backport, restore complete Pixel coverage and correct logical no-piece assertions. The reduced builder still has an observed4.5-second budget failure; older green #445 checks do not validate the newly combined candidate.

Deployment recovery receipt: [Rollback40604702919](https://github.com/r3dbars/shiptorio/actions/runs/40604702919) is green and live `/api/version` is eb6a820; anonymous `/api/me` returns401. `DEPLOY_ENABLED=false` is a temporary repository release freeze, not deletion of auto-deploy. Restore it only with validated current-main repair. #445 now preserves c5e23309 plus the queue/action fixes, reviewed elapsed animation clock, logical-step assertions and all Pixel cases. Its previous52b4f2f1 all-green run predates that combination. Shader prewarm owner #446 is under runtime review; its relaxed timing/hold tests are excluded.

Final repair validation candidate: #447 shader warm-up retains current material state and releases cached twins with originals; #448 partitions all browser cases across six viewport/shard jobs without changing deadlines; #449 removes the demo rocket real-merge claim; #450 bounds exact-output short-text redaction caching and invalidates it on new credentials; #451 validates ordered phase prefixes across already-completed automatic steps; #452 makes the existing600ms guard visibly disabled and occurrence-fenced. Each source passed its scoped proof; #447/#450/#451/#452 also passed a full local check. The previous f5e strict matrix had all three reduced journeys passing original timings, with three full-motion failures (one test snapshot race and two dropped fresh taps); its load p95 was5177ms against5000. Those failures remain retained. Fresh combined full check, original strict six cases and all nine CI jobs are required; no skipped draft checks or old-head success count as acceptance. Production stays on verified eb6a820 with auto-deploy temporarily paused until this repair passes and main Deploy is explicitly verified.

Slow-renderer follow-up: #454 makes existing low-quality fallback recognize two sustained foreground500–2000ms frames (including idle phones), while preserving pins, hidden/clock-jump handling and hold safety. #455 threads optional render elapsed time only to floor growth; physics, driver, other updaters and legacy stepping retain their original delta. Before fixes, remote862e CI missed6-second holds and15-second floor completion even though strict local6/6 passed. Both fixes have failing-before/passing-after regressions and one green full check; the next exact combined nine-job CI run must validate all48 browser cases before release. No retry, frame-clock safety, test deadline or workload was relaxed.

Combined candidate `2eb0199e` remains held: [CI 40611004397](https://github.com/r3dbars/shiptorio/actions/runs/40611004397) passed check, selfhost, load and all three second browser shards, but failed the first browser shards on hold responsiveness and journey/floor assertions. [Stranger 40611011939](https://github.com/r3dbars/shiptorio/actions/runs/40611011939) passed. Owners are tracing the actual renderer cost and captured event order; no unchanged-head retry or acceptance relaxation. Root also integrated #388's pinned `54ec7483` test-only change: an isolated merge onto `2eb0199e` passed a full local check (1,337 passed, two existing skips, zero failures). This is local compatibility evidence, not a merged or deployed release. Production remains verified `eb6a820`, with the password gate and temporary deploy freeze retained.

Measured hold/consent repairs: #457 (`0ca5fdfc`) yields only expensive scene submission during a genuine hold, preserving simulation and the existing consent clock. An unpinned SwiftShader/4x CPU probe recorded a native press-to-build start of 1,061ms, with drawing paused during the hold and resumed afterward; full local check passed (1,340 tests, two existing skips). #459 (`7579482d`) fixes an actual captured carried-release approval: the previous issue press ended after the planner's 600ms guard expired, so its release approved the new card. Settled buttons now require their own current-generation pointer/key press; bare assistive activation remains supported. Real component regressions fail before and pass after; full local check passed (1,338 tests, two existing skips), and independent code review found no blocker. These source receipts do not replace the final combined browser/Stranger/security checks or main deployment verification.

Further retained evidence: [CI 40613954864](https://github.com/r3dbars/shiptorio/actions/runs/40613954864) passed check, selfhost, Stranger, CodeQL and every second browser shard; phone reduced journeys passed. It failed load tick p95 (5,340.79ms against 5,000ms), late celebration checks and desktop duration/overall time. #460 (`c27c1b20`) removes unchanged decision publications while preserving actual-frame authorization, reconnect snapshots, new-secret redaction invalidation, and identity-guarded retry after cursor storage failure. One controlled local pair measured tick p95 1,027→755ms on its earlier performance head; final correctness additions passed focused tests and full check. This is local evidence, not a prediction of CI or billed production CPU.

#462 (`ecc09a38`) retains an actual visible shipped-card observation starting immediately before manual Launch, with the original 30-second bound. The captured Pixel trace shows the visible green SHIPPED card after manual input, before the old late poll; early/missing celebrations still fail. #461 (`7ce2ce73`) carries elapsed time through construction phases instead of dropping overshoot, stops before spending it on another queued build, and lets natural particle tails finish during payoff. Real-controller regressions cover slow frames, actual holders, cleanup, hurry and queue boundaries. The combined `097ecb02` full local check passed (1,362 passed, two existing skips, zero failures; lint/types/build green). The standalone runner bundle remains unchanged. A controlled three-build software-renderer comparison found no meaningful benefit from disabling trace screenshots, so full tracing is retained. Remote combined acceptance and deployment remain pending; production is still the verified rollback with the password gate enabled.

### Codex Later intent receipts (2026-10-28)

Draft prerequisite for #524: optional defer_move intent UUID is correlation only. The same atomic deckBook write stores the parked choice and a bounded player/move/scope receipt; replay across reconnect reparks without another defer count or teaching reset. Focused restart/ack-loss/storage-interruption regressions pass. No web UI/art changes; hosted CI still required.

## GitHub merge readiness guard (Codex, 2026-10-28)

[#464](https://github.com/r3dbars/shiptorio/pull/464) reuses the permission-free first
commit of #406 (complete station receipts and current-head/base fencing), excluding
its held Administration-policy reader. Before: reported checks plus station passes
could offer Launch while GitHub reports `behind` or `blocked`. A failing-before
regression reproduces that false green. After: an uncached PR read requires an open,
non-draft, explicitly mergeable `clean` PR on the inspected head and configured base.
All other/missing states or API failures wait without discarding completed proof;
carried Launch cards are withdrawn, and the final merge rechecks even an overrule.
No new App permissions, direct factory merge, policy bypass or check-name list.
This aggregate readiness snapshot does not enumerate required-check/App provenance;
GitHub's SHA-bound merge endpoint remains the final authority. Root owns combined
release validation and deployment; this draft is not production acceptance.

### Codex factory base refresh (2026-10-28)

[PR #466](https://github.com/r3dbars/shiptorio/pull/466), based on root's frozen75 release:
a behind factory PR requests a fresh game approval, rebuilds one scoped commit on the
new base, and replaces the SAME branch only with the exact approved old-head lease.
New regression proof and a fresh gauntlet are required; no live factory actions were
performed. Real local Git covers lease races and deterministic acknowledgment recovery;
server fixture covers fresh approval, same-PR completion and Launch, plus base changes
at approval/claim/finish. Full check and hosted status are recorded in the PR. Root
owns batching, merge and Deploy; this chat does not merge. Narrow `publication.ts`
exception extends merged #351's trusted boundary, without changing workspace code.
Root authorized one narrow deck reservation exception: explicit same-PR refresh proposals
and approvals keep a runner slot in a full deck; merge-gate priority stays intact.

## Root combined repair candidate — October 28

Integrates #464 (GitHub merge-readiness guard), #465 (read-only browser observations),
#466 (freshly approved same-PR base refresh), and #468 + #471 (runner re-install with
verified Keychain protection). Conflict resolution retains both complete provider
identity and current-head check metadata in the rework fixtures. A base-moved warning
is emitted once at failed publication rather than on every waiting alarm.

#468's exact-head browser/load run was dispatched once by the check-only helper:
[40696934882](https://github.com/r3dbars/shiptorio/actions/runs/40696934882), head
`c7ccd833c530ab9d394c64b3068469dfee4ae27f`; no skipped job is accepted as proof.
The root candidate needs its own complete checks. No factory PR has been merged;
#170 still requires fresh base-update approval and the player's final Launch.
Logo #467 is separate visual work; landing workshop #469 belongs to Justin's other
thread and is excluded from this batch. Production remains the password-gated rollback
until a verified deployment. This entry incorporates the pending helper receipt #470.

Combined source `0004cf88` passed the actual Mac full check: 1,400 passed, two
existing skips, zero failures; lint/types/web and runner build green. The earlier
`736488b0` candidate was rejected after its native Keychain regression; its manual
CI was cancelled rather than accepted. Corrected #471 uses the native settings
suffix, with disposable-keychain disabled-timeout detection and restoration proof.
The final combined remote browser/load run is still required. No deployment yet.

Browser/Stranger integration preflight found older provider stubs omitted current
check head SHA and PR readiness/base metadata now required by #464/#466. The d946
manual run was cancelled rather than claiming acceptance. Root updates only the
provider fixtures to model real metadata; safety checks and browser assertions stay
unchanged. The fixture PR identity now follows the repo/branch actually submitted.
Local real journey and Stranger reruns precede the next frozen full manual dispatch.

## Nonblocking GPU submission candidate (Codex, 2026-10-28)

[#478](https://github.com/r3dbars/shiptorio/pull/478) starts from diagnostic #475.
Hosted desktop samples already showed tier 2 with low JS submission work, so no
quality/governor change is proposed. A zero-timeout WebGL2 fence poll keeps at most
one normal RAF submission pending; simulation, camera, builds and consent clocks
continue, and HUD work stays outside GPU admission. Ordinary shadow cadence counts
actual submissions; urgent build invalidations stay latched. Unsupported/failed
fences or a five-second unsignaled fence fall back to the previous rendering path;
context loss/restoration and disposal release sync references. Existing perf frame
metrics retain their logical-frame meaning, with separate passive submission/skip/
failure counters. Fake-GL, hold and governor tests pass (17 tests/80 assertions).
The unchanged original desktop dark-to-rocket journey passes locally in 1.5 minutes;
111 passive samples ended at 947 submissions, six pending skips and zero fence
failures. That low local skip rate does not establish a hosted speedup. Full local
check passes: 1,406 tests, two existing skips, zero failures; lint/types/build green.
Hosted comparative evidence remains pending. This is an unproven performance
candidate, not a released fix. Root owns hosted verification, merging and deployment.

### Codex durable pipeline and player decisions (2026-10-28)

PR #517 adds a derived six-step `pipeline` snapshot/patch contract; current durable jobs/cards and exact-plan/head checks remain authoritative. Later replay counts once per check-in; concurrent Approve records one teaching event for one committed runner transition. Focused61 tests/350 assertions and full local check1,623 pass/two existing platform skips/no failures. One web reducer line is required contract glue; no layout/deck UI changes. Client decision delivery is separate #524. Exact-head hosted CI and Staging still required.

## Physical hold rendering lease (Codex, 2026-10-28)

[#479](https://github.com/r3dbars/shiptorio/pull/479) extends #478 after the hosted
Pixel trace showed consent/tunnel-start arriving before native touchEnd while
synchronous shader warm-up blocked the observer. Real BuildHold/HoldLaunch DOM
regressions fail before and pass after: consent still submits at the original
threshold, but its render pause follows the matching physical press through card
unmount. Up/cancel, blur, hidden state or a fresh matching down after a missed up
releases detached ownership. Early abandonment releases immediately; assistive
activation and controller timing are unchanged. Cleanup/setup replay remains safe.
Focused tests pass (28 tests, 101 assertions); full check and original Pixel journeys
are pending. This fixes input ordering, not the residual shader stall after release.
Root owns hosted validation, release integration and deployment.

## Root release repair — native hold lifetime and final batch

- Integrated [#479](https://github.com/r3dbars/shiptorio/pull/479) runtime `34952d8af6aeaeca55c51d19d342183cbda2a772` after independent review: accepted native holds retain only their rendering lease until matching physical release, including card unmount. Lost-touch recovery uses primary pointer type, not reusable IDs. Consent timing/controller and assistive activation remain unchanged. Focused regressions: 29 passed / 105 assertions; final full check and hosted combined acceptance remain required.
- The candidate also integrates selected [landing #472](https://github.com/r3dbars/shiptorio/pull/472), [pairing guidance #473](https://github.com/r3dbars/shiptorio/pull/473), and GPU admission [#478](https://github.com/r3dbars/shiptorio/pull/478). Retained failed hosted evidence; no unchanged-head retries, deadline changes, skipped acceptance or direct factory merge.
- Production remains independently deployed runner release `d024fec7` until final combined CI and Deploy succeed. Factory [#463](https://github.com/r3dbars/shiptorio/pull/463) still requires a fresh personally approved base refresh and in-game Launch. Cold shader work after releasing the finger remains a measured performance limitation; this change does not claim to eliminate compilation.

### Codex per-viewport bot Launch receipts — 2026-10-28

The phone observed a new Launch, but desktop persistence was checked only through
visible launched items. A viewport could also time out without adding a failure.
The tracker now binds evidence to the exact fixture socket/repo, requires a new
first-width item transition, and lets desktop confirm that receipt by exact item
or a safe HUD-counter floor (metrics, otherwise science) from a fresh snapshot.
This is bounded fixture resume confirmation with no intervening research, not a
general cumulative ship ledger. Every newbie viewport
records its receipt and fails if unfinished; initial ships never replace a fresh
phone transition. Backend authorization and gameplay deadlines stay unchanged.

### Codex inert bot staging setup — 2026-10-28

The staging bot previously mounted the old game before resetting its fixture,
allowing an in-flight runner/status request to overlap membership deletion. Setup
now enters the real password UI through inert `/test/users`, then API login and
reset before the first game mount. Strict HTTP/console capture, reset locking,
local/guest behavior and gameplay assertions remain. Setup contract tests cover
ordering and denied gate/login/reset; no live staging reset was performed here.

### Codex safe doctor failure categories — 2026-10-29

Installed runner update preserved existing grants/auth and disabled plugins/apps in
the observed Codex child, but the disposable edit probe failed. Doctor exposed
only an unhelpful stderr notice while discarding the failed JSONL stdout reason.
Doctor now emits fixed, fully redacted failure categories only; it never publishes
provider text, agent messages or transcripts. Filesystem edit proof still fails if
a successful process did not make the required change. Normal job execution,
sandbox authority, approvals and retry behavior are unchanged. Initial failed
probe retained as safe metadata; no successful edit or failure cause claimed yet.

### Codex runner service pairing import — 2026-10-28

Before: a valid standalone Testing pairing was absent from the running launchd
service's separate data root. After: service installation imports same-origin valid
pairings under the existing store lock, preserves originals/replacements/rejections,
and reuses installed config. No new grant, approval, job claim or production deploy.
Focused regressions cover import idempotence, owner-only files and refusal boundaries;
existing sleep/network/revocation tests remain required. Full CI/Staging pending.

## Self-serve release-validation (Claude, 2026-10-28)

Justin (16:16Z): merges must be "as fast as possible" so he can iterate. CI now runs the
full suite (check, selfhost, six browser shards, load) on every ready PR and merge-queue
group, and its `full-suite` job posts the `release-validation` status itself when all pass.
Codex root no longer has to dispatch the heavy run or stamp it by hand; any green PR can
merge on its own instead of waiting for a release batch. Same tests and deadlines. The
load job judges the unchanged 5 s / 3 s budget on the median of up to three runs
(first run alone when it passes) because one run on a shared VM swung 5.2 s → 8.2 s →
pass on near-identical code. `release/*` runs are no longer cancelled by a later push.
`merge_group` triggers are wired for when Justin turns on the merge queue.

## Repository picker failure clarity (Codex, 2026-10-28)

Provider or database permission-check failures now return a safe retryable repository-discovery error instead of a misleading empty list or generic server error. Real session/membership revocation still denies access; no cached authorization is trusted beyond existing policy. Three route regressions cover failure, recovery and revocation, with the existing batched-authorization suite retained. Full check and exact-head dev CI remain required.

## dev / main split (Claude, 2026-10-28)

Justin (16:31Z) picked the flow in `docs/context/branches.md`: every agent PR (Claude and Codex) now targets `dev`,
runs only check/selfhost/Stranger/CodeQL, merges on green and auto-deploys shiptorio.dev. `main` = shiptorio.com and
only moves on a `dev → main` promotion, which runs the full suite and gets the automatic `release-validation` status
(#485). Release batches and release/* branches are retired. Promotions merge with a merge commit, never squash.

- 2026-10-27 — Codex: planner outage recovery builds on #312 with classified cooldowns, a two-minute planning deadline, persisted automatic resumption (including raised caps without refunding unknown spend), one calm resting card, and deterministic bottleneck fallback. Small scope exceptions: factory.ts wires durable jobs/cards/alarms; web/src/source/live.ts formats the resting deadline in the browser's timezone. Moves the Oct 27 live-loop reliability checkpoint forward.

- 2026-10-28 — Codex: #371 rebased onto dev, retaining admin stops, explicit base-refresh provenance, native model JSON formats and websocket sequence guards. Raised call/token/spend caps resume parked plans without refunding ambiguous paid calls; focused stop/quota/recovery tests cover the new dev integration.

Retains production-disabled negative-ID identities and scoped fixture delegation while preserving current administrator controls and request redaction. The bot workflow now pins existing reviewed action SHAs and disables persisted checkout credentials. No fixture resources or configuration were changed. Local proof and exact-head dev CI are required before merge.

### Codex socket handshake latency — PR #498

Hosted isolated-fixture upgrades took 5.46–6.15s, longer than the unchanged client five-second deadline; snapshots followed open within 2ms. Reuse the verified immutable principal only within the same upgrade (four session reads become two), retaining independent repository authorization and later message revalidation. The private fixture tracks post-upgrade lease cleanup with waitUntil while preserving reset leases/TTL. Regression proves distinct requests and revoked sessions are rechecked; hosted improvement awaits deployment measurement.

### Codex private fixture connection profiling

After #498, hosted upgrades still exceeded the unchanged five-second client deadline. The private fixture now returns fixed-name Server-Timing phase durations (no request data/secrets) and revalidates its private session before deciding whether provisioning is needed. A valid existing persona session no longer rewrites users/progress/allowlist on each read; expired/revoked/wrong-persona sessions still take the provisioning path. Reset revokes private D1 sessions before deleting its KV cache, so stale KV values cannot skip reseeding. `node playtest/staging/timing-host.mjs` proves the actual workerd DO 101 retains its socket, timing header and first frame (one guarded local upgrade). Live phase measurements and full player-loop acceptance remain pending deployment.

### Codex private socket application phase profile — PR #507

#500 measured cold10.48s/warm4.73–4.82s upgrades; the internal application phase accounted for9.40s/3.83–3.88s. Add request-local fixed numeric App/Factory phases only through the private fixture's in-process capability (and exact private config plus a verified negative principal for DO output). No deadlines, authorization/revocation/repository/quota checks, caches or production configuration change. Preserve all nested timing headers and upgraded sockets. Root owns the uninterrupted hosted bot; next live measurements wait for that run to finish.

### Codex cold-start socket admission — PR #510

Verified whole-App regressions: Hono response assignment replaced appended App timing with the upstream DO header; use Hono's append API. Trace/rate/guest repeated the same URL-aware currentUser lookup three times; one request-local Hono promise reduces total session reads from five to three, retaining fresh scoped resolveUser, repoAccess and independent DO authorization. No cross-request principal cache. Actual9–10s cold upgrades were canceled at5s; a separate bounded15s handshake accepts these legitimate responses while first snapshot/pong keep5s and reconnect notice keeps3s. Client fake-clock tests pin6/10s success,15s hung retry,5s missing snapshot, rejection, disposal and existing heartbeat behavior. Cold requests are not claimed fast; live timing follows deploy.

### Codex existing-factory connection critical path — PR #515

- Before: every reconnect awaited optional Sentry/PostHog discovery and loaded the factory twice. After: one load, then a durable `mineReconnectPending` marker consumed by the normal alarm after foreground gauntlet work; failures retain the marker for retry after eviction. First factory creation and GitHub reinitialization remain synchronous. No auth, quota, socket deadline, or frontend changes.
- Focused regression: original source fails the provider-free reconnect test; updated source passes 22 tests / 111 assertions, including real mine connection on the next alarm, disconnect preservation, retry and current lifecycle/account/installation guards. The under-three-second live target remains unproven until this PR deploys and is measured.

### Codex fresh sign-in policy roundtrips — PR #528

- Root-approved narrow `accounts.ts/currentUser` change: after the fresh session lookup, read revocation and admission concurrently on every request. Both results remain required, known revocation still denies before any admission error, and revocation lookup failures still propagate. No mutable authority caching, boundary sharing, fixture policy change or frontend edits.
- Deterministic held-read tests pin overlapping requests and waiting for both results; real SQLite tests pin next-request deletion/revocation/admission changes, failure precedence, explicit pending-account behavior and production rejection of negative testers. Live cold/warm timing remains pending deployment; required cold GitHub verification is not bypassed.

### Codex isolated-fixture reset diagnostics

- Reported reset409 naturally advanced from provider-busy to Factory wipe-pending after lease expiry; no cleanup bug was established and no guard was relaxed. Busy resets now report only fixed reason labels, bounded counts and the latest bounded lease retry interval through a validating private wrapper. Unknown/malformed provider failures remain generic; credentials/UUIDs/provider headers are never forwarded.
- Fixed-clock tests cover pending receipt + outer lease expiry, ordinary in-flight work rejection and sanitized errors. No live fixture call/reset was performed from this lane; root owns the continuing hosted test.

### Codex repository-access D1 roundtrips

- Keep fresh session/admission gates before repository I/O. Read mapping + the three required relationships in one transaction, reducing a warm decision from six SQL statements/four D1 roundtrips to the same six statements/three roundtrips. Each App/DO boundary still runs its own checks; KV/GitHub policy, permissions and the non-batch fallback are unchanged.
- Real SQLite regressions pin query counts, same-request installation remapping, warm-grant revocations, strict/error precedence, early session/admission denial and adapter fallback. No frontend/Factory/session/access/cache changes or live fixture calls. Deployed speed remains a separate measurement, not an under-three-second claim.

- 2026-10-29 Codex (`codex/deck-github-codex`): milestone 1 adds a read-only real GitHub issue inbox and boiler/Codex connection cards using existing runner pairing. Uses the current swipe UI; no work starts from browsing or pairing. Adds route authorization, inbox and connection tests plus desktop/phone fixture QA. Real account acceptance requires GitHub sign-in and a local Codex runner.
- 2026-10-29 Codex (`codex/deck-repo-discovery`): live acceptance of #602 revealed that checking 45 repositories concurrently overflows the GitHub client's eight-call queue. Deck discovery now pages four repositories at a time; legacy discovery uses bounded batches. Rate-limit errors remain visible in the connection card. Testing issue #25 is verified in the deployed inbox.
- 2026-10-29 Codex (`codex/staging-runner-command`): fixes the staging setup command to use separate runner data and binary directories; the existing production runner remains pinned to shiptorio.com. The installer handles sign-in itself, so the card no longer tells players to run the production login command.
- 2026-10-29 Claude ("Rebuild the main deck's underside art", `claude/project-thread-j8qkum`): the pixel deck's sides and underside are rebuilt in code to match the launch island (props/underside.ts): riveted rim band with copper pillars, chiselled warm boulders tapering to the middle, cyan shard pairs, and a steel engine with a glowing core window hung at the exact middle. The orb, underside vents/steam, pipe loops and hanging lanterns are gone.

- 2026-10-29 Claude ("Plan what's next and load up Codex", `claude/project-thread-ry4a4x`): plan to Nov 3 in `docs/context/demo-plan.md` (where we are, five moves, demo line). Codex batch #43-#48 handed out: trust level-up on the real loop, stale factory cleanup, demo replay, first two minutes, Shippy's brain picks the bottleneck, green CI. Deck batch #36-#42 retired (Justin's Codex deck work #596-#611 superseded it).
- 2026-10-29 · Codex #46 · `codex/deck-first-run`: new-account deck → GitHub → repo → Codex → first issue browser walk; fixture Worker/runner only, PR #617.

- 2026-10-29, Codex #43: learned Start build permissions apply on runner polls, docs-only plans share a reviewed scope, and reset revokes the permission; real handler/lease and deck-level-up fixtures added. Live four-issue acceptance remains separate.
