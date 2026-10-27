/** Common application error base. Subclasses retain their existing instanceof contract. */
export class ShiptorioError extends Error {}

/** Unknown throws cross the observability boundary as one Error shape. */
export function asError(value: unknown): Error {
  return value instanceof Error ? value : new ShiptorioError(typeof value === 'string' ? value : 'Non-error rejection', { cause: value });
}

/** Rebuild the scrubbed Error graph before an SDK schedules asynchronous work. */
export function diagnosticError(value: unknown, scrub: (value: Error) => Error): Error {
  // The sanitizer produces plain records, including non-enumerable Error fields.
  const safe = scrub(asError(value));
  const rebuild = (record: unknown): unknown => {
    if (!record || typeof record !== 'object' || !('message' in record) || typeof record.message !== 'string') return record;
    const fields = record as Record<string, unknown>;
    const error = new ShiptorioError(record.message);
    Object.assign(error, fields);
    if ('cause' in fields) error.cause = rebuild(fields.cause);
    return error;
  };
  return rebuild(safe) as Error;
}
