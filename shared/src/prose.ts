/** Filename policy for documentation privileges. MDX and code in docs directories need code checks. */
export function isProsePath(path: string): boolean {
  return !/[\\\x00-\x1f\x7f]/.test(path)
    && path.split("/").every(part => part !== "" && part !== "." && part !== "..")
    && /\.(md|txt)$/i.test(path);
}
