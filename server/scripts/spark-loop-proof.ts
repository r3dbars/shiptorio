import type { ReviewVerdict } from "../src/gauntlet";

/** Mentioning a threshold is not evidence that the reviewer rejected the broken doc. */
export function catchesShippingMismatch(verdict: ReviewVerdict): boolean {
  return verdict.verdict === "rework" && /more than|strictly|>\s*=?\s*(?:50|5000)\b|over \$?50|5000|exactly \$?50/i.test(`${verdict.reason} ${verdict.findings.join(" ")}`);
}

/** The legacy diff reviewer has no toolbox, so always supply the actual implementation. */
export async function shippingContext(read: (path: string) => Promise<string | null>) {
  const content = await read("src/cart.ts");
  if (!content?.trim()) throw new Error("Shipping review needs src/cart.ts from the Testing checkout");
  return [{ path: "src/cart.ts", content }];
}
