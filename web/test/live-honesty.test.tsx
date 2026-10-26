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
