// Every player-facing string in web/src, pulled out of the TypeScript AST: JSX text plus string literals that
// read like words (not class names, ids, keys, urls or comparisons). The copy test uses it to keep "Spark" out
// of player copy; run it to see the whole inventory:
//
//   bun web/scripts/copy-strings.ts            # markdown table: file, line, text
//   bun web/scripts/copy-strings.ts --json     # same, as JSON (diff two runs to see what changed)

import ts from "typescript";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export interface Found {
  file: string; // relative to web/src
  line: number;
  text: string;
}

const SRC = join(import.meta.dir, "../src");
// Code-only folders: the map renderer, sound engine and art lab never put words on screen.
const SKIP_DIRS = new Set(["map", "sound", "lab"]);
// Attributes that hold code, not words.
const CODE_ATTRS = new Set(["className", "key", "href", "type", "role", "style", "id", "name", "rel", "target", "src", "viewBox", "shapeRendering", "value", "autoComplete", "inputMode", "method"]);

export function sourceFiles(dir = SRC): string[] {
  const out: string[] = [];
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) {
      if (!SKIP_DIRS.has(f)) out.push(...sourceFiles(p));
    } else if (/\.(ts|tsx)$/.test(f) && !f.endsWith(".d.ts")) out.push(p);
  }
  return out.sort();
}

// Does a literal read like words a player sees? Needs a letter, and a space or a capital or end punctuation.
const wordy = (s: string) => /[A-Za-z]/.test(s) && (/\s/.test(s.trim()) || /^[A-Z]/.test(s.trim()) || /[.!?…]$/.test(s.trim())) && !/^[\w.-]+\/[\w./-]*$/.test(s) && !/^(https?:|\/|\?|#|[a-z]+:)/.test(s);

function isCodeContext(node: ts.Node): boolean {
  let p = node.parent;
  // look through `{cond ? "a" : "b"}` and `{...}` to the attribute that holds it
  while (p && (ts.isJsxExpression(p) || ts.isParenthesizedExpression(p) || ts.isConditionalExpression(p) || (ts.isBinaryExpression(p) && [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(p.operatorToken.kind)))) {
    if (ts.isConditionalExpression(p) && p.condition === node) return true;
    node = p;
    p = p.parent;
  }
  if (!p) return false;
  if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isExternalModuleReference(p)) return true;
  if (ts.isJsxAttribute(p) && CODE_ATTRS.has(p.name.getText())) return true;
  if (ts.isBinaryExpression(p) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken].includes(p.operatorToken.kind)) return true;
  if (ts.isCaseClause(p) || ts.isElementAccessExpression(p) || ts.isLiteralTypeNode(p)) return true;
  if (ts.isPropertyAssignment(p) && (p.name === node || /^(method|tone|harness|className)$/.test(p.name.getText()))) return true; // keys and code-valued fields
  if (ts.isThrowStatement(p) || ts.isNewExpression(p)) return true; // internal errors, never shown
  if (ts.isCallExpression(p)) {
    const callee = p.expression.getText();
    // storage keys, events, selectors, DOM and sound names
    if (/(localStorage|sessionStorage)\.|addEventListener|removeEventListener|querySelector|classList|matchMedia|savePref|sound\.play|fetch|getItem|setItem|includes|startsWith|endsWith|split|replace|test|match|get$|has$|toggleSheet|setSheet|setWorld|send$/.test(callee)) return true;
  }
  return false;
}

export function extract(file: string): Found[] {
  const text = readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const rel = relative(SRC, file);
  const out: Found[] = [];
  const add = (node: ts.Node, s: string) => {
    const t = s.replace(/\s+/g, " ").trim();
    if (!t) return;
    out.push({ file: rel, line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1, text: t });
  };
  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node)) {
      if (/[A-Za-z]/.test(node.text)) add(node, node.text);
    } else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (wordy(node.text) && !isCodeContext(node)) add(node, node.text);
    } else if (ts.isTemplateExpression(node)) {
      // `Ship #${n}`: keep the words, mark the holes
      const s = node.head.text + node.templateSpans.map((sp) => "{…}" + sp.literal.text).join("");
      if (wordy(s.replace(/\{…\}/g, " ")) && !isCodeContext(node)) add(node, s);
      return; // don't descend into the holes' own literals twice
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

export function inventory(): Found[] {
  return sourceFiles().flatMap(extract);
}

if (import.meta.main) {
  const all = inventory();
  if (process.argv.includes("--json")) console.log(JSON.stringify(all, null, 1));
  else {
    console.log(`| File | Line | Text |\n| --- | --- | --- |`);
    for (const f of all) console.log(`| ${f.file} | ${f.line} | ${f.text.replace(/\|/g, "\\|")} |`);
    console.error(`${all.length} strings in ${new Set(all.map((f) => f.file)).size} files`);
  }
}
