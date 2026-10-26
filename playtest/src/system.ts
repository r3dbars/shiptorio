import { FactoryState, ServerToWeb, type Move, type ServerToWeb as Message, type WebToServer } from "../../shared/src";
import { connectSim, SCENARIOS, type ScenarioName } from "../../web/src/sim/engine";
import { applyPatch } from "../../web/src/store";

export interface Finding { id: string; severity: "P1" | "P2"; title: string; scenario: string; step: number; repro: string; expected: string; actual: string; owner: string }
export interface CaseResult { scenario: string; mode: "journey" | "early-close"; seed: number; steps: number; messages: number; decisions: number; shipped: number; states: string[]; tools: string[]; findings: Finding[]; trace: string[] }

// Advance the real simulator's timers deterministically, without waiting minutes or calling a service.
class Clock {
  now = 0;
  private next = 0;
  private microtasks: VoidFunction[] = [];
  private timers = new Map<number, { at: number; every?: number; run: () => void }>();
  private originals = { timeout: globalThis.setTimeout, interval: globalThis.setInterval, clearTimeout: globalThis.clearTimeout, clearInterval: globalThis.clearInterval, now: Date.now, microtask: globalThis.queueMicrotask, location: Object.getOwnPropertyDescriptor(globalThis, "location") };
  install() {
    const add = (fn: (...args: unknown[]) => void, ms: number, every?: number, args: unknown[] = []) => { const id = ++this.next; this.timers.set(id, { at: this.now + Math.max(0, ms), every, run: () => fn(...args) }); return id; };
    globalThis.setTimeout = ((fn: (...args: unknown[]) => void, ms = 0, ...args: unknown[]) => add(fn, ms, undefined, args)) as unknown as typeof setTimeout;
    globalThis.setInterval = ((fn: (...args: unknown[]) => void, ms = 0, ...args: unknown[]) => add(fn, Math.max(1, ms), Math.max(1, ms), args)) as unknown as typeof setInterval;
    globalThis.clearTimeout = globalThis.clearInterval = ((id: unknown) => this.timers.delete(Number(id))) as unknown as typeof clearTimeout;
    globalThis.queueMicrotask = fn => { this.microtasks.push(fn); };
    Date.now = () => 1793030400000 + this.now;
    Object.defineProperty(globalThis, "location", { configurable: true, value: { search: "" } });
  }
  flush() {
    for (let i = 0; this.microtasks.length; i++) {
      if (i > 100000) throw new Error("Runaway simulator microtasks");
      this.microtasks.shift()!();
    }
  }
  advance(ms: number) {
    this.flush();
    const end = this.now + ms;
    for (let count = 0; count < 100000; count++) {
      const next = [...this.timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!next) { this.now = end; return; }
      const [id, timer] = next;
      this.now = timer.at;
      this.timers.delete(id);
      if (timer.every) this.timers.set(id, { ...timer, at: timer.at + timer.every });
      timer.run(); this.flush();
    }
    throw new Error("Runaway simulator timers");
  }
  restore() {
    globalThis.setTimeout = this.originals.timeout;
    globalThis.setInterval = this.originals.interval;
    globalThis.clearTimeout = this.originals.clearTimeout;
    globalThis.clearInterval = this.originals.clearInterval;
    Date.now = this.originals.now;
    globalThis.queueMicrotask = this.originals.microtask;
    if (this.originals.location) Object.defineProperty(globalThis, "location", this.originals.location);
    else Reflect.deleteProperty(globalThis, "location");
  }
}

export function runCase(scenario: ScenarioName, seed = 71, mode: CaseResult["mode"] = "journey", steps = 180): CaseResult {
  const clock = new Clock();
  const result: CaseResult = { scenario, mode, seed, steps, messages: 0, decisions: 0, shipped: 0, states: [], tools: [], findings: [], trace: [] };
  let state: FactoryState | null = null, closed = false, lateEvents = 0, step = 0;
  const states = new Set<string>(), tools = new Set<string>();
  const seenMoves = new Map<string, number>();
  let rng = seed >>> 0;
  const random = () => { rng = (1664525 * rng + 1013904223) >>> 0; return rng / 4294967296; };
  const finding = (code: string, severity: Finding["severity"], title: string, expected: string, actual: string) => {
    const id = `${scenario}:${mode}:${code}`;
    if (!result.findings.some(f => f.id === id)) result.findings.push({ id, severity, title, scenario, step, repro: `bun run playtest --scenario ${scenario} --seed ${seed}; mode ${mode}, step ${step}. Browser replay: ?source=sim&scenario=${scenario}`, expected, actual, owner: "web/sim" });
  };
  const fold = (m: Message) => {
    if (m.type === "snapshot") state = m.state;
    else if (m.type === "patch" && state) state = applyPatch(state, m.patch);
    else if (m.type === "move" && state) state = { ...state, move: m.move };
    else if (m.type === "move_resolved" && state) state = { ...state, move: state.move?.id === m.moveId ? null : state.move, deck: state.deck?.filter(move => move.id !== m.moveId) };
    else if (m.type === "deck" && state) state = { ...state, deck: m.deck };
    else if (m.type === "log") { if (m.tool) tools.add(m.tool); result.trace = [...result.trace.slice(-19), `${step}: ${m.text.slice(0, 180)}`]; }
  };
  clock.install();
  let source: ReturnType<typeof connectSim> | undefined;
  try {
    source = connectSim(scenario, raw => {
      result.messages++;
      if (closed) lateEvents++;
      const parsed = ServerToWeb.safeParse(structuredClone(raw));
      if (!parsed.success) { finding("protocol", "P1", "Simulator emitted an invalid browser message", "Every message validates against the shared contract", parsed.error.message.slice(0, 500)); return; }
      fold(parsed.data);
    }, () => {});
    if (mode === "early-close") {
      source.close(); closed = true; clock.advance(15000);
    } else {
      clock.flush();
      for (step = 0; step < steps; step++) {
        clock.advance(900);
        const current = state as FactoryState | null;
        if (!current) continue;
        const valid = FactoryState.safeParse(current);
        if (!valid.success) finding("state-schema", "P1", "Client state stopped matching the contract", "A valid FactoryState after each event", valid.error.message.slice(0, 500));
        for (const list of [current.items, current.machines, current.belts]) if (new Set(list.map(x => x.id)).size !== list.length) finding("duplicate-entity", "P1", "Duplicate entities appeared", "Unique entity IDs", "A patch produced duplicate IDs");
        for (const item of current.items) {
          states.add(item.state);
          if (item.state === "launched" && !item.prNumber) finding("rocket-without-pr", "P1", "Rocket launched without a PR", "A launched item identifies a PR", item.id);
          if (item.state === "working" && !current.machines.some(m => m.id === item.machineId)) finding("orphan-work", "P1", "Work lost its builder", "A working item points to a machine", item.id);
        }
        const move = current.move ?? current.deck?.[0];
        if (move) {
          const firstSeen = seenMoves.get(move.id) ?? step;
          seenMoves.set(move.id, firstSeen);
          if (step - firstSeen > 12) finding("dead-card", "P2", "Recommended action leaves the same card stuck", "The decision resolves or shows a useful result", `${move.title}; ${move.options.map(o => o.label).join(" / ")}`);
          const option = move.options.find(o => o.recommended) ?? move.options[0];
          if (option) {
            const choice: WebToServer = { type: "choose_move", moveId: move.id, optionId: option.id };
            source.send(choice); clock.flush(); result.decisions++;
            const after = state as FactoryState | null;
            const receipt = JSON.stringify({ science: after?.science, items: after?.items, move: after?.move?.id });
            source.send(choice); clock.flush(); // A real double tap must not act twice.
            const duplicate = state as FactoryState | null;
            if (receipt !== JSON.stringify({ science: duplicate?.science, items: duplicate?.items, move: duplicate?.move?.id })) finding("double-approval", "P1", "A double tap changed the game twice", "Duplicate choice is idempotent", move.title);
          }
        }
        if (random() < 0.08) source.send({ type: "choose_move", moveId: "stale-playtest-id", optionId: "launch" });
      }
      const end = state as FactoryState | null;
      result.shipped = end?.items.filter(i => i.state === "launched").length ?? 0;
      if (!result.shipped) finding("no-complete-loop", "P2", "Recommended choices never completed a shipment", "At least one rocket after following suggested choices", `${steps} steps, ${result.decisions} decisions, states: ${[...states].join(", ")}`);
      source.close(); closed = true; clock.advance(15000);
    }
    if (lateEvents) finding("events-after-close", "P2", "The disconnected factory keeps sending events", "No messages after the source is closed", `${lateEvents} messages arrived after disconnect`);
  } catch (error) { finding("crash", "P1", "The gameplay journey crashed", "No uncaught errors", String(error)); }
  finally { source?.close(); clock.restore(); }
  result.states = [...states].sort(); result.tools = [...tools].sort();
  return result;
}

export function runSuite(seed = 71, scenarios = Object.keys(SCENARIOS) as ScenarioName[]): CaseResult[] {
  return scenarios.flatMap(s => [runCase(s, seed), runCase(s, seed, "early-close")]);
}

export function markdown(results: CaseResult[]): string {
  const findings = results.flatMap(r => r.findings);
  return ["# Shiptorio playtest", "", "Simulation journeys and protocol/state checks. This does not claim live integrations or visual QA passed.", "", "| Scenario | Mode | Decisions | Shipped | Findings |", "| --- | --- | ---: | ---: | ---: |", ...results.map(r => `| ${r.scenario} | ${r.mode} | ${r.decisions} | ${r.shipped} | ${r.findings.length} |`), "", "## Findings", "", ...(findings.length ? findings.flatMap(f => [`### ${f.severity}: ${f.title}`, "", `ID: ${f.id}`, `Reproduce: ${f.repro}`, `Expected: ${f.expected}`, `Observed: ${f.actual}`, `Owner: ${f.owner}`, ""]) : ["No findings in these scenarios."]), "", "## Coverage", "", `States: ${[...new Set(results.flatMap(r => r.states))].sort().join(", ")}`, `Tools: ${[...new Set(results.flatMap(r => r.tools))].sort().join(", ")}`, "", "Run the browser driver separately for visible controls, clipping, overlays, console errors and screenshots. Real GitHub/agent/gauntlet runs require an explicitly approved issue and are recorded separately."].join("\n") + "\n";
}
