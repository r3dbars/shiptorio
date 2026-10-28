# deck2d/data: the real factory as a DeckView

Owned by the thread "Hook the 2D deck to real repo data". The types are the hub's (`../contract.ts`); this folder
only produces them.

- `view.ts`: `deckView(state, opts)`, pure. FactoryState (live or sim) in, `LiveDeckView` out (a `DeckView` whose card
  also says `hold` for a merge, `setup` for plugging in an agent).
- `source.ts`: `createLiveSource(readConfig(), { onPower })` is a `DeckSource`: `view()`, `approve(id)`, `later(id)`,
  `subscribe(fn)`, `close()`. Approve sends `choose_move` with the suggested option, Later sends `defer_move`, the same
  messages the task tray sends, so the server learns from them (docs/LEARN.md).

## How the factory maps onto the line

| Stop | Crates are items that are... | Turns `auto` when |
| --- | --- | --- |
| repo | `ore` | never (it's the source) |
| planner | `queued` | a learned `plan_runner_job`, or autonomy `build`+ |
| builder | `working`, `rejected` (rework rides back) | a learned `approve_runner_job` / sim `start_job`, or autonomy `build`+ |
| checks | `inspecting`, CI / verify / researched checks pending | never (it never asks you) |
| review | `inspecting`, AI review pending | never |
| gate | `inspecting` with the human gate pending, `passed`, `on_pad` | any launch permit, or `lights_out` |
| launch | `launched` while orbit watch is on | same as gate |

- **The jam** is where the card waiting on you points (its suggested tool, then kind, item, focus, stage). With no
  card it's the bottleneck engine's stop, unless you already handed that stop to Shippy. One jam at most; its crates
  get the red `wait` look and the plate says `REVIEW WAITING`.
- **The card** is setup first, then stuck, then parked, then ideas (same order as the task tray). `line` is the
  learning line ("Approve 2 more like this and then it's automatic.") or "Approve it and it moves." before the first yes.
- **Shippy**: `lever` for 1.2 s after an Approve, `happy` for 4 s after a stop goes automatic or a rocket leaves,
  `alarmed` at the jam while a card waits, `walking` to the planner's target or the busiest stop, else `folded` in the
  corner.

The sim scenario `?source=sim&scenario=deck2d` asks before every build, so the whole story plays: three yeses and the
builder goes green. Tests: `web/test/deck2d-view.test.ts`.
