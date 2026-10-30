import { createTour } from '../src/deck2d/story/tour';
import { describe, expect, mock, test } from 'bun:test';
import { deckSignedIn, freshStart, oneAsk, setupFromStations, storyBeforeSignIn } from '../src/deck2d/main';
import { createStory } from '../src/deck2d/story';
import { createConnections } from '../src/deck2d/data/connections';

test('live URL requires a real session, not a guest, missing login or failed check', async () => {
  for (const account of [{ guest: true, login: 'guest' }, { login: null }, {}]) {
    expect(await deckSignedIn(async () => Response.json(account))).toBe(false);
  }
  expect(await deckSignedIn(async () => Response.json({ login: 'player' }))).toBe(true);
  expect(await deckSignedIn(async () => new Response('', {status:401}))).toBe(false);
  expect(await deckSignedIn(async () => { throw new Error('offline'); })).toBe(false);
});

test('a stalled session check falls back to the story instead of blocking the first frame', async () => {
  let aborted = false;
  const signedIn = await deckSignedIn((_url, options) => new Promise((_resolve, reject) => {
    options!.signal!.addEventListener('abort', () => { aborted = true; reject(options!.signal!.reason); });
  }));
  expect(aborted).toBe(true);
  expect(signedIn).toBe(false);
});

test('tapping Repo or the boilers opens setup only in live mode with, a signed-in player and a valid repo', () => {
  expect(setupFromStations('?source=live&repo=player/factory', true)).toBe(true);
  for (const search of ['', '?source=sim&watch=1&repo=player/factory', '?source=demo', '?source=live', '?source=live&repo=../factory']) {
    expect(setupFromStations(search, true)).toBe(false);
  }
  expect(setupFromStations('?source=live&repo=player/factory', false)).toBe(false);
  expect(setupFromStations('?source=live&repo=player/factory&onboard=codex', false)).toBe(false);
});

test('a stranger plays every story decision before the existing sign-in card opens once', async () => {
  const requests: string[] = [];
  const connections = createConnections({origin:'https://example.test', path:'/deck?source=live', navigate() {}, async copy() {}, fetch:async url => {
    requests.push(String(url)); return Response.json({guest:true, login:null, githubConfigured:true});
  }});
  let opens = 0;
  const original = createStory({seed:1});
  const story = storyBeforeSignIn(original, {open(target) { opens++; connections.open(target); }, card: connections.card});
  const approvals: string[] = [];
  for (let i = 0; i < 4000 && !opens; i++) {
    story.step?.(0.1);
    const card = story.view().card;
    if (card) { approvals.push(card.id); story.approve(card.id); }
  }
  expect(approvals.length).toBe(3);
  expect(approvals.every(id => id.startsWith('story-call-'))).toBe(true);
  expect(opens).toBe(1);
  await new Promise(resolve => setTimeout(resolve, 0));
  const final = connections.view(story.view()).card;
  expect(final?.title).toBe('Sign in to your factory');
  expect(final?.yes).toBe('Sign in');
  expect(requests).toEqual(['/api/me']);
  story.view(); story.view();
  expect(opens).toBe(1);
  await connections.answer(final!.id, false);
  story.view();
  expect(original.phase()).toBe('build');
  expect(connections.card()).toBeNull();
  for (let i = 0; i < 1000 && !story.view().card; i++) story.step?.(0.1);
  const replay = story.view().card!;
  expect(approvals).not.toContain(replay.id);
  expect(replay.id).toContain(':replay-1');
  story.approve(approvals[0]);
  expect(story.view().card?.id).toBe(replay.id);
  story.approve(replay.id);
  expect(story.view().card).toBeNull();
});

test('one question at a time: while a card asks, only its station glows', () => {
  const card = { id: 'c', title: 'Approve?', line: '', dots: null, stop: 'review' as const };
  const view = { stops: [], jam: null, card, shippy: { pose: 'inspect' as const, at: 'review' as const }, shipped: 0, caption: null, attention: ['repo', 'review', 'gate'] };
  expect(oneAsk(view).attention).toEqual(['review']);
  expect(oneAsk({ ...view, attention: ['repo'] }).attention).toEqual(['review']); // the card's own station, never another
  expect(oneAsk({ ...view, card: null }).attention).toEqual(['repo', 'review', 'gate']); // no card: the view is untouched
  const single = { ...view, attention: ['review'] };
  expect(oneAsk(single)).toBe(single);
});

describe("?fresh=1 replays the first run (staging only)", () => {
  const store = (init: Record<string, string>) => {
    const data = new Map(Object.entries(init));
    return Object.assign(Object.create(null), Object.fromEntries(data), {
      removeItem(k: string) { data.delete(k); delete (this as Record<string, unknown>)[k]; }, clear() { data.clear(); },
      has: (k: string) => data.has(k), size: () => data.size,
    });
  };
  const loc = (hostname: string, search = "?fresh=1") => ({ hostname, search, pathname: "/deck", replace: mock((_: string) => {}) });

  test("on shiptorio.dev it forgets shiptorio keys, signs out and reloads as a guest", async () => {
    const local = store({ "shiptorio.sound": "{}", "shiptorio.deck.shippedToday": "3", "other": "keep" });
    const session = store({ "shiptorio:chunk-reloaded": "1" });
    const request = mock(async () => new Response(null));
    const where = loc("shiptorio.dev");
    expect(await freshStart(where, local as unknown as Storage, session as unknown as Storage, request as unknown as typeof fetch)).toBe(true);
    expect(local.has("shiptorio.sound") || local.has("shiptorio.deck.shippedToday")).toBe(false);
    expect(local.has("other")).toBe(true);
    expect(session.size()).toBe(0);
    expect((request.mock.calls[0] as unknown[])[0]).toBe("/auth/logout");
    expect(where.replace).toHaveBeenCalledWith("/deck?source=live");
  });

  test("does nothing on shiptorio.com or without the flag", async () => {
    const local = store({ "shiptorio.sound": "{}" }), request = mock(async () => new Response(null));
    for (const where of [loc("shiptorio.com"), loc("www.shiptorio.com"), loc("shiptorio.dev", "?source=live")])
      expect(await freshStart(where, local as unknown as Storage, local as unknown as Storage, request as unknown as typeof fetch)).toBe(false);
    expect(local.has("shiptorio.sound")).toBe(true);
    expect(request).not.toHaveBeenCalled();
  });
});

test('the guest tour asks "Want to create your own factory?" first; its yes goes straight to GitHub, and closing sign-in asks again', async () => {
  const went: string[] = [];
  const connections = createConnections({origin:'https://example.test', path:'/deck?source=live', navigate(url) { went.push(url); }, async copy() {}, fetch:async () => Response.json({guest:true, login:null, githubConfigured:true})});
  let opens = 0;
  const story = storyBeforeSignIn(createTour(), {open(target) { opens++; connections.open(target); }, card: connections.card, answer: connections.answer}, {ask: true});
  for (let i = 0; i < 4000 && story.view().card?.title !== 'Want to create your own factory?'; i++) { const c = story.view().card; if (c) story.approve(c.id); else story.step?.(0.1); } // play to the end (no Skip)
  const ask = story.view().card!;
  expect(ask.title).toBe('Want to create your own factory?');
  story.view(); story.view();
  expect(opens).toBe(0);
  story.approve(ask.id);
  expect(story.view().card).toBeNull();
  expect(opens).toBe(1);
  await new Promise(resolve => setTimeout(resolve, 0));
  story.view(); story.view();
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(went).toEqual(['/auth/login?next=%2Fdeck%3Fsource%3Dlive']); // one press, no second sign-in card to tap
  const signIn = connections.card()!;
  await connections.answer(signIn.id, false); // back from the password or GitHub without signing in
  const again = story.view().card!;
  expect(again.title).toBe('Want to create your own factory?');
  expect(again.id).not.toBe(ask.id);
  expect(opens).toBe(1);
});
