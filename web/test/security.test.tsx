import { expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Item, Move } from "@shiptorio/shared";
import { NextMove } from "../src/ui/NextMove";
import { ActivityTray } from "../src/ui/ActivityTray";
import { CheckIn } from "../src/ui/CheckIn";

test("issue, incident, PR and Spark display text stays escaped in actual React views", () => {
  const hostile = '<img src=x onerror="alert(1)"><script>alert(2)</script>&';
  const move = Move.parse({ id: "card", title: hostile, why: hostile, plan: [hostile], createdAt: 1,
    options: [{ id: "go", label: hostile, recommended: true, actions: [{ tool: "inspect", reason: hostile, args: {} }] }] });
  const item = Item.parse({ id: "issue", kind: "bug", source: "sentry", title: hostile, body: hostile, district: hostile,
    state: "on_pad", attempts: 0, prNumber: 1, updatedAt: 1 });
  const noop = () => {};
  for (const view of [
    <NextMove move={move} bottleneck={null} send={noop} />,
    <CheckIn deck={[move]} send={noop} onFocus={noop} onClose={noop} />,
    <ActivityTray deck={[move]} pad={[item]} log={[{ level: "error", text: hostile, at: 1 }]} live send={noop} onShow={noop} onLaunch={noop} onClose={noop} header={hostile} settings={null} />,
  ]) {
    const html = renderToStaticMarkup(view);
    expect(html).toContain("&lt;img");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script");
    expect(html).not.toContain('onerror="alert');
  }
});

test("React rejects obfuscated javascript schemes and preserves real PR links", () => {
  const base = { id: "card", title: "Review", why: "Checks passed", createdAt: 1, options: [{ id: "go", label: "Review", actions: [] }] };
  for (const url of ["javascript:alert(1)", "\u0001JaVa\nScRiPt:alert(1)"]) {
    const html = renderToStaticMarkup(<NextMove move={Move.parse({ ...base, url })} bottleneck={null} send={() => {}} />);
    expect(html).toContain("React has blocked");
    expect(html).not.toContain("alert(1)");
  }
  const html = renderToStaticMarkup(<NextMove move={Move.parse({ ...base, url: "https://github.com/example/shop/pull/1" })} bottleneck={null} send={() => {}} />);
  expect(html).toContain('href="https://github.com/example/shop/pull/1"');
});
