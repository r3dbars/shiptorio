import { expect, test } from "bun:test";
import { catchesShippingMismatch, shippingContext } from "../scripts/spark-loop-proof";

test("shipping proof fails when review approves the known-broken threshold", () => {
  expect(catchesShippingMismatch({ verdict: "pass", reason: "Code uses >= 5000 and docs match", findings: [] })).toBe(false);
  expect(catchesShippingMismatch({ verdict: "pass", reason: "Exactly $50 ships free", findings: ["Uses > 5000"] })).toBe(false);
  expect(catchesShippingMismatch({ verdict: "rework", reason: "Unrelated style problem", findings: [] })).toBe(false);
  expect(catchesShippingMismatch({ verdict: "rework", reason: "Code uses > 5000, so exactly $50 still pays shipping", findings: ["docs/SHIPPING.md contradicts src/cart.ts"] })).toBe(true);
});

test("shipping review receives real cart source without depending on toolbox support", async () => {
  const calls: string[] = [];
  const source = "export const shipping = (subtotal: number) => subtotal > 5000 ? 0 : 599;";
  expect(await shippingContext(async path => { calls.push(path); return source; })).toEqual([{ path: "src/cart.ts", content: source }]);
  expect(calls).toEqual(["src/cart.ts"]);
  await expect(shippingContext(async () => null)).rejects.toThrow("needs src/cart.ts");
  await expect(shippingContext(async () => "  ")).rejects.toThrow("needs src/cart.ts");
});
