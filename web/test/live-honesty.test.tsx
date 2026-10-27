import { expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { FactoryState } from "@shiptorio/shared";
import { MakeItYours } from "../src/ui/MakeItYours";
import { StationPanel } from "../src/ui/StationPanel";
import { REWORK_COPY, YOURS } from "../src/copy";

const noop = () => {};
const state = {
  tick: 1, items: [], machines: [], belts: [], districts: [], power: [], stations: [],
  autonomy: { level: "advisor", next: null, districts: [{ district: "docs", score: 1, risk: "low", permit: true }, { district: "web", score: 0.2, risk: "medium", permit: false }] },
} as unknown as FactoryState;

test("Make it yours lists earned permits with a way to turn each off", () => {
  const html = renderToStaticMarkup(<MakeItYours state={state} send={noop} onClose={noop} />);
  expect(html).toContain(YOURS.permits);
  expect(html).toContain(YOURS.permitOffFor("docs"));
  expect(html).not.toContain(YOURS.permitOffFor("web"));
});

test("live station panels hide the action buttons nothing on the server handles", () => {
  const label = REWORK_COPY.actions[1].label; // "See all scars"
  expect(renderToStaticMarkup(<StationPanel id="rework" state={state} log={[]} send={noop} onClose={noop} />)).toContain(label);
  expect(renderToStaticMarkup(<StationPanel id="rework" state={state} log={[]} send={noop} onClose={noop} live />)).not.toContain(label);
});

test("Make it yours can turn the autonomy level down, never up", () => {
  const at = (level: string) => renderToStaticMarkup(<MakeItYours state={{ ...state, autonomy: { ...state.autonomy!, level } } as FactoryState} send={noop} onClose={noop} />);
  expect(at("advisor")).not.toContain(YOURS.level);
  const html = at("build");
  expect(html).toContain(YOURS.levelDown("Advisor"));
  expect(html).toContain(YOURS.levelDown("Floor"));
  expect(html).not.toContain(YOURS.levelDown("Lights out"));
});

// Same FactoryState contract used by live heartbeat patches; no simulated quota is asserted.
test("Power sheet renders Claude Code and Codex independently with real availability", () => {
  const powered = { ...state, power: [
    { id: "solar-codex", kind: "solar", name: "Codex", level: 1, online: true },
    { id: "solar-claude_code", kind: "solar", name: "Claude Code", level: 1, online: true },
  ], machines: [{ id: "runner-codex", type: "assembler", powerId: "solar-codex", state: "working" }] } as FactoryState;
  const html = renderToStaticMarkup(<StationPanel id="power" state={powered} log={[]} send={noop} onClose={noop} live />);
  expect(html).toContain("Codex · your plan"); expect(html).toContain("Claude Code · your plan");
  expect(html).toContain("busy · 0 jobs"); expect(html).toContain("ready · 0 jobs");
  expect(html).not.toContain("100%");
  const offline = renderToStaticMarkup(<StationPanel id="power" state={{ ...powered, power: powered.power.map(p => ({ ...p, online: false })) }} log={[]} send={noop} onClose={noop} live />);
  expect(offline.match(/offline · 0 jobs/g)).toHaveLength(2);
});
