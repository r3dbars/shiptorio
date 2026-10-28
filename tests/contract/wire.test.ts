import { describe, expect, it } from 'bun:test';
import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { FactoryState, Patch, ServerToWeb } from '../../shared/src';
import { assertWire } from './assert-wire';
import { applyPatch } from '../../web/src/store';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const variants = ServerToWeb.options.map(s => s.shape.type.value);
const state = FactoryState.parse({ repo: 'fixture/demo', baseBranch: 'main', districts: [], machines: [], items: [], belts: [], power: [], science: { red: 0, green: 0, grey: 0, blue: 0 }, trust: 0.5, tick: 0 });
const card = { id: 'move', title: 'Review', why: 'Ready', options: [{ id: 'yes', label: 'Approve' }], createdAt: 1 };
const fixtures = {
  snapshot: { type: 'snapshot', state }, patch: { type: 'patch', patch: { tick: 1 } },
  log: { type: 'log', level: 'info', text: 'hello', at: 1 }, move: { type: 'move', move: card },
  move_resolved: { type: 'move_resolved', moveId: 'move', actor: 'player' },
  deck: { type: 'deck', deck: [card] }, autonomy_unlocked: { type: 'autonomy_unlocked', level: 'advisor', text: 'Unlocked' },
};

describe('wire contract drift guards', () => {
  it('has a valid wire fixture for every server message, and rejects missing required fields', () => {
    expect(Object.keys(fixtures).sort()).toEqual([...variants].sort());
    for (const schema of ServerToWeb.options) {
      const fixture = fixtures[schema.shape.type.value as keyof typeof fixtures];
      const raw = JSON.parse(JSON.stringify(fixture));
      expect(ServerToWeb.safeParse(raw).success).toBe(true);
      for (const [key, field] of Object.entries(schema.shape)) {
        if (key === 'type' || field.isOptional()) continue;
        const invalid = { ...raw }; delete invalid[key];
        expect(ServerToWeb.safeParse(invalid).success, `${raw.type}.${key} must be required`).toBe(false);
      }
    }
  });

  it('fails on undeclared emitted fields, including nested payload drift', () => {
    for (const fixture of Object.values(fixtures)) expect(() => assertWire(fixture)).not.toThrow();
    expect(() => assertWire({ ...fixtures.log, newField: true })).toThrow('Undeclared wire field');
    expect(() => assertWire({ type: 'patch', patch: { newStateField: true } })).toThrow('message.patch.newStateField');
    expect(() => assertWire({ type: 'snapshot', state: { ...state, token: 'must-not-escape' } })).toThrow('message.state.token');
  });

  it('covers every Patch field in the actual web reducer (new fields fail closed)', () => {
    const source = ts.createSourceFile('store.ts', read('web/src/store.ts'), ts.ScriptTarget.Latest, true);
    const consumed = new Set<string>();
    const visit = (node: ts.Node) => {
      if (ts.isPropertyAccessExpression(node) && node.expression.getText(source) === 'p') consumed.add(node.name.text);
      ts.forEachChild(node, visit);
    };
    visit(source);
    expect([...consumed].sort()).toEqual(Object.keys(Patch.shape).sort());
    // Derive all replacement fields from schema defaults on a real state, with distinct values.
    const patch = { ...state, tick: 7, goal: 'Contract guard', trust: 0.8, bottleneck: null, districts: [], power: [] };
    const parsed = Patch.parse(patch);
    const next = applyPatch(state, parsed);
    for (const key of Object.keys(parsed)) expect<unknown>(next[key as keyof FactoryState]).toEqual(parsed[key as keyof typeof parsed]);
    expect(FactoryState.safeParse(next).success).toBe(true);
    const machine = { id: 'm', type: 'splitter' as const, x: 0, y: 0, tier: 1, state: 'idle' as const, module: 'low' };
    const withMachine = applyPatch(state, { machines: [machine] });
    expect(applyPatch(withMachine, { machines: [{ ...machine, x: 2 }] }).machines).toEqual([{ ...machine, x: 2 }]);
    expect(applyPatch(withMachine, { removed: [{ kind: 'machine', id: 'm' }] }).machines).toEqual([]);
  });

  it('executes every message through the real web handler, including resolution and log retention', () => {
    const source = ts.createSourceFile('store.ts', read('web/src/store.ts'), ts.ScriptTarget.Latest, true);
    let handler: ts.ArrowFunction | undefined;
    const visit = (node: ts.Node) => {
      if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'onMessage' && node.initializer && ts.isArrowFunction(node.initializer)) handler = node.initializer;
      ts.forEachChild(node, visit);
    };
    visit(source);
    expect(handler).toBeDefined();
    // Run the checked-in hook callback with React's setter contract, without a DOM or a parallel reducer.
    const js = ts.transpileModule(`const dispatch = ${handler!.getText(source)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
    let current: FactoryState | null = null;
    let log: any[] = [], unlock: any;
    const dispatch = new Function('setState', 'setLog', 'setUnlock', 'applyPatch', 'MAX_LOG', `${js}; return dispatch;`)(
      (value: any) => { current = typeof value === 'function' ? value(current) : value; },
      (update: any) => { log = update(log); }, (value: any) => { unlock = value; }, applyPatch, 80,
    );
    const send = (value: unknown) => dispatch(ServerToWeb.parse(value));
    send(fixtures.snapshot);
    expect<unknown>(current).toEqual(state);
    send(fixtures.patch);
    expect((current as unknown as FactoryState).tick).toBe(1);
    send(fixtures.move);
    expect((current as unknown as FactoryState).move?.id).toBe('move');
    send(fixtures.deck);
    expect((current as unknown as FactoryState).deck).toHaveLength(1);
    send(fixtures.move_resolved);
    expect((current as unknown as FactoryState).move).toBeNull();
    expect((current as unknown as FactoryState).deck).toEqual([]);
    send(fixtures.autonomy_unlocked);
    expect(unlock.text).toBe('Unlocked');
    expect(log.at(-1).level).toBe('success');
    for (let i = 0; i < 81; i++) send({ ...fixtures.log, text: String(i) });
    expect(log).toHaveLength(80);
    expect(log[0].text).toBe('1');
    expect(log.at(-1).text).toBe('80');
  });

  it('accounts for every production browser-message emitter', () => {
    const source = ts.createSourceFile('factory.ts', read('server/src/factory.ts'), ts.ScriptTarget.Latest, true);
    const emitted = new Set<string>();
    const visit = (node: ts.Node) => {
      if (ts.isObjectLiteralExpression(node)) {
        const tag = node.properties.find(p => ts.isPropertyAssignment(p) && p.name.getText(source) === 'type');
        if (tag && ts.isPropertyAssignment(tag) && ts.isStringLiteral(tag.initializer) && variants.includes(tag.initializer.text as typeof variants[number])) emitted.add(tag.initializer.text);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    expect([...emitted].sort()).toEqual([...variants].sort());
    // broadcast's typed argument plus workspace typecheck guards payload fields at all call sites.
    expect(source.text).toContain('private broadcast(msg: ServerToWeb)');
    expect(read('web/src/source/live.ts')).toContain('parseLiveMessage(value)');
    expect(read('web/src/source/schemas.ts')).toContain('ServerToWeb.parse(value)');
  });

  it('requires a web message branch for every variant and keeps the fallback reserved for log', () => {
    const code = read('web/src/store.ts');
    const source = ts.createSourceFile('store.ts', code, ts.ScriptTarget.Latest, true);
    const handled = new Set<string>();
    const visit = (node: ts.Node) => {
      if (ts.isBinaryExpression(node) && node.left.getText(source) === 'msg.type' && node.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken && ts.isStringLiteral(node.right)) handled.add(node.right.text);
      ts.forEachChild(node, visit);
    };
    visit(source);
    // The final else appends log lines; TypeScript also narrows this remainder to LogLine.
    expect(code).toContain('const { type: _, ...line } = msg;');
    expect([...handled].sort()).toEqual(variants.filter(v => v !== 'log').sort());
  });
});
