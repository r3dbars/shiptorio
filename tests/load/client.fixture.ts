// Local child-process preload only: no request leaves the process.
import { mock } from 'bun:test';
import { EventEmitter } from 'node:events';
import { writeFileSync } from 'node:fs';
import { localTestOrigin } from './local-test-guard';
import * as support from './hosted-support';
const counter = process.env.LOAD_TEST_CONSTRUCTIONS_FILE;
if (!counter) throw new Error('Missing local test counter');
writeFileSync(counter, '0', { mode: 0o600 });
const origin = localTestOrigin(process.env.LOAD_ORIGIN);
const supportExports = { ...support };
mock.module('./hosted-support', () => ({ ...supportExports, stagingOrigin: (value: string) => localTestOrigin(value) }));
let constructions = 0;
import { FactoryState } from '../../shared/src';
import { starterLine } from '../../server/src/engine';
const state = FactoryState.parse({ repo: 'load-test/shiptorio-load-crowd', baseBranch: 'main', districts: [], ...starterLine(), items: [], science: { red: 0, green: 0, grey: 0, blue: 0 }, trust: .5, tick: 0 });
state.machines.push({ id: 'load-probe-1', type: 'assembler', state: 'idle', x: 10000, y: 10000, tier: 1, district: '/' });
class LocalWebSocket extends EventEmitter {
  static OPEN = 1;
  readyState = 1;
  constructor(url: string) { super();
    const socket = new URL(url);
    if (!['wss:', 'ws:'].includes(socket.protocol) || !['127.0.0.1', '[::1]'].includes(socket.hostname)) throw new Error('Local socket fixture requires loopback');
    writeFileSync(counter!, String(++constructions));
    queueMicrotask(() => this.emit('message', Buffer.from(JSON.stringify({ type: 'snapshot', state })))); }
  send() {}
  terminate() { this.readyState = 3; this.emit('close'); }
}
mock.module('./socket-client', () => ({ LoadWebSocket: LocalWebSocket }));
if ((await import('./socket-client')).LoadWebSocket !== LocalWebSocket as unknown) throw new Error('Local WebSocket mock missing; refuse client startup');
let versions = 0;
globalThis.fetch = (async (input: string | URL | Request) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  if (url.origin !== origin) throw new Error('Mock refuses all other origins');
  if (url.pathname === '/api/health') return Response.json({ ok: true });
  if (url.pathname === '/judge') return new Response('<html>local fixture</html>');
  if (url.pathname === '/api/version') return Response.json({ commit: (++versions === 1 ? 'a' : 'b').repeat(40) });
  if (url.pathname === '/__load/status') return Response.json({ epoch: 'local-fixture-epoch', grantsAlive: true });
  if (url.pathname === '/api/repos') return Response.json({ repos: [] });
  throw new Error('Unimplemented local fixture path');
}) as typeof fetch;
