/** Escape the escape character first, so an existing slash cannot reopen a table cell. */
export const escapeMarkdownCell = (value: string) =>
  value.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\s+/g, " ");
