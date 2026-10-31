import { expect, test } from 'bun:test';
import { createConnections } from '../src/deck2d/data/connections';
const settle = () => new Promise(r => setTimeout(r, 0));
function setup(responses: unknown[], repo: string | undefined = 'owner/repo') {
  const calls: { url: string; method: string }[] = [], navigations: string[] = [], copied: string[] = [];
  const ui = createConnections({ repo, origin: 'https://shiptorio.dev', path: '/deck?source=live&repo=owner%2Frepo',
    navigate: url => navigations.push(url), copy: async text => { copied.push(await text); },
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
  expect(f.ui.card()?.yes).toBe('Plan');
  await f.yes();
  expect(f.calls).toEqual([{url:'/api/repos/owner/repo/issues?page=1',method:'GET'},{url:'/api/repos/owner/repo/issues/16/start',method:'POST'}]);
  expect(f.ui.card()).toBeNull();
});
test('an existing PR blocks another start and tells the player which work to finish', async () => {
  const f=setup([{issues:[{id:1,number:16,title:'README',body:''}],nextPage:null},Response.json({error:'Finish PR #27 before starting another issue.'},{status:409})]);
  f.ui.open('repo');await settle();await f.yes();
  expect(f.ui.card()?.line).toContain('Finish PR #27');
});
test('one repo opens by itself; zero repos keeps watching for the GitHub App install', async () => {
  const one = setup([{ repos: [{ fullName: 'alice/only' }] }], ''); one.ui.open('repo'); await settle();
  expect(one.navigations).toEqual(['/deck?source=live&repo=alice%2Fonly&onboard=codex']); expect(one.ui.card()?.title).toBe('Opening alice/only…');
  let t = 0;
  const calls: string[] = [], navigations: string[] = [];
  const answers = [{ repos: [] }, { repos: [{ fullName: 'alice/new' }] }];
  const ui = createConnections({ origin: '', path: '/deck?source=live', navigate: u => navigations.push(u), copy: async () => {}, now: () => t,
    fetch: (async url => { calls.push(String(url)); return Response.json(String(url) === '/api/me' ? { login: 'alice' } : answers.shift()); }) as typeof fetch });
  ui.open('repo'); await settle(); expect(ui.card()?.yes).toBe('Connect GitHub');
  ui.tick(); await settle(); expect(calls).toHaveLength(2); // waits between checks
  t = 6000; ui.tick(); await settle();
  expect(navigations).toEqual(['/deck?source=live&repo=alice%2Fnew&onboard=codex']);
});
test('repository selection explicitly enters live mode and never starts a job', async () => {
  const f = setup([{ repos: [{ fullName: 'alice/a' }, { fullName: 'bob/b' }] }], '');
  f.ui.open('repo'); await settle(); await f.no(); await f.yes();
  expect(f.navigations).toEqual(['/deck?source=live&repo=bob%2Fb&onboard=codex']); expect(f.calls).toHaveLength(2);
});
test('access errors do not imply an empty inbox or a ready engine', async () => {
  const f = setup([new Response('', { status: 403 })]); f.ui.open('power'); await settle();
  expect(f.ui.card()?.title).toBe('Connection needs attention'); expect(f.ui.card()?.line).toContain('GitHub App');
});
test('login preserves the return path', async () => {
  const f = setup([new Response('', { status: 401 })]); f.ui.open('repo'); await settle(); await f.yes();
  expect(f.navigations[0]).toContain('/auth/login?next=%2Fdeck');
});
test('engine readiness requires Codex or Muse Code, not merely another signed-in agent', async () => {
  for (const [harnesses, word] of [[['claude_code'], 'Sign in to Codex or Muse Code'], [['codex'], 'Codex engine is ready'], [['muse_code'], 'Muse Code engine is ready'], [['muse_code', 'codex'], 'Codex engine is ready']] as const) {
    const f = setup([{ paired: true, online: true, harnesses }]); f.ui.open('power'); await settle(); expect(f.ui.card()?.title).toBe(word);
  }
});
test('setup is one explicit tap: it asks for the join code and copies the line, and never enqueues work', async () => {
  const f = setup([{ paired: false, online: false, harnesses: [] }, { join: 'example-code', expires: Date.now() + 60000 }]);
  f.ui.open('power'); await settle(); expect(f.calls).toHaveLength(1); expect(f.ui.card()?.yes).toBe('Copy setup');
  const action = f.yes(); await f.yes(); await action;
  expect(f.calls).toHaveLength(2); expect(f.calls[1]).toEqual({ url: '/api/repos/owner/repo/runner/join', method: 'POST' });
  expect(f.copied).toHaveLength(1); expect(f.copied[0]).toContain('--join'); expect(f.ui.card()?.title).toBe('Paste it into Terminal');
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
  expect(f.ui.card()?.title).toBe('Connect your coding engine');
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


test('a Muse Code engine also opens the first issue card by itself', async () => {
  const ui = createConnections({repo:'owner/repo',origin:'https://shiptorio.dev',path:'/deck?source=live&repo=owner%2Frepo&onboard=codex',navigate:()=>{},copy:async()=>{},fetch:(async url=>Response.json(String(url).includes('/status')?{paired:true,online:true,harnesses:['muse_code']}:{issues:[{id:1,number:16,title:'README',body:''}],nextPage:null})) as typeof fetch});
  await settle();await settle();expect(ui.card()?.yes).toBe('Plan');expect(ui.card()?.line).toContain('before Muse Code starts');
  expect(ui.engineReady()).toBe(true);
});
test('choosing a repo leads to Codex, then directly to the first issue card', async () => {
  const calls: string[] = [];
  const ui = createConnections({repo:'owner/repo',origin:'https://shiptorio.dev',path:'/deck?source=live&repo=owner%2Frepo&onboard=codex',navigate:()=>{},copy:async()=>{},fetch:(async url=>{calls.push(String(url));return Response.json(String(url).includes('/status')?{paired:true,online:true,harnesses:['codex']}:{issues:[{id:1,number:16,title:'README',body:''}],nextPage:null});}) as typeof fetch});
  await settle();await settle();expect(ui.card()?.yes).toBe('Plan');
  expect(calls).toEqual(['/api/repos/owner/repo/runner/status','/api/repos/owner/repo/issues?page=1']);
});


test('anonymous front door asks for sign-in without a protected API request', async () => {
  const calls: string[] = [];
  const ui = createConnections({origin:'https://shiptorio.dev',path:'/deck?source=live',navigate:()=>{},copy:async()=>{},fetch:(async url=>{calls.push(String(url));return Response.json({guest:true,login:null,githubConfigured:true});}) as typeof fetch});
  ui.open('repo');await settle();expect(ui.card()?.title).toBe('Sign in to your factory');expect(ui.card()?.yes).toBe('Sign in');expect(calls).toEqual(['/api/me']);
});

test('a visitor without the preview password gets the password popup before GitHub sign-in', async () => {
  const asked: string[] = [], navigations: string[] = [];
  const ui = createConnections({origin:'https://shiptorio.dev',path:'/deck?source=live',navigate:url=>navigations.push(url),askPassword:next=>asked.push(next),copy:async()=>{},
    fetch:(async()=>new Response('Preview password required',{status:401})) as typeof fetch});
  ui.open('repo');await settle();
  expect(ui.card()).toMatchObject({title:'Sign in to your factory',yes:'Sign in'});
  await ui.answer(ui.card()!.id,true);
  expect(asked).toEqual(['/auth/login?next=%2Fdeck%3Fsource%3Dlive']);
  expect(navigations).toEqual([]);
});

test('a visitor who already has the password goes straight to GitHub', async () => {
  const asked: string[] = [], navigations: string[] = [];
  const ui = createConnections({origin:'https://shiptorio.dev',path:'/deck?source=live',navigate:url=>navigations.push(url),askPassword:next=>asked.push(next),copy:async()=>{},
    fetch:(async()=>Response.json({guest:true,login:null,githubConfigured:true})) as typeof fetch});
  ui.open('repo');await settle();await ui.answer(ui.card()!.id,true);
  expect(asked).toEqual([]);
  expect(navigations).toEqual(['/auth/login?next=%2Fdeck%3Fsource%3Dlive']);
});

test('ready engine keeps unplug behind Options and never disconnects on the first tap', async () => {
  const f = setup([{ paired: true, online: true, harnesses: ['codex'] }]);
  f.ui.open('power'); await settle();
  expect(f.ui.card()).toMatchObject({ yes: 'See issues', no: 'Options' });
  await f.no();
  expect(f.ui.card()).toMatchObject({ title: 'Engine options', yes: 'Unplug', no: 'Close' });
  expect(f.calls.every(call => call.method === 'GET')).toBe(true);
});

test('after copy there is no Check: the first issue card comes up once the runner is online', async () => {
  let t = 0;
  const responses: unknown[] = [{ paired: false, online: false, harnesses: [] }, { join: 'example-code', expires: 600000 }, { paired: true, online: false, harnesses: [] },
    { paired: true, online: true, harnesses: ['codex'] }, { issues: [{ id: 1, number: 16, title: 'README', body: '' }], nextPage: null }];
  const copied: string[] = [], calls: string[] = [];
  const ui = createConnections({ repo: 'owner/repo', origin: 'https://shiptorio.dev', path: '/deck?source=live&repo=owner%2Frepo', navigate() {}, now: () => t,
    copy: async text => { copied.push(await text); }, fetch: (async (url, init) => { calls.push(`${init?.method ?? 'GET'} ${url}`); return Response.json(responses.shift()); }) as typeof fetch });
  ui.open('power'); await settle(); await ui.answer(ui.card()!.id, true);
  expect(ui.card()).toMatchObject({ title: 'Paste it into Terminal', yes: 'Copy again', no: 'Close' });
  await ui.answer(ui.card()!.id, true); expect(copied).toHaveLength(2);
  t = 3000; ui.tick(); await settle(); expect(ui.card()?.title).toBe('Paste it into Terminal'); // paired, not online yet
  t = 6000; ui.tick(); await settle(); await settle();
  expect(ui.card()?.yes).toBe('Plan');
  expect(calls.filter(c => c.startsWith('POST'))).toEqual(['POST /api/repos/owner/repo/runner/join']);
});

test('a single repo and an issue use short labels without repeated setup warnings', async () => {
  const f = setup([{ repos: [{ fullName: 'owner/repo' }] }], ''); f.ui.open('repo'); await settle();
  expect(f.ui.card()?.title).toBe('Opening owner/repo…');
  const issue = setup([{ issues: [{id:1,number:16,title:'Fix checkout',body:''}], nextPage:null }]);
  issue.ui.open('repo'); await settle(); expect(issue.ui.card()?.no).toBe('Next issue');
  expect(issue.ui.card()?.line).not.toContain('Shippy:');
});

test('opening a repo never leaves the site, even from a protocol-relative page path', async () => {
  const navigations: string[] = [];
  const ui = createConnections({ origin: 'https://shiptorio.dev', path: '//evil.example/deck?source=live', navigate: u => navigations.push(u), copy: async () => {},
    fetch: (async url => Response.json(String(url) === '/api/me' ? { login: 'alice' } : { repos: [{ fullName: 'alice/only' }] })) as typeof fetch });
  ui.open('repo'); await settle();
  expect(navigations).toEqual(['/deck?source=live&repo=alice%2Fonly&onboard=codex']);
});
test("Shippy's suggested issue comes first with one plain reason, and names Meta Muse Spark only for Spark's pick", async () => {
  const rows = [{ id: 1, number: 101, title: 'Fix cart', body: 'Real issue' }, { id: 2, number: 102, title: 'Fix typo', body: '' }];
  const f = setup([{ issues: rows, nextPage: null, suggested: { number: 102, because: "it's docs only, so nothing can break.", by: 'spark' } }]);
  f.ui.open('repo'); await settle();
  expect(f.ui.card()?.title).toBe('#102: Fix typo');
  expect(f.ui.card()?.line).toBe("I'd start with #102, because it's docs only, so nothing can break. (Picked by Meta Muse Spark.) Review the plan before your engine starts.");
  await f.no(); expect(f.ui.card()?.title).toBe('#101: Fix cart'); expect(f.ui.card()?.line).not.toContain("I'd start");
  const g = setup([{ issues: rows, nextPage: null, suggested: { number: 101, because: "it's the smallest clear ask in your repo.", by: 'fallback' } }]);
  g.ui.open('repo'); await settle();
  expect(g.ui.card()?.line).toBe("I'd start with #101, because it's the smallest clear ask in your repo. Review the plan before your engine starts.");
  const h = setup([{ issues: rows, nextPage: null, suggested: { number: 999, because: 'gone', by: 'spark' } }]);
  h.ui.open('repo'); await settle();
  expect(h.ui.card()?.title).toBe('#101: Fix cart'); expect(h.ui.card()?.line).not.toContain('Spark');
});
