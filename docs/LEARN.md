# Teach the factory (learning what you approve)

> Status: live behind the server flag `learn` (default on, global `false` is the kill switch), 2026-10-28.
> Justin's journey pick #11: "the agent will run this whole game ... keeping track of the things that you
> automatically approve or things that you change or hit later on or steer ... I like the idea of hey, two more
> approved as is, then the factory will automate this for you ... gamify like little dots, two out of three filled."

## The rule (v0, kept very simple)

- **A kind of card** is card `kind` + `moveScope` (usually the folder) + the suggested option's tool, e.g.
  `build|district:web|approve_runner_job`. Starting plans and approving plans are learned apart.
- **Continue** (the suggested option, as is) fills one dot. 3 in a row and the factory does that kind on its own.
- **Later**, **Edit** (another option) or **Never** empties the dots.
- **Never → Just this one** also leaves the planner a note: try a smaller or different version, or suggest something
  else. ("Wrong call" already did.) The notes reach the planner through `playerFeedback`.
- **Comes back**: if an item the factory moved on its own later needs rework or comes back after launch, that kind
  forgets and asks again.
- **Ask me again**: Make it yours lists every learned kind with a button that forgets it.

## What can be learned

Only `plan_runner_job` (start a plan) and `approve_runner_job` (approve a plan). Never a launch or merge (the held
red button stays with the player), a customer reply, research, rework plans, locked cards, or autonomy cards.

## The meter

`Move.learn = { have, need }` on learnable cards, from the first yes on (a brand-new player's first card stays plain). The card shows ●●○ and one line: "Approve 1 more like this and then
it's automatic." (Justin's round 3 pick) An old streak from before learning never skips the last dot.

## Code

- `server/src/learn.ts`: pure rules (what's learnable, the meter, learn/forget).
- `server/src/factory.ts`: counts yeses on `choose_move`, resets on Edit/Later/Never, `runLearned()` in the tick
  answers one learned card per tick through the same runner handlers a tap uses (logged `approvedBy: "autonomy"`,
  card_taps action `auto`), `unlearn` message, `unlearnOnComeback`.
- `web/src/ui/LearnDots.tsx`: the dots. Shown on the attention tray, the check-in deck, and the simple tray (#477).
- Sim: build cards learn the same way, so `?source=sim` shows it.
- Tests: `server/test/learn.test.ts`, `server/test/deck-factory.test.ts` ("the factory learns what the player approves").
