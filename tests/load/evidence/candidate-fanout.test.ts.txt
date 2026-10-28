import { expect, mock, test } from 'bun:test';
import { browserSocketEpoch } from '../../server/src/browser-socket';
mock.module('cloudflare:workers', () => ({ DurableObject: class { constructor(public ctx: unknown, public env: unknown) {} } }));
const { Factory } = await import('../../server/src/factory');

test('fan-out checks independent sessions concurrently, preserves frame order, and rechecks revocation', async () => {
  const counts = new Map<number, number>();
  const gates = new Map<number, (row: unknown) => void>();
  const revoked = new Set<number>();
  let signalStarted!: () => void;
  const bothStarted = new Promise<void>(resolve => { signalStarted = resolve; });
  const DB = { prepare(sql: string) {
    let args: unknown[] = [];
    const statement = { bind(...a: unknown[]) { args = a; return statement; }, async first() {
      if (sql.startsWith('SELECT u.id, u.login FROM sessions')) {
        const id = Number(args[1]);
        const count = (counts.get(id) ?? 0) + 1; counts.set(id, count);
        if (count === 1) return new Promise(resolve => {
          gates.set(id, resolve);
          if (gates.size === 2) signalStarted();
        });
        return revoked.has(id) ? null : { id, login: `player-${id}` };
      }
      if (sql.startsWith('SELECT enabled')) return { enabled: 1 };
      if (sql.startsWith('SELECT id FROM installations')) return { id: 1 };
      if (sql.startsWith('SELECT installation_id FROM')) return { installation_id: 1 };
      throw new Error(`Unexpected authorization query: ${sql}`);
    } };
    return statement;
  } };
  const env = { DB, SESSION_SECRET: 'unit-secret', APP_PASSWORD: 'unit-preview', ALLOWED_LOGINS: 'player-1,player-2',
    CACHE: { get: async () => ({ expiresAt: Date.now() + 60000 }) } };
  const epoch = await browserSocketEpoch(env);
  const received = new Map<number, number[]>([[1, []], [2, []]]);
  const closed: number[] = [];
  const sockets = [1, 1, 1, 2, 2, 2].map(id => ({
    deserializeAttachment: () => ({ repo: 'load-test/crowd', login: `player-${id}`, epoch, expiresAt: Date.now() + 60000,
      user: { id, login: `player-${id}`, sessionHash: String(id).repeat(64), expiresAt: Date.now() + 60000 } }),
    send: (text: string) => received.get(id)!.push(JSON.parse(text).patch.tick),
    close: () => closed.push(id),
  }));
  const factory = new Factory({ getWebSockets: () => sockets, waitUntil() {} } as never, env as never);
  const internal = factory as unknown as { meta: unknown; socketEpoch: string; broadcast(value: unknown): Promise<void> };
  internal.meta = { repo: 'load-test/crowd', installationId: 1 }; internal.socketEpoch = epoch;
  const first = internal.broadcast({ type: 'patch', patch: { tick: 1 } });
  const second = internal.broadcast({ type: 'patch', patch: { tick: 2 } });
  await bothStarted; // Original sequential loop cannot reach this with session 1 held.
  expect([...counts.values()]).toEqual([1, 1]);
  gates.get(2)!({ id: 2, login: 'player-2' });
  await Bun.sleep(0);
  expect(received.get(2)).toEqual([1, 1, 1]);
  expect(received.get(1)).toEqual([]);
  expect(counts.get(2)).toBe(1); // Frame 2 cannot overtake unfinished frame 1.
  revoked.add(1);
  gates.get(1)!({ id: 1, login: 'player-1' });
  await Promise.all([first, second]);
  expect(received.get(1)).toEqual([1, 1, 1]);
  expect(received.get(2)).toEqual([1, 1, 1, 2, 2, 2]);
  expect(closed).toEqual([1, 1, 1]);
  expect([...counts.values()]).toEqual([2, 2]); // One fresh check per session per frame.
});
