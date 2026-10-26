import { describe, expect, it } from 'bun:test';
import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { FactoryState, Patch, ServerToWeb } from '../../shared/src';
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
