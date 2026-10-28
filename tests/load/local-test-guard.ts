/** Test-fixture boundary only. The real hosted CLI remains staging-only. */
export function localTestOrigin(value: string | undefined): string {
  if (!value) throw new Error('Local client fixture requires a loopback target');
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol) || !['127.0.0.1', '[::1]'].includes(url.hostname) || url.origin !== value)
    throw new Error('Local client fixture requires a loopback target');
  return url.origin;
}
