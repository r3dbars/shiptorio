// GitHub logins cannot contain colons. Never conflate old login-only records with IDs.
export const accountIdentity = (id: number) => `github:user:${id}`;
export function identityAccountId(value: string): number | null {
  const match = /^github:user:([1-9]\d*)$/.exec(value);
  const id = match ? Number(match[1]) : NaN;
  return Number.isSafeInteger(id) ? id : null;
}
