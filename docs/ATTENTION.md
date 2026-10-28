# Attention: when Shiptorio is allowed to bug you

> Status: **on by default** since 2026-10-27 (Justin: "No flag just put it in main"). `?attention=0` brings back the old
> Next Move card for one release; the global `attention` flag at /admin/flags stays as a kill switch. Thread "Design a calm attention system for players".
> Mockup: https://claude.ai/artifact/Qb9bkmAVvmPYtZdWt2LrQb (Black Iron, real map art).
> Card layout from the gameplay picks (docs/GAMEPLAY.md): Later left, Continue as a tab on the right edge, more cards peek
> out behind, and a Launch card is a big red button held for 800 ms (`web/src/ui/holdLaunch.ts`: primary press only;
> blur, hidden tab, lost capture or a card change cancels; screen readers activate twice within 5 s).
> Finishing the hold only *sends* the launch (a click and a short buzz). The rocket sound and the "Rocket launching"
> caption come from the server's launched state, so a launch the server refuses (head moved, CI went red) never
> sounds or reads as launched.

## The problem

Justin, 2026-10-27: "the worst case scenario is for everything to be pinging and ponging at somebody." Today the
game has about 40 things that can grab your eye or ear (audit below). Most are fine on their own. Together they
compete, and the player can't tell "the factory is stuck on me" from "a badge unlocked."

The vision says the human is the bottleneck (VISION.md principle 6). A noisy game makes that worse: every
interruption costs the same attention a real decision does. So the rule has to be strict.

## The model: one tray, three kinds

Only one place in the game can interrupt you: the **Needs you** tray. Only three kinds of things go in it, and
each has one color, one glyph and one word. Everything else is ambient: it happens on the map, the ticker and the
soundscape, and you see it if you look.

| Kind | Color | Means | Example | Can ping your phone? |
| --- | --- | --- | --- | --- |
| **APPROVE** | amber `--iron-amber`, caution stripe | Work is parked until you say yes. The answer is pre-picked (Suggested) and the proof is attached. | "Launch #142", "Approve this plan", "Send this reply" | Yes, after it waits 30 min |
| **STEER** | red `--iron-bad` | The line is stuck. The factory has a best guess, but it isn't sure enough to act alone. | "#88 failed twice at Verify", "Your runner is offline and 3 builds are waiting" | Yes, after 10 min |
| **SUGGESTED** | aether `--iron-aether` | A good idea. Nothing is waiting on it. | "Research Type check", "Connect Sentry", "Let /web ship on its own?" | **Never** |

The test for each new card: **is anything parked?** Parked and the answer is obvious → Approve. Parked and it
isn't → Steer. Nothing parked → Suggested. Nothing for the player to decide → ambient (or ops, not the player).

Player copy never says "Spark" (principle 8). The kind word is the label: APPROVE, STEER, SUGGESTED.

## One card, two buttons (Justin, 2026-10-27 01:29)

"Down to a simple swipe or a continue button, later button." Every card in the game, all three kinds, has the
same shape and the same two actions:

```
┌─ APPROVE ─────────────────────────────── /web ─┐
│ Launch #142: dark mode toggle                  │  title: what happens on Continue
│ CI ✓  Verify ✓  Review ✓                       │  proof, or one line of why
│ Suggested because you shipped 4 like it clean  │  the "because" line: which of your taps led here
│ [ CONTINUE ]                        [ Later ]  │
└────────────────────────────────────────────────┘
```

- **Continue** (or swipe right) does the suggested option. There is always exactly one suggested option, so
  Continue is never a guess about what it will do: the title says it.
- **Later** (or swipe left) parks the card for 24 hours. That's it.
- **Tap the card** for the details: the plan, the files, the proof, and any other options. Other options never
  sit on the card face. A Steer card's "pick a different fix" lives here.
- **After Later, one optional row of chips** slides in for 3 seconds: *Not now* · *Stop showing these* ·
  *You decide these* · *Wrong call*. Ignore it and it's a plain Later. These are today's `defer_move` /
  `dismiss_move` reasons (`once`, `kind`, `spark`, `wrong`), so the server already handles them.
- The old 3-button cards, the down swipe and the up swipe go away. Down = never becomes the *Stop showing
  these* chip; up = details becomes a tap.

## Every tap steers what comes next

The point of the two buttons isn't speed. Each tap is a vote that the planner reads before it suggests
anything else, and the card says so out loud, so the player sees the loop working.

| You do | The planner learns | What you see next |
| --- | --- | --- |
| Continue | This kind of card, in this lane, was right | Similar cards rank higher. After 5 Continues in a row on one kind in one lane: a Suggested card "You've said yes to 5 plans in /web. Let these run on their own?" (feeds the autonomy ladder) |
| Later | Not now, no judgment | Back in 24 h, ranked a bit lower. Three Laters on one kind in a lane and it drops to the check-in only |
| *Stop showing these* | Mute this kind here | A muted rule (existing `move_kind_rules`), with undo for 5 min |
| *You decide these* | The player trusts the factory on this kind | Recorded as an approval (existing `recordApproval`); counts toward the next autonomy level |
| *Wrong call* | The suggestion itself was wrong | A correction note in `playerFeedback`; the next plan for it says "Respects your past calls" |

Make the loop visible in three places:

1. **The "because" line** on every card (`Move.because`, already from the game master) cites your own taps when
   it can: "Suggested because you continued the last 3 lint fixes", "Ranked low: you said Later twice".
2. **A one-line echo** after each tap, in the ticker: "Got it. Fewer cards like this in /docs."
3. **The digest** counts it: "Your 9 taps this week turned into 2 new autonomy offers and 1 muted card type."

So the player's choices steer the recommendations, and the recommendations steer the player toward more
automation. Continue enough times on the same thing and the game offers to stop asking.

### Three more rules that keep it honest

1. **Feedback for something you just did is never an interrupt.** The XP pop after your tap, the stamp sound,
   the rocket you launched: that's the game answering you. Keep it, and keep it fast.
2. **Things that happened on their own are ambient.** A PR passed CI, a mine dug ore, autonomy approved a plan:
   map + ticker + sound. They go in the digest, never a toast.
3. **If the player can't act on it, it's not theirs.** A failed webhook delivery or a Worker error goes to
   ops (Sentry, /admin), not the deck.

## Interrupt ladder

Every surface sits on one rung. Climbing a rung needs a reason.

| Rung | What it does | Who can use it |
| --- | --- | --- |
| 0 Ambient | Map motion, machine tags, ticker line, station sounds | Everything |
| 1 Count | The number on the tray chip. No motion, no sound. | Approve, Steer, Suggested (Suggested in teal, separate) |
| 2 Tray row | One row in the Needs you tray, top center (above the dock on a phone). One soft chime when it appears. | Approve, Steer |
| 3 Push | OS / phone notification while the tab is hidden | Approve, Steer, after the wait, outside quiet hours |

The tray shows **one row at a time**: the top-ranked Approve or Steer, plus "+N more · Check in". Steer outranks
Approve (a stuck line costs more than a parked one).

## Batching rules

- **One card per item.** A new card about the same PR replaces the old one (fold by `itemId`).
- **Stack by kind and lane.** Three launches in `/web` with full proof are one row: "3 launches ready in /web ·
  Approve all". Locked launches (missing proof) never batch.
- **Steer needs to hold.** A Steer card is raised only after its condition is true for 2 minutes, so a CI flake
  or a runner blip that fixes itself never pings anyone.
- **The first rework is not a Steer.** The gauntlet already sends a failure back with its scar. It only becomes a
  Steer card after the **second** failure on the same PR, or when it can't rework at all.
- **Suggested waits for the check-in.** Suggestions only show up in the check-in deck (max 3 per check-in, ranked
  under every Approve and Steer), and as the quiet teal "next move" row when the tray is empty.
- **Swipe left = later** means 24 hours, not the next tick. Down = never (existing rule, becomes a deck rule).
- **One chime per 2 minutes** for new tray rows, no matter how many land.
- **Pushes bundle.** At most one push per hour: "2 to approve, 1 to steer". The push names the top card.

## Quiet hours and the digest

- **Quiet hours**, default 10 pm to 8 am local, set in Make it yours. No pushes and no chimes. Cards still collect.
- **Three push modes**, in Make it yours: *Live* (Approve and Steer push after their wait, default once you turn
  pushes on), *Digest* (one push a day, at a time you pick), *Off*.
- **The digest replaces the morning brief and the toast pile.** First open of the day (or after 4+ hours away):
  one plate. "While you were away: 4 shipped, 2 caught by the gauntlet, 6 handled on their own. Waiting: 2
  approve, 1 steer, 3 suggested. Check in (about 2 min)." Achievements earned while you were away are listed here
  as one line, not toasted one by one.

## Earned autonomy shrinks the tray

This is the reward loop, and it ties straight to VISION.md's core goal. Each autonomy level takes a whole class
of Approve cards off your plate, and the game says so out loud:

| Level | Cards it answers for you |
| --- | --- |
| Advisor | none |
| Floor | "Plan #N" (start a plan) |
| Build | "Approve this plan", "Send back with the scar" |
| Lights out | Earned launch permits |

- The level-up card (a Suggested card) shows the number: "About 9 fewer cards a day."
- The digest shows the trend: "Pings this week: 14 → 6."
- Approve rows for a lane that's one clean ship from a permit say so: "1 more clean ship and /web stops asking."

Merges (`request_merge`) and customer replies stay Approve at every level, on purpose.

## How the player learns the three kinds

Progressive disclosure (principle 9): taught by doing, the first time each one really happens.

1. **First Approve card**: the coach points at the amber row. "Amber means it's parked until you say yes. The
   Suggested answer is already picked."
2. **First Steer card**: "Red means the line is stuck and needs your call. These are rare."
3. **First Suggested card**: "Teal is an idea. It never pings you. It waits for your check-in."
4. Turning on pushes (Progress sheet, later Make it yours) shows the three kinds as a key, with the wait times and
   quiet hours in plain words. Suggested has no push toggle, because it can't push.

The Field Guide gets an "Attention" page with the same three rows.

## Audit: every surface today, and what happens to it

Classified from `web/src/ui`, `web/src/App.tsx`, `web/src/sound` and the server card builders on 2026-10-27.

### Cards (server `Move`s, shown in tray, NextMove bar and check-in deck)

| Card | Source | Becomes |
| --- | --- | --- |
| Plan #N (start a plan) | `factory.ts` runner move | **Approve** (Floor answers it) |
| Build #N, approve the plan and files | `factory.ts runnerApprovalMove` | **Approve** (Build answers it) |
| Launch #N (merge, full proof) | `gauntlet.ts` launch card | **Approve**, batches by lane |
| Launch #N, locked (missing proof) | `deck.ts` run-missing-check | **Approve** the missing check, never batched |
| Review the customer reply | `support.ts` reply card | **Approve** (never auto, any level) |
| X sent #N back (rework) | `gauntlet.ts reworkMove` | Ambient on first fail (auto-rework at Build); **Steer** on 2nd fail or no rework path |
| Stuck: work exceeded its waiting limit | `reliability.ts` | **Steer**, after the 2 min hold |
| Plug in Claude or ChatGPT | `factory.ts` resources card | **Steer** when work is waiting; else Suggested |
| Bottleneck: review the jam | `deck.ts impliedBottleneckMove` | **Steer** only if the jam is on the player (merge gate, no builder); else ambient on the map |
| A source delivery needs attention | `factory.ts` failed webhook | **Cut** from the deck, goes to ops |
| Factory work needs attention | `factory.ts` reliability op | **Cut** to ops, unless the player can fix it (then Steer) |
| Research X? | `gauntlet.ts researchMove` | **Suggested** |
| File a customer's bug as an issue? | `support.ts` | **Suggested** |
| Let /lane ship on its own? (permit) | `permits.ts` | **Suggested** (reward styling) |
| Unlock Floor / Build / Lights out | `levels.ts` | **Suggested** (reward styling) |
| Growth experiment | `growth.ts` | Ambient (rides the line as ore) |

### Toasts, popups and sheets that open themselves

| Surface | File | Becomes |
| --- | --- | --- |
| Achievement toast + chime | `ui/Achievements.tsx` | Keep only if your own tap caused it in the last 10 s; else a dot on the medal button and one digest line |
| XP pop | `ui/Progress.tsx XpPop` | Keep (feedback for your tap) |
| Level-up chime | `ui/Progress.tsx` | Keep only with your tap; else digest |
| Ship celebration (card + screen shake) | `ui/ShipCelebration.tsx` | Keep for a ship you launched; ships that autonomy launched get the rocket on the map, and a burst becomes one line in the digest |
| Morning brief | `ui/Progress.tsx MorningBrief` | **Becomes the digest** |
| Coach cards | `ui/tutorial.tsx` | Keep (onboarding owns the screen); they also teach the three kinds |
| "What's next" nudge row | `ui/whatsNext.ts`, `NextMove` | Suggested row, only when the tray is empty |
| Spark spend chip | `ui/SparkSpend.tsx` | Ambient; **Steer** when the daily budget is hit and work is paused |
| Runner plug | `ui/RunnerConnection.tsx` | Ambient; **Steer** when it's offline 2+ min with work waiting |

### Counts and badges (too many places show the same number today)

| Surface | Becomes |
| --- | --- |
| Floor card "Needs you" count | Removed; the tray chip owns the count |
| Line dock badge | Removed |
| Bell button (activity tray) | Stays, no badge. It's the history: what happened, why, undo |
| NextMove bottom bar | Merges into the Needs you tray (one row, top center; above the dock on phone) |
| Check-in button count | Stays; it's the same tray count |

### Sounds

| Sound | Becomes |
| --- | --- |
| Station verdicts, belts, ore, machine start, dock, launch, stamps | Ambient, keep (they're the factory breathing). Muted while the tab is hidden |
| `chirp` / `think` (planner drone) | Ambient, keep quiet; max once per 10 s |
| `suggest` (research tip) | **Cut**. Suggestions never make sound |
| `permit_grant`, `level_up` | Keep when you tapped it; at Lights out the auto-take plays once, softly |
| `permit_revoke`, `orbit_alarm` | Ambient sound + a **Steer** card only if the player has a call to make |
| `achievement` | Follows the toast rule above |
| New tray row | **One** new soft "needs you" chime, max once per 2 min, off in quiet hours |

### Notifications

| Surface | Becomes |
| --- | --- |
| Browser notification when the deck grows (15 min gap, any card) | Approve/Steer only, after the wait, bundled, max 1/hour, quiet hours respected |
| Map "Needs a look" amber tag | Keep, only on the top tray card's machine (already true) |
| Quiet machine tags | Ambient, keep |
| Planner comments on GitHub issues/PRs | Out of scope here (they live on GitHub, the player chose to watch the repo) |

## What v1 builds (behind `attention`)

- `shared/src/attention.ts`: `attentionOf(move, item)` sorts any card (server and sim names), `continueOption`,
  wait times and rank. `Move.attention` is set by `enrichMove`.
- `web/src/ui/Attention.tsx`: the tray. One card at a time (steer, then approve, then the top idea), Continue /
  Later / Details, swipe right or left, the 4-second "why later?" chips, and "+ N approve · N suggested · Check in".
- Check-in deck: Continue / Later only; the never reasons move into Details as "Or tell the planner".
- One queue (Justin, 01:54): the tray card is the deck's top card; tapping it opens the deck. The Activity tray is
  history only (no asks), and there's no separate "Check in · N cards" row.
- Pings: only approve/steer, after 30 / 10 min (counted from first sight), max one an hour, never 10 pm to 8 am.
- No sound for suggestions; badges toast only within 10 s of your own tap (the rest wait in the medal sheet);
  "Needs you" on the floor card counts approve + steer only.
- Server: `DeckBook.yes` counts Continues in a row per `kind|scope`; a Later or never resets it. With the flag
  on, each one adds 4 to `deckScore` (max 20), the card says "You said yes to the last N like this.", and the
  planner sees `playerYesStreaks` in `playerFeedback`.

Since 2026-10-28 (docs/LEARN.md): 3 Continues in a row on a plan or plan-approval card class teaches the factory to
do that class on its own (flag `learn`), with a dots meter on the card. Not yet: the digest, push modes and quiet-hours settings, the coach lessons for the three kinds.

## Contract sketch (for the build, later)

- `Move.attention?: "approve" | "steer" | "suggest"` set by `enrichMove` in `server/src/deck.ts`, from the table
  above (tool + kind + id prefix). The client infers it the same way when it's missing, so sim and old states work.
- `Move.waitingSince` for the push thresholds, and `Move.batchKey` (`kind:lane`) for stacking.
- Deck ranking: Steer > Approve > Suggested, then today's `deckScore`.
- Continue sends `choose_move` with the recommended option; Later sends `defer_move`; the chips send `dismiss_move`.
  New on the server: a Continue streak per `kind` + `moveScope` in the deck book, a small rank nudge from Continues
  and Laters in `deckScore`, and the "let these run on their own?" card when a streak hits 5.
- `Move.because` cites the player's own taps when they drove the ranking (game master prompt gets the streak counts).
- Client: one `useAttention(deck)` hook owns the tray row, the chime throttle and the push rules
  (replaces `useBottleneckNudge`). Quiet hours and push mode live in prefs (`savePref`).
- Flag: `attention`, default on since 2026-10-27; global false is the kill switch.

## Defaults (Justin can flip any of these)

1. Launches are Approve and can push after 30 min.
2. Default push mode once pushes are on: Live.
3. Steer is red. Idle blue `--iron-idle` is the fallback if red reads too much like "failed".
