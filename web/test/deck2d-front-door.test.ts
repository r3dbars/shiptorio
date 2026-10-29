import { expect, test } from 'bun:test';
import { deckSignedIn, showConnectionTools, storyBeforeSignIn } from '../src/deck2d/main';
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

test('connection chips require live mode, a signed-in player and a valid repo', () => {
  expect(showConnectionTools('?source=live&repo=player/factory', true)).toBe(true);
  for (const search of ['', '?source=sim&watch=1&repo=player/factory', '?source=demo', '?source=live', '?source=live&repo=../factory']) {
    expect(showConnectionTools(search, true)).toBe(false);
  }
  expect(showConnectionTools('?source=live&repo=player/factory', false)).toBe(false);
});

test('a stranger plays every story decision before the existing sign-in card opens once', async () => {
  const requests: string[] = [];
  const connections = createConnections({origin:'https://example.test', path:'/deck?source=live', navigate() {}, async copy() {}, fetch:async url => {
    requests.push(String(url)); return Response.json({guest:true, login:null, githubConfigured:true});
  }});
  let opens = 0;
  const story = storyBeforeSignIn(createStory({seed:1}), {open(target) { opens++; connections.open(target); }});
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
});
