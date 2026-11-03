import { expect, test } from "bun:test";
import { joinWaitlist, previewUnlock, WAITLIST_HOSTS } from "../src/deck2d/password";

test("the deck's password popup posts the server's gate form and reads its answer", async () => {
  const sent: { url: string; init?: RequestInit }[] = [];
  const answer = (response: Response) => previewUnlock((async (url: string, init?: RequestInit) => { sent.push({ url: String(url), init }); return response; }) as typeof fetch);
  expect(await answer(new Response(null, { status: 303, headers: { location: "/access?check=1&next=%2F" } }))("right")).toBe("ok");
  expect(sent[0].url).toBe("/access");
  expect(sent[0].init).toMatchObject({ method: "POST", redirect: "manual", credentials: "same-origin" });
  expect(String(sent[0].init!.body)).toBe("password=right&next=%2F");
  expect(await answer(new Response("gate", { status: 401 }))("wrong")).toBe("wrong");
  expect(await answer(new Response("{}", { status: 429 }))("x")).toBe("busy");
  expect(await answer(new Response("gate", { status: 403 }))("x")).toBe("error");
  expect(await previewUnlock((async () => { throw new Error("offline"); }) as typeof fetch)("x")).toBe("error");
});

test("on shiptorio.com the popup joins the waitlist (server/src/waitlist.ts) instead", async () => {
  const sent: { url: string; init?: RequestInit }[] = [];
  const join = (response: Response) => joinWaitlist((async (url: string, init?: RequestInit) => { sent.push({ url: String(url), init }); return response; }) as typeof fetch);
  expect(await join(Response.json({ ok: true }))("sam@b.co")).toBe("ok");
  expect(sent[0].url).toBe("/api/waitlist");
  expect(sent[0].init).toMatchObject({ method: "POST", credentials: "same-origin" });
  expect(JSON.parse(String(sent[0].init!.body))).toEqual({ email: "sam@b.co", website: "" });
  expect(await join(Response.json({ error: "bad" }, { status: 400 }))("x")).toBe("bad");
  expect(await join(Response.json({}, { status: 429 }))("x")).toBe("busy");
  expect(await join(new Response("gate", { status: 401 }))("x")).toBe("error");
  expect(await joinWaitlist((async () => { throw new Error("offline"); }) as typeof fetch)("x")).toBe("error");
  expect(WAITLIST_HOSTS.has("shiptorio.com") && !WAITLIST_HOSTS.has("shiptorio.dev")).toBe(true);
});
