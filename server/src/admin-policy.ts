/** Administrator roles are explicit configuration; wildcards never grant them. */
export function configuredAdmin(env: {ADMIN_LOGINS?: string}, login: string | null | undefined): boolean {
  return !!login && (env.ADMIN_LOGINS ?? "").split(",").some(value => value.trim() !== "*" && value.trim().toLowerCase() === login.toLowerCase());
}
