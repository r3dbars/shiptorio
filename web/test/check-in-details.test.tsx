import { afterAll, beforeAll, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { longPlan } from "./fixtures/long-plan-data";

const keys = ["window", "document", "navigator", "HTMLElement", "Element", "Node", "Event", "MouseEvent", "IS_REACT_ACT_ENVIRONMENT"] as const;
const saved = new Map<string, PropertyDescriptor | undefined>();
let win: Window;
beforeAll(() => {
  win = new Window({ url: "http://localhost/" });
  for (const key of keys) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true,
      value: key === "IS_REACT_ACT_ENVIRONMENT" ? true : (win as unknown as Record<string, unknown>)[key] });
  }
});
afterAll(async () => {
  for (const key of keys) {
    const previous = saved.get(key);
    if (previous) Object.defineProperty(globalThis, key, previous);
    else delete (globalThis as Record<string, unknown>)[key];
  }
  await win.happyDOM.close();
});

test("long Details preserves every review paragraph and sends only the explicitly chosen option once", async () => {
  const { act } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { CheckIn } = await import("../src/ui/CheckIn");
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const sent: unknown[] = [];
  try {
    await act(() => root.render(<CheckIn deck={[longPlan]} calm send={(msg) => sent.push(msg)} onFocus={() => {}} onClose={() => {}} />));
    await act(() => (host.querySelector(".ci-act.more") as HTMLButtonElement).click());
    const dialog = host.querySelector(".ci-details")!;
    const review = dialog.querySelector(".ci-review")!;
    const footer = dialog.querySelector(".ci-options")!;
    expect([...review.querySelectorAll("li")].map((li) => li.textContent)).toEqual(longPlan.plan!);
    expect(review.querySelector("a")?.getAttribute("href")).toBe(longPlan.url!);
    expect(review.contains(footer)).toBe(false);
    expect(review.getAttribute("tabindex")).toBe("0");
    expect(review.getAttribute("aria-label")).toBe("Plan details");
    expect(dialog.querySelector(".ci-details-head .ci-title")?.textContent).toBe(longPlan.title);
    expect(sent).toEqual([]); // opening and reading never approves
    const choices = [...footer.querySelectorAll<HTMLButtonElement>("button")];
    expect(choices.map((button) => button.textContent?.trim())).toEqual(["★ Approve plan", "Revise plan"]);
    await act(() => { choices[0].click(); choices[0].click(); });
    await act(() => new Promise((resolve) => setTimeout(resolve, 300)));
    expect(sent).toEqual([{ type: "choose_move", moveId: longPlan.id, optionId: "approve" }]);
  } finally {
    await act(() => root.unmount());
    host.remove();
  }
});
