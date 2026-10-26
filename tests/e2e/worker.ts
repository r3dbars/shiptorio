// TEST ENTRY ONLY. Production wrangler.jsonc never imports this module.
import app, { Factory as ProductionFactory, type Env } from '../../server/src/index';
export class Factory extends ProductionFactory {
  async testTick() { await this.alarm(); }
}
const BASE = 'a'.repeat(40), HEAD = 'b'.repeat(40);
const files = [
  { filename: 'src/cart.ts', status: 'modified', changes: 2, patch: '-return 0;\n+return 1;' },
  { filename: 'src/cart.test.ts', status: 'modified', changes: 2, patch: '+expect(total()).toBe(1);' },
];
const reply = (value: unknown) => Response.json(value);
// Fail closed: accidental unstubbed provider requests cannot reach the internet.
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  if (url.hostname === 'fixture.meta') {
    const body = JSON.parse(String(init?.body));
    const dev = body.messages[0].content as string;
    let out: unknown;
    if (dev.includes('ONE tool per turn')) {
      const brief = JSON.parse(body.messages[1].content);
      const read = brief.alreadyRead as string[];
      out = !read.includes('issue') ? { tool: 'read_issue', reason: 'Read issue' }
        : !read.includes('src/cart.ts') ? { tool: 'read_file', path: 'src/cart.ts', reason: 'Read implementation' }
        : { tool: 'assign_job', files: ['src/cart.ts', 'src/cart.test.ts'], reason: 'Scope ready', plan: 'Fix the cart total and add a regression test.', acceptance: ['Cart total is correct'] };
    } else if (dev.includes('Pick the files')) out = { files: ['src/cart.ts', 'src/cart.test.ts'] };
    else if (dev.includes('triage incoming')) out = { kind: 'bug', district: 'src', reason: 'Cart defect' };
    else if (dev.includes('game master')) {
      const brief = JSON.parse(body.messages[1].content);
      out = { order: brief.cards.map((c: { id: string }) => c.id), reason: 'Oldest first', picks: {} };
    } else if (dev.includes('"verdict"')) out = { verdict: 'pass', reason: 'Regression covers the fix', findings: [] };
    else throw new Error(`Unstubbed Meta prompt: ${dev.slice(0, 80)}`);
    return reply({ choices: [{ message: { content: JSON.stringify(out) } }] });
  }
  if (url.hostname !== 'api.github.com') throw new Error(`External fetch blocked: ${url.hostname}`);
  const p = url.pathname;
  if (p.endsWith('/access_tokens')) return reply({ token: 'fixture-installation-token' });
  if (p.endsWith('/installation')) return reply({ id: 1 });
  if (p.includes('/git/trees/')) return reply({ sha: BASE, tree: files.map(f => ({ path: f.filename, type: 'blob', size: 100 })), truncated: false });
  if (p.includes('/git/ref/heads/')) return reply({ object: { sha: p.endsWith('/main') ? BASE : HEAD } });
  if (p.includes('/contents/')) return reply({ content: btoa('export const total = () => 0;'), encoding: 'base64' });
  if (p.includes('/compare/')) return reply({ status: 'ahead', ahead_by: 1, files });
  if (p.endsWith('/check-runs')) return reply({ total_count: 1, check_runs: [{ name: 'CI', status: 'completed', conclusion: 'success' }] });
  if (p.endsWith('/status')) return reply({ total_count: 0, statuses: [] });
  if (p.endsWith('/files')) return reply(files);
  if (p.endsWith('/merge')) return reply({ merged: true, sha: HEAD, message: 'Fixture merge' });
  if (p.endsWith('/comments')) return reply({ id: 1 });
  if (/\/issues\/1$/.test(p)) return reply({ number: 1, title: 'Fix cart total', body: 'Cart total is incorrect', state: 'open', user: { login: 'fixture' }, html_url: 'https://github.com/fixture/demo/issues/1' });
  if (p.endsWith('/pulls/99')) return reply({ number: 99, head: { sha: HEAD }, base: { sha: BASE }, merged: false, state: 'open' });
  if (p.endsWith('/pulls')) return init?.method === 'POST' ? reply({ number: 99, html_url: 'https://github.com/fixture/demo/pull/99' }) : reply([]);
  if (/^\/repos\/[^/]+\/[^/]+$/.test(p)) return reply({ default_branch: 'main' });
  throw new Error(`Unstubbed GitHub request: ${init?.method ?? 'GET'} ${p}`);
}) as typeof fetch;

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(req.url);
    const match = url.pathname.match(/^\/__test\/([\w-]+)\/([\w-]+)\/(seed|tick|check)$/);
    if (match) {
      const repo = `${match[1]}/${match[2]}`;
      const f = env.FACTORY.get(env.FACTORY.idFromName(repo));
      if (req.method !== 'POST') return new Response('POST required', { status: 405 });
      if (match[3] === 'seed') {
        await env.DB.prepare('INSERT OR REPLACE INTO repos (full_name, installation_id, default_branch) VALUES (?, 1, ?)').bind(repo, 'main').run();
        await f.ensure(repo, 1);
        await f.ingestIssue({ number: 1, title: 'Fix cart total', body: 'Cart total is incorrect', labels: ['bug'], url: `https://github.com/${repo}/issues/1` });
      } else if (match[3] === 'check') await f.onCheckSuite([99], true, 'CI green', HEAD);
      else await (f as unknown as { testTick(): Promise<void> }).testTick();
      return reply({ ok: true });
    }
    return app.fetch(req, env, ctx);
  },
};
