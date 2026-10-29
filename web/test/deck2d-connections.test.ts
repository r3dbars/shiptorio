import { expect, test } from 'bun:test';
import { createConnections } from '../src/deck2d/data/connections';
const settle = () => new Promise(r => setTimeout(r, 0));
function setup(responses: unknown[], repo: string | undefined = 'owner/repo') {
  const calls: { url: string; method: string }[] = [], navigations: string[] = [], copied: string[] = [];
  const ui = createConnections({ repo, origin: 'https://shiptorio.dev', path: '/deck?source=live&repo=owner%2Frepo',
    navigate: url => navigations.push(url), copy: async text => { copied.push(text); },
    fetch: (async (url, init) => { calls.push({ url: String(url), method: init?.method ?? 'GET' }); const r = String(url) === '/api/me' && !(responses[0] && typeof responses[0] === 'object' && 'githubConfigured' in responses[0]) ? {login:'fixture'} : responses.shift(); return r instanceof Response ? r : Response.json(r); }) as typeof fetch,
  });
  const yes = () => ui.answer(ui.card()!.id, true), no = () => ui.answer(ui.card()!.id, false);
  return { ui, calls, navigations, copied, yes, no };
}
test('browse real issues without starting work; refresh does not accumulate duplicates', async () => {
  const issues = { issues: [{ id: 1, number: 101, title: 'Fix cart', body: 'Real issue' }, { id: 2, number: 102, title: 'Fix checkout', body: '' }], nextPage: null };
  const f = setup([issues, issues]); f.ui.open('repo'); await settle();
  expect(f.ui.card()?.title).toBe('#101: Fix cart'); await f.no(); expect(f.ui.card()?.title).toBe('#102: Fix checkout');
  await f.no(); expect(f.ui.card()?.title).toBe('#101: Fix cart');
  expect(f.calls).toEqual([{ url: '/api/repos/owner/repo/issues?page=1', method: 'GET' }, { url: '/api/repos/owner/repo/issues?page=1', method: 'GET' }]);
  f.ui.open('repo'); expect(f.ui.card()).toBeNull();
});
test('empty pages can advance, and empty inbox is clearly different from error', async () => {
  const f = setup([{ issues: [], nextPage: 2 }, { issues: [], nextPage: null }]);
  f.ui.open('repo'); await settle(); expect(f.ui.card()?.yes).toBe('More issues'); await f.yes();
  expect(f.calls[1].url).toEndWith('page=2'); expect(f.ui.card()?.title).toContain('No open issues');
});
test('starting the selected issue requests only its plan, once, then returns to the live deck', async () => {
  const f = setup([{issues:[{id:1,number:16,title:'README',body:''}],nextPage:null},{jobId:'planned'}]);
  f.ui.open('repo'); await settle();
  expect(f.ui.card()?.yes).toBe('Start issue');
  await f.yes();
  expect(f.calls).toEqual([{url:'/api/repos/owner/repo/issues?page=1',method:'GET'},{url:'/api/repos/owner/repo/issues/16/start',method:'POST'}]);
  expect(f.ui.card()).toBeNull();
});
test('an existing PR blocks another start and tells the player which work to finish', async () => {
  const f=setup([{issues:[{id:1,number:16,title:'README',body:''}],nextPage:null},Response.json({error:'Finish PR #27 before starting another issue.'},{status:409})]);
  f.ui.open('repo');await settle();await f.yes();
  expect(f.ui.card()?.line).toContain('Finish PR #27');
});
test('repository selection explicitly enters live mode and never starts a job', async () => {
  const f = setup([{ repos: [{ fullName: 'alice/a' }, { fullName: 'bob/b' }] }], '');
  f.ui.open('repo'); await settle(); await f.no(); await f.yes();
  expect(f.navigations).toEqual(['/deck?source=live&repo=bob%2Fb&onboard=codex']); expect(f.calls).toHaveLength(2);
});
test('access errors do not imply an empty inbox or a ready engine', async () => {
  const f = setup([new Response('', { status: 403 })]); f.ui.open('power'); await settle();
  expect(f.ui.card()?.title).toBe('Connection needs attention'); expect(f.ui.card()?.line).toContain('permission');
});
test('login preserves the return path', async () => {
  const f = setup([new Response('', { status: 401 })]); f.ui.open('repo'); await settle(); await f.yes();
  expect(f.navigations[0]).toContain('/auth/login?next=%2Fdeck');
});
test('Codex readiness requires Codex, not merely another signed-in agent', async () => {
  for (const [harnesses, word] of [[['claude_code'], 'Sign in to Codex'], [['codex'], 'Codex engine is ready']] as const) {
    const f = setup([{ paired: true, online: true, harnesses }]); f.ui.open('power'); await settle(); expect(f.ui.card()?.title).toBe(word);
  }
});
test('setup requires an explicit click, copies locally, and never enqueues work', async () => {
  const f = setup([{ paired: false, online: false, harnesses: [] }, { join: 'example-code', expires: Date.now() + 60000 }]);
  f.ui.open('power'); await settle(); expect(f.calls).toHaveLength(1);
  const action = f.yes(); await f.yes(); await action;
  expect(f.calls).toHaveLength(2); expect(f.calls[1]).toEqual({ url: '/api/repos/owner/repo/runner/join', method: 'POST' });
  await f.yes(); expect(f.copied[0]).toContain('--join'); expect(f.ui.card()?.title).toBe('Setup command copied');
});
test('disconnect requires a second explicit confirmation and can be cancelled', async () => {
  const f = setup([{ paired: true, online: true, harnesses: ['codex'] }]); f.ui.open('power'); await settle();
  await f.no(); expect(f.ui.card()?.title).toBe('Engine options'); await f.no();
  expect(f.ui.card()).toBeNull(); expect(f.calls).toHaveLength(1);
});
test('stale inbox response cannot replace the engine card', async () => {
  let resolve!: (r: Response) => void;
  const ui = createConnections({ repo: 'a/b', origin: '', path: '', navigate() {}, copy: async () => {}, fetch: (async url => String(url).endsWith('/issues?page=1') ? new Promise<Response>(r => { resolve = r; }) : Response.json({ paired: true, online: true, harnesses: ['codex'] })) as typeof fetch });
  ui.open('repo'); ui.open('power'); await settle(); resolve(Response.json({ issues: [], nextPage: null })); await settle();
  expect(ui.card()?.title).toBe('Codex engine is ready');
});
test('refresh replaces the answered card ID even when status is unchanged', async () => {
  const ready = { paired: true, online: true, harnesses: ['codex'], working: { title: 'Existing job' } };
  const f = setup([ready, ready]); f.ui.open('power'); await settle();
  const before = f.ui.card()!.id; await f.yes();
  expect(f.ui.card()?.id).not.toBe(before); expect(f.ui.card()?.title).toBe('Engine is busy');
});
test('invalid repository input cannot turn setup into a different API request', async () => {
  const f = setup([{ repos: [] }], '../account'); f.ui.open('power'); await settle();
  expect(f.calls).toEqual([{ url: '/api/me', method: 'GET' }, { url: '/api/repos?page=1', method: 'GET' }]);
});
test('a delayed setup response cannot replace a newly opened inbox', async () => {
  let finish!: (r: Response) => void;
  const ui = createConnections({ repo:'a/b', origin:'https://shiptorio.dev', path:'/deck', navigate() {}, copy:async()=>{}, fetch:(async (url, init) => {
    if(init?.method === 'POST') return new Promise<Response>(r=>{finish=r;});
    return String(url).includes('/issues') ? Response.json({issues:[],nextPage:null}) : Response.json({paired:false,online:false,harnesses:[]});
  }) as typeof fetch });
  ui.open('power'); await settle(); const pending=ui.answer(ui.card()!.id,true);
  ui.open('repo'); await settle(); finish(Response.json({join:'late',expires:Date.now()+10000})); await pending;
  expect(ui.card()?.title).toBe('No open issues on this page');
});
test('confirmed disconnect revokes the pairing then refreshes status', async () => {
  const f = setup([{paired:true,online:true,harnesses:['codex']},{ok:true},{paired:false,online:false,harnesses:[]}]);
  f.ui.open('power'); await settle(); await f.no(); await f.yes();
  expect(f.calls[1]).toEqual({url:'/api/repos/owner/repo/runner/disconnect',method:'POST'});
  expect(f.ui.card()?.title).toBe('Connect your Codex engine');
});
test('missing server GitHub credentials stay on the deck instead of sending the player to a broken login', async () => {
  const f = setup([new Response('',{status:401}),{githubConfigured:false}]); f.ui.open('repo'); await settle();
  expect(f.ui.card()?.line).toContain('setup is not finished'); expect(f.ui.card()?.yes).toBe('Try again');
  expect(f.navigations).toHaveLength(0);
});
test('repository browsing requests the next bounded page after the last card', async () => {
  const f=setup([{repos:[{fullName:'a/first'}],nextPage:2},{repos:[{fullName:'a/next'}],nextPage:null}],'');
  f.ui.open('repo');await settle();await f.no();
  expect(f.calls[2].url).toBe('/api/repos?page=2');await f.yes();expect(f.navigations[0]).toContain('a%2Fnext');
});
test('rate-limit errors remain visible rather than being cleared by status polling', async () => {
  const f=setup([new Response('',{status:429,headers:{'retry-after':'60'}})]);
  f.ui.open('power');await settle();f.ui.tick();await settle();
  expect(f.calls).toHaveLength(1);expect(f.ui.card()?.line).toContain('60 seconds');
});


test('choosing a repo leads to Codex, then directly to the first issue card', async () => {
  const calls: string[] = [];
  const ui = createConnections({repo:'owner/repo',origin:'https://shiptorio.dev',path:'/deck?source=live&repo=owner%2Frepo&onboard=codex',navigate:()=>{},copy:async()=>{},fetch:(async url=>{calls.push(String(url));return Response.json(String(url).includes('/status')?{paired:true,online:true,harnesses:['codex']}:{issues:[{id:1,number:16,title:'README',body:''}],nextPage:null});}) as typeof fetch});
  await settle();expect(ui.card()?.yes).toBe('Open inbox');expect(ui.card()?.no).toBe('Options');
  await ui.answer(ui.card()!.id,true);expect(ui.card()?.yes).toBe('Start issue');
  expect(calls).toEqual(['/api/repos/owner/repo/runner/status','/api/repos/owner/repo/issues?page=1']);
});


test('anonymous front door asks for sign-in without a protected API request', async () => {
  const calls: string[] = [];
  const ui = createConnections({origin:'https://shiptorio.dev',path:'/deck?source=live',navigate:()=>{},copy:async()=>{},fetch:(async url=>{calls.push(String(url));return Response.json({guest:true,login:null,githubConfigured:true});}) as typeof fetch});
  ui.open('repo');await settle();expect(ui.card()?.title).toBe('Sign in to your factory');expect(ui.card()?.yes).toBe('Sign in');expect(calls).toEqual(['/api/me']);
});

test('ready engine keeps unplug behind Options and never disconnects on the first tap', async () => {
  const f = setup([{ paired: true, online: true, harnesses: ['codex'] }]);
  f.ui.open('power'); await settle();
  expect(f.ui.card()).toMatchObject({ yes: 'Open inbox', no: 'Options' });
  await f.no();
  expect(f.ui.card()).toMatchObject({ title: 'Engine options', yes: 'Unplug', no: 'Close' });
  expect(f.calls.every(call => call.method === 'GET')).toBe(true);
});

test('after copy, Check is primary and Copy setup remains secondary', async () => {
  const f = setup([{ paired: false, online: false, harnesses: [] }, { join: 'example-code', expires: Date.now() + 60000 }, { paired: true, online: true, harnesses: ['codex'] }]);
  f.ui.open('power'); await settle(); await f.yes();
  expect(f.ui.card()).toMatchObject({ yes: 'Copy setup', no: 'Check' });
  await f.yes();
  expect(f.ui.card()).toMatchObject({ title: 'Setup command copied', yes: 'Check', no: 'Copy setup' });
  await f.no(); expect(f.copied).toHaveLength(2);
  await f.yes(); expect(f.ui.card()?.title).toBe('Codex engine is ready');
  expect(f.calls.filter(call => call.method === 'POST')).toHaveLength(1);
});

test('a single repo and an issue use short labels without repeated setup warnings', async () => {
  const f = setup([{ repos: [{ fullName: 'owner/repo' }] }], ''); f.ui.open('repo'); await settle();
  expect(f.ui.card()?.line).toBe('Shippy reads its issues and opens PRs here. Codex is next.');
  const issue = setup([{ issues: [{id:1,number:16,title:'Fix checkout',body:''}], nextPage:null }]);
  issue.ui.open('repo'); await settle(); expect(issue.ui.card()?.no).toBe('Next issue');
  expect(issue.ui.card()?.line).not.toContain('Shippy:');
});
