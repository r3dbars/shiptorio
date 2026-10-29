import { expect, test } from "bun:test";
import { previewUnlock } from "../src/deck2d/password";

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
