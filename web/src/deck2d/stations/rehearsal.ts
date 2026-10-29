import { STOPS, STOP_LABEL, type DeckSource, type DeckView, type StopState } from "../contract";
import type { StationId } from "./index";

export const MACHINE_ORDER: readonly StationId[] = ["repo", "planner", "builder", "checks", "review", "gate"];
export const MACHINE_WORK: Record<StationId, string> = {
  repo: "Receiving feedback and turning it into a job. Watch the readout sequence.",
  planner: "Breaking the job into a plan. Watch the three plan tiles light in order.",
  builder: "Building the change. Watch the drive gear turn and the stack vent.",
  checks: "Running checks. Watch the test indicators advance.",
  review: "Reviewing the change. Watch the scan travel over the crate.",
  gate: "Preparing the release. Watch the vertical status bar advance.",
};
const BEATS: readonly { state: StopState; seconds: number }[] = [
  { state: "idle", seconds: 3 }, { state: "working", seconds: 6 },
  { state: "jammed", seconds: 4 }, { state: "working", seconds: 3 },
];

/** Visual-only state inspection, with no factory connection or approvals. */
export function createMachineRehearsal() {
  let machine: StationId = "repo", state: StopState = "idle", age = 0, beat = 0;
  const source: DeckSource & {
    readonly machine: StationId; readonly mode: StopState;
    cycling: boolean; frozen: boolean;
    select(id: StationId): void; setMode(mode: "idle" | "working" | "jammed"): void;
  } = {
    get machine() { return machine; }, get mode() { return state; },
    cycling: false, frozen: false,
    select(id) { machine = id; state = "idle"; beat = 0; age = 0; },
    setMode(mode) { state = mode; source.cycling = false; age = 0; },
    step(dt) {
      if (!source.cycling || source.frozen) return;
      age += dt;
      while (age >= BEATS[beat].seconds) {
        age -= BEATS[beat].seconds;
        beat++;
        if (beat === BEATS.length) {
          beat = 0; machine = MACHINE_ORDER[(MACHINE_ORDER.indexOf(machine) + 1) % MACHINE_ORDER.length];
        }
        state = BEATS[beat].state;
      }
    },
    view(): DeckView {
      return {
        stops: STOPS.map(id => ({ id, built: true, automated: false,
          state: id === machine ? state : "idle", items: [],
        })),
        jam: state === "jammed" ? machine : null,
        shippy: { at: "corner", pose: "folded" }, card: null, shipped: 0,
        caption: `${STOP_LABEL[machine]} · ${state === "working" ? MACHINE_WORK[machine] : state === "jammed" ? "Blocked. Work stops; red identifies the machine and its belt section." : "Idle. The mechanism rests, ready for the next job."}`,
      };
    },
    approve() {}, later() {},
  };
  return source;
}

export function mountMachineControls(source: ReturnType<typeof createMachineRehearsal>) {
  const controls = document.createElement("section");
  controls.className = "machine-tools"; controls.setAttribute("aria-label", "Machine animation preview");
  const label = document.createElement("label"); label.textContent = "Machine ";
  const select = document.createElement("select");
  for (const [i, id] of MACHINE_ORDER.entries()) {
    const option = document.createElement("option"); option.value = id; option.textContent = `${i + 1}. ${STOP_LABEL[id]}`; select.append(option);
  }
  select.onchange = () => source.select(select.value as StationId);
  label.append(select); controls.append(label);
  const modes: HTMLButtonElement[] = [];
  const button = (text: string, run: () => void) => {
    const b = document.createElement("button"); b.type = "button"; b.textContent = text; b.onclick = run; controls.append(b); return b;
  };
  for (const [text, mode] of [["Idle", "idle"], ["Working", "working"], ["Blocked", "jammed"]] as const) {
    const b = button(text, () => source.setMode(mode)); b.dataset.mode = mode; modes.push(b);
  }
  const cycle = button("Cycle all six", () => { source.cycling = !source.cycling; source.frozen = false; source.select(source.machine); });
  const freeze = button("Freeze", () => { source.frozen = !source.frozen; });
  document.body.append(controls);
  return () => {
    select.value = source.machine;
    for (const b of modes) b.setAttribute("aria-pressed", String(b.dataset.mode === source.mode));
    cycle.textContent = source.cycling ? "Stop cycle" : "Cycle all six";
    cycle.setAttribute("aria-pressed", String(source.cycling));
    freeze.textContent = source.frozen ? "Resume" : "Freeze";
    freeze.setAttribute("aria-pressed", String(source.frozen));
  };
}
