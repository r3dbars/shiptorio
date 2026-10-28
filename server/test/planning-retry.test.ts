import { describe, expect, test } from "bun:test";
import { BudgetError } from "../src/budget";
import { OutboundError, RetryExhausted } from "../src/reliability";
import { SparkError } from "../src/spark";
import { planningDeadline, planningFailure, planningFailureKind, planningHold, plannerRestDeck } from "../src/planning-retry";

const now = Date.parse("2026-10-27T20:00:00Z");
const cases = [
  [new SparkError("Planner rate limit (429)", now + 300_000), "rate_limit"],
  [new RetryExhausted("completion", 3, new OutboundError(503)), "unavailable"],
  [new DOMException("Timed out", "TimeoutError"), "timeout"],
  [new BudgetError("Planner daily call/token budget exhausted"), "cap"],
  [new SparkError("malformed JSON"), "bad_output"],
] as const;

describe("planner cooldowns", () => {
  test("a repo with no budget owner yet never rests the planner", () => {
    expect(planningFailureKind(new BudgetError("Budget owner unavailable; sign in and connect this repo to resume planning"))).toBe("other");
  });
  for (const [error, kind] of cases) test(`${kind} parks once and recovers at its reset`, () => {
    expect(planningFailureKind(error)).toBe(kind);
    let retry = planningFailure(undefined, error, now);
    for (let n = 1; n < 3; n++) retry = planningFailure(retry, error, now + n * 1000);
    expect(retry.failures).toBe(3);
    expect(planningHold(retry, retry.retryAt - 1)).not.toBeNull();
    const deck = plannerRestDeck(plannerRestDeck([], retry, now), retry, now);
    expect(deck.filter(m => m.id === "planner-rest")).toHaveLength(1);
    expect(deck[0].title).not.toContain("Spark");
    expect(plannerRestDeck(deck, retry, retry.retryAt)).toHaveLength(0);
    expect(planningHold(retry, retry.retryAt)).toBeNull();
  });
  test("429 honors Retry-After and daily caps do not retry until midnight", () => {
    expect(planningFailure(undefined, cases[0][0], now).retryAt).toBe(now + 300_000);
    const cap = planningFailure(undefined, cases[3][0], now);
    expect(cap.retryAt).toBe(Date.parse("2026-10-28T00:00:00Z"));
    expect(planningFailure(cap, cases[3][0], cap.retryAt).failures).toBe(1);
  });
  test("a whole plan deadline aborts a hung tool read and fences late writes", async () => {
    let signal: AbortSignal | undefined;
    let release!: () => void;
    let wrote = false;
    const pending = new Promise<void>(resolve => { release = resolve; });
    await expect(planningDeadline(async abort => { signal = abort; await pending; abort.throwIfAborted(); wrote = true; }, 5)).rejects.toThrow("deadline");
    expect(signal?.aborted).toBe(true);
    release();
    await Promise.resolve();
    expect(wrote).toBe(false);
    let started = false;
    await expect(planningDeadline(async () => { started = true; }, 0)).rejects.toThrow("deadline");
    expect(started).toBe(false);
  });
});

test("the resting card respects the twelve-card browser contract on a full deck", async () => {
  const { ServerToWeb } = await import('@shiptorio/shared');
  const retry = planningFailure(undefined, new Error('503'), now);
  const sample = plannerRestDeck([], retry, now)[0];
  const full = Array.from({ length: 12 }, (_, n) => ({ ...sample, id: `existing-${n}` }));
  const deck = plannerRestDeck(full, retry, now);
  expect(deck).toHaveLength(12);
  expect(ServerToWeb.safeParse({ type: 'deck', deck }).success).toBe(true);
  expect(deck.filter(m => m.id === 'planner-rest')).toHaveLength(1);
});

test("live deck, active move and reconnect snapshot all show the player's local reset time", async () => {
  const { connectLive } = await import('../../web/src/source/live');
  const originalSocket = globalThis.WebSocket;
  const originalLocation = Object.getOwnPropertyDescriptor(globalThis, 'location');
  const seen: unknown[] = [];
  let socket!: { onmessage?: (event: { data: string }) => void; close(): void };
  class Socket {
    onmessage?: (event: { data: string }) => void;
    close() {}
    constructor() { socket = this; }
  }
  Object.defineProperty(globalThis, 'WebSocket', { value: Socket, configurable: true, writable: true });
  Object.defineProperty(globalThis, 'location', { value: { protocol: 'https:', host: 'shiptorio.test' }, configurable: true });
  const source = connectLive('owner/repo', msg => seen.push(msg), () => {});
  try {
    const retry = planningFailure(undefined, new Error('503'), now);
    const deck = plannerRestDeck([], retry, now);
    const expected = `Planner is resting until ${new Date(retry.retryAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}`;
    const { FactoryState } = await import('@shiptorio/shared');
    const { starterLine } = await import('../src/engine');
    const state = FactoryState.parse({ repo: 'owner/repo', baseBranch: 'main', districts: [], ...starterLine(), items: [], science: { red: 0, green: 0, grey: 0, blue: 0 }, trust: 0.5, tick: 0, deck, move: deck[0] });
    socket.onmessage!({ data: JSON.stringify({ type: 'snapshot', state }) });
    socket.onmessage!({ data: JSON.stringify({ type: 'deck', deck }) });
    socket.onmessage!({ data: JSON.stringify({ type: 'move', move: deck[0] }) });
    expect(seen).toHaveLength(3);
    const [snapshot, update, move] = seen as [{ state: { deck: { title: string }[]; move: { title: string } } }, { deck: { title: string }[] }, { move: { title: string } }];
    expect(update.deck[0].title).toBe(expected);
    expect(move.move.title).toBe(expected);
    expect(snapshot.state.deck[0].title).toBe(expected);
    expect(snapshot.state.move.title).toBe(expected);
  } finally {
    source.close();
    globalThis.WebSocket = originalSocket;
    if (originalLocation) Object.defineProperty(globalThis, 'location', originalLocation);
    else Reflect.deleteProperty(globalThis, 'location');
  }
});

test("a provider's Retry-After window can cross UTC midnight without retrying early", () => {
  const start = Date.parse('2026-10-27T23:59:00Z');
  const retryAt = start + 300000;
  const retry = planningFailure(undefined, new SparkError('Planner rate limit (429)', retryAt), start);
  expect(retry.retryAt).toBe(retryAt);
  expect(planningHold(retry, Date.parse('2026-10-28T00:00:00Z'))).toEqual(retry);
  expect(planningHold(retry, retryAt)).toBeNull();
});
