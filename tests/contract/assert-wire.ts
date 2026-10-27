import type { ServerToWeb } from '../../shared/src';
import { parseLiveMessage } from '../../web/src/source/schemas';

// Production deliberately strips undeclared fields. Tests fail on them so emitting
// a new field requires an explicit shared contract, even when parsing would succeed.
export function assertWire(raw: unknown): ServerToWeb {
  const parsed = parseLiveMessage(raw);
  const visit = (input: unknown, output: unknown, path: string) => {
    if (!input || typeof input !== 'object') return;
    for (const key of Object.keys(input)) {
      if (!output || typeof output !== 'object' || !Object.hasOwn(output, key)) throw new Error(`Undeclared wire field: ${path}.${key}`);
      visit((input as Record<string, unknown>)[key], (output as Record<string, unknown>)[key], `${path}.${key}`);
    }
  };
  visit(raw, parsed, 'message');
  return parsed;
}
