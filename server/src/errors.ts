/** Common application error base. Subclasses retain their existing instanceof contract. */
export class ShiptorioError extends Error {}

/** Unknown throws cross the observability boundary as one Error shape. */
export function asError(value: unknown): Error {
  return value instanceof Error ? value : new ShiptorioError(typeof value === 'string' ? value : 'Non-error rejection', { cause: value });
}
