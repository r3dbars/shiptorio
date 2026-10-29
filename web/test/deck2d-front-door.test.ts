import { expect, test } from 'bun:test';
import { deckSignedIn, oneAsk, setupFromStations, storyBeforeSignIn } from '../src/deck2d/main';
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
