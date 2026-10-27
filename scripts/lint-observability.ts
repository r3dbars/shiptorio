import ts from 'typescript';
import { readFileSync } from 'node:fs';

// Deliberately scoped: adopt the rejection-handler rule in the touched helpers
// without forcing unrelated fallback behavior or formatting changes elsewhere.
export const observabilityFiles = ['errors', 'redact', 'telemetry', 'reliability', 'rate-limit', 'budget', 'spark'].map(name => `server/src/${name}.ts`);
export function swallowedPromises(source: string): number[] {
  const file = ts.createSourceFile('helper.ts', source, ts.ScriptTarget.Latest, true);
  const lines: number[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text;
      const handler = node.arguments[method === 'catch' ? 0 : method === 'then' ? 1 : -1];
      if (handler && (ts.isArrowFunction(handler) || ts.isFunctionExpression(handler))) {
        const body = handler.body;
        if (ts.isBlock(body) && (body.statements.length === 0 || body.statements.every(s => ts.isReturnStatement(s) && !s.expression)) ||
          ts.isIdentifier(body) && body.text === 'undefined' || ts.isVoidExpression(body)) {
          lines.push(file.getLineAndCharacterOfPosition(handler.getStart(file)).line + 1);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return lines;
}
if (import.meta.main) {
  const failures = observabilityFiles.flatMap(path => swallowedPromises(readFileSync(path, 'utf8')).map(line => `${path}:${line}: Handle or report promise rejection; empty rejection handlers hide failures.`));
  for (const failure of failures) console.error(failure);
  if (failures.length) process.exitCode = 1;
}
