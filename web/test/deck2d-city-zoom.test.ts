import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Window } from "happy-dom";
import { CITY_COPY, CITY_ISLANDS, createBus, type ArtLoader, type CardView, type CityIsland, type CityView, type DeckEvent, type DeckSource, type DeckView } from "../src/deck2d/contract";
import { cityLabel, createCity, manualCity, nextZoom, parseCityShot, zoomLabel } from "../src/deck2d/city";
import { LABEL_CSS, cityCamera } from "../src/deck2d/city/camera";
import { cardAt, createLabels, type LabelPlaces } from "../src/deck2d/city/labels";
import { ringLayout } from "../src/deck2d/city/layout";
import { fallbackManifest } from "../src/deck2d/city/manifest";
import { dressSignIn, storyBeforeSignIn, zoomHidden } from "../src/deck2d/main";
import { STORY_CARD, createStory } from "../src/deck2d/story";
import { REVEAL_SECONDS } from "../src/deck2d/story/reveal";

// The three-step Zoom button, what the manual city shows, the labels and plates, and the sign-in card that ends the
// reveal (web/src/deck2d/city/SPEC.md sections 1, 3 and 6).

const keys = ["window", "document", "navigator", "HTMLElement", "Element", "Node", "Event"] as const;
const saved = new Map<string, PropertyDescriptor | undefined>();
let win: Window;
beforeAll(() => {
  win = new Window({ url: "http://localhost/deck.html" });
  for (const k of keys) { saved.set(k, Object.getOwnPropertyDescriptor(globalThis, k)); Object.defineProperty(globalThis, k, { configurable: true, writable: true, value: (win as unknown as Record<string, unknown>)[k] }); }
});
afterAll(async () => {
  for (const k of keys) { const d = saved.get(k); if (d) Object.defineProperty(globalThis, k, d); else delete (globalThis as Record<string, unknown>)[k]; }
  await win.happyDOM.close();
});

const per = <T,>(v: T) => Object.fromEntries(CITY_ISLANDS.map((i) => [i, v])) as Record<CityIsland, T>;

describe("the Zoom button cycles three steps", () => {
  test("station -> line -> city -> station, and a name that matches the text: Zoom out, Zoom out, Zoom in", () => {
    expect(nextZoom("station")).toBe("line");
    expect(nextZoom("line")).toBe("city");
    expect(nextZoom("city")).toBe("station");
    expect(zoomLabel("station")).toBe("Zoom out");
    expect(zoomLabel("line")).toBe("Zoom out");
    expect(zoomLabel("city")).toBe("Zoom in");
    let z = nextZoom("station");
    const seen = [z];
    for (let i = 0; i < 5; i++) { z = nextZoom(z); seen.push(z); }
    expect(seen).toEqual(["line", "city", "station", "line", "city", "station"]);
  });

  test("without the pixel canvas (?px=0) there is no city, so it is station <-> line", () => {
    expect(nextZoom("station", false)).toBe("line");
    expect(nextZoom("line", false)).toBe("station");
    expect(nextZoom("city", false)).toBe("station");
  });
});

describe("the Zoom button steps aside for the whole reveal (zoomHidden)", () => {
  const DT = 0.05;
  const connection = (): CardView => ({ id: "connection-1-0-repos", stop: "repo", title: "x", line: "y", dots: null });

  test("hidden from reveal t = 0 (the rocket, when the story's view has no city yet) through the sign-in card, shown again after Replay", () => {
    const story = createStory({ seed: 3 });
    let connectionCard: CardView | null = null; // the sign-in card main.ts shows in place of the story's last card
    const wrapped = storyBeforeSignIn(story, { open() { connectionCard = connection(); }, card: () => connectionCard });
    /** What one frame of main.ts decides: the card on screen is the connection card, else the story's own. */
    const frame = () => {
      const v = wrapped.view();
      return { v, hidden: zoomHidden({ card: connectionCard ?? v.card }, v.city, story, null), hiddenBefore: !!(connectionCard ?? v.card) || !!v.city?.beat };
    };

    // before the reveal the button shows, except while a story card asks its question
    let asked = 0;
    for (let i = 0; i < 6000 && story.phase() !== "reveal"; i++) {
      story.step!(DT);
      const { v, hidden } = frame();
      if (story.phase() === "reveal") break;
      expect(hidden, `tick ${i}`).toBe(!!v.card);
      if (v.card?.id.startsWith(STORY_CARD.call)) { asked++; wrapped.approve(v.card.id); }
    }
    expect(asked).toBe(3);
    expect(story.phase()).toBe("reveal");

    // reveal t = 0: no card, and no city in the view yet (station zoom, the engine's rocket camera), but the button is already gone
    const first = frame();
    expect(first.v.city).toBeUndefined();
    expect(first.v.card).toBeNull();
    expect(first.hiddenBefore).toBe(false); // the old rule (a card or a city beat) would have shown it over the rocket
    expect(first.hidden).toBe(true);

    // every tick through the beats and the card: hidden
    let sawBeat = 0, sawCard = false;
    for (let i = 0; i < 1000 && !connectionCard; i++) {
      story.step!(DT);
      const { v, hidden } = frame();
      expect(hidden, `reveal tick ${i}`).toBe(true);
      if (v.city?.beat) sawBeat++;
    }
    expect(sawBeat).toBeGreaterThan(500); // 25 s or so of beats with the button away
    expect(story.phase()).toBe("end");
    for (let i = 0; i < 40; i++) { story.step!(DT); const { hidden } = frame(); expect(hidden).toBe(true); sawCard = true; } // under the card
    expect(sawCard).toBe(true);
    expect(connectionCard).not.toBeNull();

    // Replay (the sign-in card's Close): the story starts over and the button is back
    connectionCard = null;
    const again = frame();
    expect(story.phase()).toBe("build");
    expect(again.hidden).toBe(false);
    for (let i = 0; i < 20; i++) { story.step!(DT); expect(frame().hidden).toBe(false); }
  });

  test("the other reasons to step aside stay: a card asking, Shippy's tour talking; the manual city and the line keep the button", () => {
    const none = { card: null };
    expect(zoomHidden(none, undefined, null, null)).toBe(false); // station, no story
    expect(zoomHidden(none, undefined, { phase: () => "build" }, null)).toBe(false);
    expect(zoomHidden(none, undefined, { phase: () => "automatic" }, null)).toBe(false);
    expect(zoomHidden(none, undefined, { phase: () => "reveal" }, null)).toBe(true);
    expect(zoomHidden(none, undefined, { phase: () => "end" }, null)).toBe(true);
    expect(zoomHidden(none, manualCity("city"), null, null)).toBe(false); // the manual city has no beat: Zoom in must stay
    expect(zoomHidden(none, manualCity("line"), null, null)).toBe(false);
    expect(zoomHidden(none, { ...manualCity("city"), beat: "islands" }, null, null)).toBe(true);
    expect(zoomHidden({ card: connection() }, undefined, null, null)).toBe(true);
    expect(zoomHidden(none, undefined, null, { playing: () => true })).toBe(true);
    expect(zoomHidden(none, undefined, null, { playing: () => false })).toBe(false);
  });

  test("main.ts keeps a handle on the story run, wherever it plays, and paints the button from zoomHidden", () => {
    const main = readFileSync(join(import.meta.dir, "../src/deck2d/main.ts"), "utf8");
    expect(main).toContain("let storyRun: { phase(): string } | null = null;");
    expect(main).toMatch(/\n\s+storyRun = run;\n/);
    expect(main).toContain("paintZoom(zoomHidden(view, storyCity, storyRun, firstRun));");
    // a player who zoomed out by hand before the rocket gets the rocket's own camera, not the manual city, from reveal t = 0
    expect(main).toContain('if (storyCity || storyRun?.phase() === "reveal") manual = "station";');
  });
});

describe("the manual city (the Zoom button's own picture)", () => {
  test("line: the line only, every island dark, no plates; city: the end of beat 5 (all dark, COMING SOON plates on)", () => {
    expect(manualCity("line", "you/repo")).toEqual({ zoom: "line", lit: per(0), plates: per(false), focus: null, label: "you/repo" });
    expect(manualCity("city", "you/repo")).toEqual({ zoom: "city", lit: per(0), plates: per(true), focus: null, label: "you/repo" });
    expect(manualCity("city").label).toBe(CITY_COPY.repo);
    expect("beat" in manualCity("city")).toBe(false); // no beat: this is not the story
  });

  test("the line's label is owner/name from ?repo= when it is a real repo, else \"your repo\"", () => {
    expect(cityLabel("?source=live&repo=r3dbars/Testing")).toBe("r3dbars/Testing");
    expect(cityLabel("?repo=a.b-c_d/e.f")).toBe("a.b-c_d/e.f");
    for (const search of ["", "?source=story", "?repo=", "?repo=solo", "?repo=a/b/c", "?repo=../x", "?repo=x/..", "?repo=a b/c", "?repo=<b>/x", "?repo=a/b%20c"]) expect(cityLabel(search)).toBe(CITY_COPY.repo);
  });

  test("?shot=city and ?shot=city-<island> preview the city; any other shot is not ours", () => {
    expect(parseCityShot("city")).toEqual(manualCity("city"));
    for (const id of CITY_ISLANDS) expect(parseCityShot(`city-${id}`)).toEqual({ ...manualCity("city"), focus: id });
    expect(parseCityShot("city-errors", "a/b")?.label).toBe("a/b");
    for (const other of [null, "", "line", "builder", "shippy", "boiler", "city-", "city-nope", "citys", "Errors"]) expect(parseCityShot(other)).toBeNull();
  });
});

describe("the sign-in card that ends the reveal (dressSignIn)", () => {
  const signIn: CardView = { id: "connection-1-0-repos", stop: "repo", title: "Sign in to your factory", line: "Sign in with GitHub so Shippy can see your repos. No coding starts yet.", yes: "Sign in", no: "Close", dots: null };
  const ending: CardView = { id: "story-connect", stop: "repo", title: CITY_COPY.card.title, line: CITY_COPY.card.line, yes: CITY_COPY.card.yes, no: CITY_COPY.card.no, setup: true, dots: null };
  const beat = (b: CityView["beat"]): CityView => ({ ...manualCity("city"), beat: b });

  test("on the last beat the sign-in card says the story's words, is a setup card, and keeps its id so Yes still signs in", () => {
    const dressed = dressSignIn(signIn, ending, beat("card"))!;
    expect(dressed).toMatchObject({ id: signIn.id, title: "Start with your repo.", line: "GitHub first. The rest lights up later.", yes: "Sign in with GitHub", no: "Replay", setup: true, stop: "repo" });
    expect(signIn.title).toBe("Sign in to your factory"); // the original is untouched
  });

  test("while it waits for /api/me (yes \"Please wait…\", titled \"Finding your repositories…\") it is dressed too, so the card never shows other words or changes height", () => {
    const busy: CardView = { ...signIn, title: "Finding your repositories…", line: "This should only take a moment.", yes: "Please wait…" };
    const waiting = dressSignIn(busy, ending, beat("card"))!;
    expect(waiting).toMatchObject({ id: busy.id, title: "Start with your repo.", line: "GitHub first. The rest lights up later.", yes: "Sign in with GitHub", no: "Replay", setup: true, stop: "repo" });
    expect(JSON.stringify(waiting)).not.toMatch(/Finding|Please wait|moment/);
    // the same card, word for word, before and after the answer arrives: nothing for the card to re-lay out
    expect(waiting).toEqual(dressSignIn(signIn, ending, beat("card")));
    expect(busy.title).toBe("Finding your repositories…"); // the original is untouched
    // the other waits of the connection card (opening the one repo found, loading issues) say "Please wait…" too
    const opening: CardView = { ...signIn, title: "Opening you/repo…", line: "Shippy reads its issues and opens PRs here.", yes: "Please wait…" };
    expect(dressSignIn(opening, ending, beat("card"))).toEqual(waiting);
  });

  test("any other beat, no city, no ending card, no card, or a card that is not the sign-in one: left exactly as it was", () => {
    const busy: CardView = { ...signIn, title: "Finding your repositories…", line: "This should only take a moment.", yes: "Please wait…" };
    for (const b of ["line", "city", "islands", "grow", "dim", undefined] as const) { expect(dressSignIn(signIn, ending, beat(b))).toBe(signIn); expect(dressSignIn(busy, ending, beat(b))).toBe(busy); }
    expect(dressSignIn(signIn, ending, undefined)).toBe(signIn);
    expect(dressSignIn(busy, ending, undefined)).toBe(busy);
    expect(dressSignIn(signIn, null, beat("card"))).toBe(signIn);
    expect(dressSignIn(busy, null, beat("card"))).toBe(busy);
    expect(dressSignIn(null, ending, beat("card"))).toBeNull();
    const other = { ...signIn, id: "story-call-1" };
    expect(dressSignIn(other, ending, beat("card"))).toBe(other);
    const otherBusy = { ...busy, id: "story-call-1" }; // "Please wait…" alone is not enough: it has to be the connection card
    expect(dressSignIn(otherBusy, ending, beat("card"))).toBe(otherBusy);
    // the connection card's other questions are not the sign-in step and stay as they are
    for (const yes of ["Try again", "Use this repo", "More repos", "Connect GitHub", "Refresh", "Plan", "Copy setup"]) {
      const c: CardView = { ...signIn, yes };
      expect(dressSignIn(c, ending, beat("card")), yes).toBe(c);
    }
  });
});

describe("storyBeforeSignIn lends the story's last card to the sign-in card", () => {
  function fake() {
    let card: CardView | null = null, city: CityView | undefined;
    const later: string[] = [];
    const story: DeckSource = { view: () => ({ stops: [], jam: null, card, shippy: { pose: "idle", at: "repo" }, shipped: 0, caption: null, city } as DeckView), approve() {}, later(id) { later.push(id); card = null; city = undefined; } };
    return { story, later, show(c: CardView | null, beat?: CityView["beat"]) { card = c; city = beat ? { ...manualCity("city"), beat } : undefined; } };
  }
  const last: CardView = { id: "story-connect", stop: "repo", title: CITY_COPY.card.title, line: CITY_COPY.card.line, yes: CITY_COPY.card.yes, no: CITY_COPY.card.no, setup: true, dots: null };

  test("ending() is null until the story reaches its last card, then that card while the connection card stands in for it", () => {
    const f = fake();
    let open = 0, connectionCard: CardView | null = null;
    const wrapped = storyBeforeSignIn(f.story, { open() { open++; connectionCard = { id: "connection-1-0-repos", stop: "repo", title: "x", line: "y", dots: null }; }, card: () => connectionCard });
    expect(wrapped.ending()).toBeNull();
    wrapped.view();
    expect(wrapped.ending()).toBeNull();
    f.show(last, "card");
    const v = wrapped.view();
    expect(v.card).toBeNull(); // the story's own card is swallowed: the connection card shows instead
    expect(open).toBe(1);
    expect(wrapped.ending()).toEqual(last);
    wrapped.view(); wrapped.view();
    expect(open).toBe(1); // opened once
    expect(wrapped.ending()).toEqual(last);
  });

  test("closing the connection card (Replay) replays the story: ending() clears and the story is told", () => {
    const f = fake();
    let connectionCard: CardView | null = null;
    const wrapped = storyBeforeSignIn(f.story, { open() { connectionCard = { id: "connection-1-0-repos", stop: "repo", title: "x", line: "y", dots: null }; }, card: () => connectionCard });
    f.show(last, "card");
    wrapped.view();
    expect(wrapped.ending()).not.toBeNull();
    connectionCard = null; // the player pressed Replay
    wrapped.view();
    expect(f.later).toEqual(["story-connect"]);
    expect(wrapped.ending()).toBeNull();
  });
});

describe("the labels and plates (DOM, caption font)", () => {
  const places = (): LabelPlaces => ({ errors: { x: 100, y: 200 }, traffic: { x: 120.4, y: 300.6 }, inbox: { x: 600, y: 500 }, customers: { x: 900, y: 450 }, marketing: { x: 800, y: 150 }, line: { x: 640, y: 330 } });
  const view = (over: Partial<CityView> = {}): CityView => ({ ...manualCity("city", "you/repo"), ...over });

  test("six labels in a hidden-from-readers container, each with the words from the contract; the line carries the repo", () => {
    const host = document.createElement("div"); document.body.append(host);
    const labels = createLabels(host);
    const root = host.querySelector(".city-labels") as HTMLElement;
    expect(root.getAttribute("aria-hidden")).toBe("true");
    expect(root.hidden).toBe(true); // hidden until the city shows
    labels.place(view(), places(), per(false));
    expect(root.hidden).toBe(false);
    const texts = [...host.querySelectorAll(".city-label")].map((el) => el.textContent);
    expect(texts).toEqual(["Errors", "Traffic", "Inbox", "Customers", "Marketing", "you/repo"]);
    expect(host.querySelectorAll(".city-label").length).toBe(6);
    expect(host.querySelector(".city-label.line")?.textContent).toBe("you/repo");
    labels.place(undefined, null, per(false));
    expect(root.hidden).toBe(true);
    labels.destroy();
    expect(host.querySelector(".city-labels")).toBeNull();
    host.remove();
  });

  test("a COMING SOON plate shows under an island's label exactly when the view says so; a lit island's label brightens", () => {
    const host = document.createElement("div"); document.body.append(host);
    const labels = createLabels(host);
    const plateOf = (id: string) => host.querySelector(`.city-tag[data-island="${id}"] .city-plate`) as HTMLElement;
    labels.place(view({ plates: per(false) }), places(), per(false));
    for (const id of CITY_ISLANDS) expect(plateOf(id).hidden).toBe(true);
    labels.place(view({ plates: { ...per(false), inbox: true } }), places(), { ...per(false), errors: true });
    for (const id of CITY_ISLANDS) expect(plateOf(id).hidden).toBe(id !== "inbox");
    expect(plateOf("inbox").textContent).toBe("Coming soon");
    expect(host.querySelector('.city-tag[data-island="errors"] .city-label')?.classList.contains("lit")).toBe(true);
    expect(host.querySelector('.city-tag[data-island="traffic"] .city-label')?.classList.contains("lit")).toBe(false);
    expect(host.querySelector('.city-tag[data-island="line"] .city-plate')).toBeNull(); // the line is not coming soon
    labels.place(view({ plates: per(true) }), places(), per(false));
    for (const id of CITY_ISLANDS) expect(plateOf(id).hidden).toBe(false);
    labels.destroy(); host.remove();
  });

  test("a tag hides (as a step) when it is not wholly on screen above the caption band, or when the sign-in card covers it", () => {
    win.happyDOM.setViewport({ width: 1280, height: 720 }); // landscape: band 96, edge 8, so a tag's bottom must be <= 616
    const host = document.createElement("div"); document.body.append(host);
    const labels = createLabels(host);
    const tag = (id: string) => host.querySelector(`.city-tag[data-island="${id}"]`) as HTMLElement;
    labels.place(view(), places(), per(false));
    for (const id of [...CITY_ISLANDS, "line"]) expect(tag(id).style.visibility).toBe("");
    labels.place(view(), { ...places(), line: { x: 640, y: 690 }, errors: { x: 2, y: 200 }, marketing: { x: 800, y: 4 } }, per(false));
    expect(tag("line").style.visibility).toBe("hidden"); // under the caption band
    expect(tag("errors").style.visibility).toBe("hidden"); // past the left edge
    expect(tag("marketing").style.visibility).toBe("hidden"); // past the top edge
    expect(tag("inbox").style.visibility).toBe("");
    const card = document.createElement("div"); card.className = "ic-card"; document.body.append(card);
    card.getBoundingClientRect = () => ({ left: 500, right: 780, top: 480, bottom: 700, width: 280, height: 220, x: 500, y: 480, toJSON() {} }) as DOMRect;
    labels.place(view(), places(), per(false));
    expect(tag("inbox").style.visibility).toBe("hidden"); // (600, 500) is under the card
    expect(tag("line").style.visibility).toBe(""); // back on screen: shows again
    card.remove();
    labels.place(view(), places(), per(false));
    expect(tag("inbox").style.visibility).toBe("");
    labels.destroy(); host.remove();
    win.happyDOM.setViewport({ width: 1024, height: 768 });
  });

  test("the island the story is showing right now gets the class 'now' when its caption comes up (the camera has arrived and its light step has begun), and loses it again as a step", () => {
    const host = document.createElement("div"); document.body.append(host);
    const labels = createLabels(host);
    const now = () => [...host.querySelectorAll(".city-label")].filter((el) => el.classList.contains("now")).map((el) => el.textContent);
    const islands = (focus: CityIsland | null, lit: Partial<Record<CityIsland, number>> = {}): CityView => view({ beat: "islands", focus, lit: { ...per(0), ...lit } });
    labels.place(islands("errors"), places(), per(false));
    expect(now()).toEqual([]); // its turn has begun but the camera is still on its way: the caption is still the one before, and so is the label
    labels.place(islands("errors", { errors: 0.01 }), places(), per(false));
    expect(now()).toEqual(["Errors"]); // the camera is there and its light step has begun: the caption and the label switch together
    labels.place(islands("errors", { errors: 1 }), places(), { ...per(false), errors: true });
    expect(now()).toEqual(["Errors"]); // and still, once it is lit
    labels.place(islands("traffic", { errors: 1 }), places(), { ...per(false), errors: true });
    expect(now()).toEqual([]); // the next turn: the camera is moving, Errors is just lit, its caption has not changed yet
    labels.place(islands("traffic", { errors: 1, traffic: 0.2 }), places(), { ...per(false), errors: true });
    expect(now()).toEqual(["Traffic"]); // lit progress > 0 is the moment the camera arrives: it moves on, Errors is just lit now
    labels.place(islands(null, per(1)), places(), per(true)); // the camera heads back to the ring
    expect(now()).toEqual([]);
    labels.place(view({ beat: "grow", focus: null, lit: per(1) }), places(), per(true));
    expect(now()).toEqual([]);
    labels.place(view({ focus: "inbox" }), places(), per(false)); // a ?shot=city-inbox preview: no beat, so nothing is "now"
    expect(now()).toEqual([]);
    labels.place(islands("inbox", { inbox: 0.5 }), places(), per(false));
    expect(now()).toEqual(["Inbox"]);
    labels.place(undefined, null, per(false)); // hidden: the class is left as it was, and re-synced when the labels come back
    labels.place(view({ beat: "dim", lit: per(0) }), places(), per(false));
    expect(now()).toEqual([]);
    expect(host.querySelector(".city-label.line")?.classList.contains("now")).toBe(false); // the line's label has its own colour
    labels.destroy(); host.remove();
  });

  test("with reduced motion the island in focus is 'now' at once: its caption cuts in with every island still dark", () => {
    const real = Object.getOwnPropertyDescriptor(win, "matchMedia");
    Object.defineProperty(win, "matchMedia", { configurable: true, writable: true, value: (q: string) => ({ matches: /prefers-reduced-motion:\s*reduce/.test(q), media: q }) });
    const host = document.createElement("div"); document.body.append(host);
    try {
      const labels = createLabels(host);
      const now = () => [...host.querySelectorAll(".city-label")].filter((el) => el.classList.contains("now")).map((el) => el.textContent);
      labels.place(view({ beat: "islands", focus: "marketing", lit: per(0) }), places(), per(false)); // reduced motion: beat islands, focus set, everything dark
      expect(now()).toEqual(["Marketing"]);
      labels.place(view({ beat: "islands", focus: null, lit: per(0) }), places(), per(false));
      expect(now()).toEqual([]);
      labels.place(view({ beat: "grow", focus: "marketing", lit: per(1) }), places(), per(true));
      expect(now()).toEqual([]); // only during beat islands
      labels.destroy();
    } finally {
      if (real) Object.defineProperty(win, "matchMedia", real); else delete (win as unknown as Record<string, unknown>).matchMedia;
      host.remove();
    }
  });

  describe("a tag the sign-in card covers steps beside its island's sprite or above it, or hides", () => {
    const W = 1280, H = 720; // landscape, 900 px or wider: edge 8, band 96 (a tag's bottom must be at most 616); the card settles 540 wide with its top 243 up: y 477
    const TAG = { w: 120, h: 48 }; // a label with its plate
    const LABEL = { w: 100, h: 20 }; // the label alone, centred in the tag (the plate is 120 x 20, 8 px under it)
    const cleanups: (() => void)[] = [];
    afterEach(() => { while (cleanups.length) cleanups.pop()!(); }); // a failing assertion must not leave a card or labels behind
    const sprite = (left: number, top = 420, bottom = 600) => ({ left, top, right: left + 64, bottom });
    const rect = (left: number, top: number, right: number, bottom: number) => ({ left, right, top, bottom, width: right - left, height: bottom - top, x: left, y: top, toJSON() {} }) as DOMRect;
    /** Inbox under the card (card x 400-880, y 500-700) with the given sprite, plus whatever else a test puts in `places`. */
    function setup(over: Partial<LabelPlaces> = {}, opts: { label?: boolean; card?: boolean } = {}) {
      win.happyDOM.setViewport({ width: W, height: H });
      const host = document.createElement("div"); document.body.append(host);
      const labels = createLabels(host);
      for (const el of host.querySelectorAll(".city-tag")) {
        Object.defineProperty(el, "offsetWidth", { configurable: true, value: TAG.w });
        Object.defineProperty(el, "offsetHeight", { configurable: true, value: TAG.h });
        if (opts.label) {
          const label = el.querySelector(".city-label")!;
          Object.defineProperty(label, "offsetWidth", { configurable: true, value: LABEL.w });
          Object.defineProperty(label, "offsetHeight", { configurable: true, value: LABEL.h });
        }
      }
      const card = document.createElement("div"); card.className = "ic-card";
      if (opts.card !== false) document.body.append(card);
      card.getBoundingClientRect = () => rect(400, 500, 880, 700);
      const tag = (id: string) => host.querySelector(`.city-tag[data-island="${id}"]`) as HTMLElement;
      const plate = (id: string) => tag(id).querySelector(".city-plate") as HTMLElement;
      const at = (id: string) => /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(tag(id).style.transform)!.slice(1).map(Number);
      const places = (): LabelPlaces => ({ errors: { x: 100, y: 100 }, traffic: { x: 200, y: 300 }, inbox: { x: 640, y: 520 }, customers: { x: 1000, y: 300 }, marketing: { x: 1100, y: 120 }, line: { x: 640, y: 330 }, ...over });
      const place = (v: CityView = view({ plates: per(true) })) => labels.place(v, places(), per(false));
      const done = () => { labels.destroy(); host.remove(); card.remove(); win.happyDOM.setViewport({ width: 1024, height: 768 }); };
      cleanups.push(done);
      return { tag, plate, at, place, done, card };
    }

    test("it moves so its right edge is 8 px left of the sprite and its top is at the sprite's mid-height, and shows", () => {
      const t = setup({ inbox: { x: 640, y: 520, sprite: sprite(300) } });
      t.place();
      expect(t.tag("inbox").style.visibility).toBe("");
      const [x, y] = t.at("inbox");
      expect(x + TAG.w).toBe(300 - 8);
      expect(y).toBe(510); // (420 + 600) / 2
      t.done();
    });

    test("a tag the card does not cover stays exactly where it was, sprite or not", () => {
      const t = setup({ inbox: { x: 640, y: 520, sprite: sprite(300) }, traffic: { x: 200, y: 300, sprite: sprite(60, 280, 420) } });
      t.place();
      expect(t.at("traffic")).toEqual([140, 300]); // its own spot: centred on x 200
      expect(t.tag("traffic").style.visibility).toBe("");
      t.done();
    });

    test("when the left of the sprite will not do it tries the right of it, 8 px clear, top at the mid-height", () => {
      const t = setup({ inbox: { x: 640, y: 520, sprite: sprite(100) } }); // the left spot is past the left edge of the screen
      t.place();
      expect(t.tag("inbox").style.visibility).toBe("");
      expect(t.at("inbox")).toEqual([100 + 64 + 8, 510]);
      t.done();
    });

    test("then above the sprite, centred on it and 8 px clear of its top", () => {
      const t = setup({ inbox: { x: 640, y: 520, sprite: sprite(600) }, line: { x: 640, y: 250 } }); // left (472..592) and right (672..792) are both on the card
      t.place();
      expect(t.tag("inbox").style.visibility).toBe("");
      expect(t.at("inbox")).toEqual([632 - TAG.w / 2, 420 - 8 - TAG.h]);
      t.done();
    });

    test("it hides only when none of the three spots is wholly on screen and clear: off the screen, on the card, or another tag's", () => {
      const filled = setup({ inbox: { x: 640, y: 520, sprite: { left: 4, top: 4, right: 1276, bottom: 600 } } }); // a sprite that fills the screen leaves no room
      filled.place();
      expect(filled.tag("inbox").style.visibility).toBe("hidden");
      filled.done();
      // the left is Traffic's, the right is on the card, above is Marketing's
      const busy = setup({ inbox: { x: 640, y: 520, sprite: sprite(300) }, traffic: { x: 232, y: 510 }, marketing: { x: 332, y: 364 } });
      busy.place();
      expect(busy.tag("traffic").style.visibility).toBe("");
      expect(busy.tag("marketing").style.visibility).toBe("");
      expect(busy.tag("inbox").style.visibility).toBe("hidden");
      busy.done();
      const bare = setup(); // no sprite box: nowhere to go
      bare.place();
      expect(bare.tag("inbox").style.visibility).toBe("hidden");
      bare.done();
    });

    test("two covered tags do not take the same spot, and it goes back to its own place when the card leaves", () => {
      const t = setup({ inbox: { x: 640, y: 520, sprite: sprite(300) }, customers: { x: 700, y: 540, sprite: sprite(300, 430, 610) } });
      t.place();
      expect(t.tag("inbox").style.visibility).toBe("");
      expect(t.tag("customers").style.visibility).toBe("");
      expect(t.at("inbox")).toEqual([172, 510]); // Inbox first: the left of its sprite
      expect(t.at("customers")).toEqual([272, 430 - 8 - TAG.h]); // Customers' left spot (172..292, 520..568) is Inbox's now, its right is on the card: above
      t.card.remove();
      t.place();
      expect(t.tag("inbox").style.visibility).toBe("");
      expect(t.at("inbox")).toEqual([580, 520]); // its own place again, centred on x 640
      expect(t.at("customers")).toEqual([640, 540]);
      expect(t.tag("customers").style.visibility).toBe("");
      document.body.append(t.card);
      t.done();
    });

    test("a card that is flying out (a ghost) is not in the way", () => {
      const t = setup({ inbox: { x: 640, y: 520, sprite: sprite(300) } });
      t.card.classList.add("ic-ghost");
      t.place();
      expect(t.at("inbox")).toEqual([580, 520]); // its own place
      t.done();
    });

    test("only the plate in the way: the plate hides and the label stays exactly where it is", () => {
      const t = setup({ inbox: { x: 640, y: 470, sprite: sprite(300) } }, { label: true }); // the tag is 580..700 x 470..518, its label 590..690 x 470..490, the card starts at y 500
      t.place();
      expect(t.tag("inbox").style.visibility).toBe("");
      expect(t.at("inbox")).toEqual([580, 470]); // it did not move
      expect(t.plate("inbox").style.visibility).toBe("hidden");
      expect(t.plate("errors").style.visibility).toBe(""); // the others have nothing in the way
      t.card.remove();
      t.place();
      expect(t.plate("inbox").style.visibility).toBe(""); // the card left: the plate is back
      document.body.append(t.card);
      t.done();
    });

    test("when the label itself is in the way the whole tag goes beside the sprite, plate and all", () => {
      const t = setup({ inbox: { x: 640, y: 520, sprite: sprite(300) } }, { label: true }); // its label (520..540) is on the card
      t.place();
      expect(t.at("inbox")).toEqual([172, 510]);
      expect(t.plate("inbox").style.visibility).toBe("");
      t.done();
    });

    test("a plate that does not fit the screen (under the caption band) hides and the label stays; a label that does not fit hides the tag", () => {
      const t = setup({ errors: { x: 100, y: 590 }, traffic: { x: 300, y: 610 } }, { label: true, card: false }); // the band starts at y 616
      t.place();
      expect(t.tag("errors").style.visibility).toBe(""); // label 590..610 fits, tag 590..638 does not
      expect(t.plate("errors").style.visibility).toBe("hidden");
      expect(t.tag("traffic").style.visibility).toBe("hidden"); // even its label (610..630) is under the band
      t.done();
    });

    test("cardAt: where the card settles, as measured on the real card (540 / 460 px wide, 243 / 162 / 210 px up), and a home indicator lifts it", () => {
      expect(cardAt(1280, 720)).toEqual({ left: 370, right: 910, top: 477, bottom: 720 });
      expect(cardAt(1440, 900)).toEqual({ left: 450, right: 990, top: 657, bottom: 900 });
      expect(cardAt(390, 844)).toEqual({ left: 10, right: 380, top: 634, bottom: 844 }); // stacked buttons under 520 px
      expect(cardAt(360, 640)).toEqual({ left: 10, right: 350, top: 430, bottom: 640 });
      expect(cardAt(768, 1024)).toEqual({ left: 154, right: 614, top: 862, bottom: 1024 }); // 2 px art, buttons side by side
      expect(cardAt(390, 844, 34).top).toBe(600);
    });

    test("from the dim on the card that is about to come counts: a tag steps aside when its plate drops, and stays put while the card slides up", () => {
      const t = setup({ inbox: { x: 640, y: 470, sprite: sprite(300) } }, { label: true, card: false }); // its label (470..490) will be under a card that starts at y 477
      const view = (beat: CityView["beat"], plates: Record<CityIsland, boolean>) => ({ ...manualCity("city"), beat, plates, lit: per(0) }) as CityView;
      t.place(view("grow", per(false)));
      expect(t.at("inbox")).toEqual([580, 470]); // before the dim nothing is coming
      t.place(view("dim", per(false)));
      expect(t.at("inbox")).toEqual([580, 470]); // the dim has begun but its plate has not dropped
      t.place(view("dim", { ...per(false), inbox: true }));
      expect(t.at("inbox")).toEqual([172, 510]); // its plate drops: it steps to the left of its sprite, with no card on screen yet
      expect(t.tag("inbox").style.visibility).toBe("");
      // the card comes up and slides: its box is lower than where it settles, and nothing moves
      document.body.append(t.card);
      for (const dy of [60, 36, 12, 0]) {
        t.card.getBoundingClientRect = () => rect(370, 477 + dy, 910, 702 + dy);
        t.place(view("card", per(true)));
        expect(t.at("inbox"), `${dy} px down`).toEqual([172, 510]);
        expect(t.tag("inbox").style.visibility).toBe("");
      }
      t.done();
    });

    test("at the dim a plate that would reach into the coming card is cut as it drops: the label does not move", () => {
      const t = setup({ inbox: { x: 640, y: 440, sprite: sprite(300) } }, { label: true, card: false }); // label 440..460 is clear of y 477, the tag (to 488) is not
      const view = (plates: Record<CityIsland, boolean>) => ({ ...manualCity("city"), beat: "dim", plates, lit: per(0) }) as CityView;
      t.place(view(per(false)));
      expect(t.plate("inbox").style.visibility).toBe("");
      t.place(view({ ...per(false), inbox: true }));
      expect(t.at("inbox")).toEqual([580, 440]);
      expect(t.tag("inbox").style.visibility).toBe("");
      expect(t.plate("inbox").style.visibility).toBe("hidden");
      t.done();
    });

    test("a tag beside the card is not covered, however low it hangs: Customers' tag reaches below the card's top but is right of its edge", () => {
      const t = setup({ customers: { x: 1030, y: 445, sprite: sprite(940, 345, 437) } }, { label: true, card: false });
      const done = { ...manualCity("city"), beat: "card", plates: per(true), lit: per(0) } as CityView;
      t.place(done);
      expect(t.at("customers")).toEqual([970, 445]); // 970..1090 x 445..493, and the card is 370..910 x 477..720
      expect(t.plate("customers").style.visibility).toBe("");
      t.card.getBoundingClientRect = () => rect(370, 477, 910, 702);
      document.body.append(t.card);
      t.place(done);
      expect(t.at("customers")).toEqual([970, 445]);
      t.done();
    });
  });

  test("labels sit on whole device px (pixel text never lands on a half pixel) and follow the places they are given", () => {
    const host = document.createElement("div"); document.body.append(host);
    const labels = createLabels(host);
    labels.place(view(), places(), per(false));
    const at = (id: string) => (host.querySelector(`.city-tag[data-island="${id}"]`) as HTMLElement).style.transform;
    expect(at("errors")).toBe("translate(100px, 200px)");
    expect(at("traffic")).toBe("translate(120px, 301px)");
    labels.place(view(), { ...places(), errors: { x: 150, y: 210 } }, per(false));
    expect(at("errors")).toBe("translate(150px, 210px)");
    labels.destroy(); host.remove();
  });

  test("on a 2x screen a tag's left and top are whole device px: halves of a CSS px, after centring", () => {
    const real = Object.getOwnPropertyDescriptor(win, "devicePixelRatio");
    Object.defineProperty(win, "devicePixelRatio", { configurable: true, writable: true, value: 2 });
    const host = document.createElement("div"); document.body.append(host);
    try {
      const labels = createLabels(host);
      for (const el of host.querySelectorAll(".city-tag")) Object.defineProperty(el, "offsetWidth", { configurable: true, value: 143 }); // an odd width: centring lands on a half
      const at = (id: string) => (host.querySelector(`.city-tag[data-island="${id}"]`) as HTMLElement).style.transform;
      labels.place(view(), { ...places(), errors: { x: 300, y: 200 }, traffic: { x: 120.4, y: 300.6 }, inbox: { x: 300.3, y: 400.2 } }, per(false));
      expect(at("errors")).toBe("translate(228.5px, 200px)"); // 300 - 71.5
      expect(at("traffic")).toBe("translate(49px, 300.5px)"); // 120.4 - 71.5 = 48.9 -> 49; 300.6 -> 300.5
      expect(at("inbox")).toBe("translate(229px, 400px)"); // 300.3 - 71.5 = 228.8 -> 229; 400.2 -> 400
      for (const id of ["errors", "traffic", "inbox"]) for (const v of /translate\(([\d.]+)px, ([\d.]+)px\)/.exec(at(id))!.slice(1).map(Number)) expect((v * 2) % 1, `${id} ${v}`).toBe(0);
      labels.destroy();
    } finally {
      if (real) Object.defineProperty(win, "devicePixelRatio", real); else delete (win as unknown as Record<string, unknown>).devicePixelRatio;
      host.remove();
    }
  });
});

describe("the city module: events, labels and the camera together", () => {
  const screen = { w: 1280, h: 720, dpr: 1, portrait: false };
  const art: ArtLoader = { get: () => null, ready: async () => {} };
  const lit = (on: Partial<Record<CityIsland, number>>, beat: CityView["beat"] = "islands"): CityView => ({ ...manualCity("city"), beat, lit: { ...per(0), ...on } });

  test("one island lighting gives twelve ticks, one tap, at 60 fps, and its label brightens on the tap", () => {
    const host = document.createElement("div"); document.body.append(host);
    const bus = createBus(), events: DeckEvent[] = [];
    bus.on((e) => events.push(e));
    const city = createCity(art, bus, host);
    const toScreen = (x: number, y: number) => ({ x: x / 10, y: y / 10 });
    city.update(1 / 60, lit({}), screen); city.place(lit({}), toScreen);
    const bright = () => host.querySelector('.city-tag[data-island="traffic"] .city-label')!.classList.contains("lit");
    expect(bright()).toBe(false);
    let sawBrightBeforeTap = false;
    for (let k = 1; k <= 130; k++) {
      const u = k / 60, v = lit({ traffic: Math.max(0, Math.min(1, (u - 0.6) / 2.6)) }); // 0.6 s of camera, then CITY_TIMING.light (2.6 s)
      city.update(1 / 60, v, screen); city.place(v, toScreen);
      if (bright() && !events.some((e) => e.type === "city-lit")) sawBrightBeforeTap = true;
    }
    const lamps = events.filter((e): e is Extract<DeckEvent, { type: "city-lamp" }> => e.type === "city-lamp");
    expect(lamps.map((e) => e.lamp)).toEqual(Array.from({ length: lamps.length }, (_, i) => i));
    expect(lamps.length).toBeGreaterThanOrEqual(1);
    expect(lamps.every((e) => e.island === "traffic" && e.of === lamps.length)).toBe(true);
    expect(events.filter((e) => e.type === "city-lit")).toEqual([{ type: "city-lit", island: "traffic" }]);
    expect(events.length).toBe(lamps.length + 1);
    expect(sawBrightBeforeTap).toBe(false);
    expect(bright()).toBe(true);
    city.destroy(); host.remove();
  });

  test("the manual city is silent, shows every label with a plate, and hides them all again off the city", () => {
    const host = document.createElement("div"); document.body.append(host);
    const bus = createBus(), events: DeckEvent[] = [];
    bus.on((e) => events.push(e));
    const city = createCity(art, bus, host);
    const toScreen = (x: number, y: number) => ({ x: x / 10, y: y / 10 });
    const manual = manualCity("city", "you/repo");
    for (let i = 0; i < 5; i++) { city.update(0.02, manual, screen); city.place(manual, toScreen); }
    expect(events).toEqual([]);
    expect(host.querySelectorAll(".city-plate:not([hidden])").length).toBe(5);
    expect(host.querySelector(".city-labels")!.hasAttribute("hidden")).toBe(false);
    const line = manualCity("line", "you/repo");
    city.update(0.02, line, screen); city.place(line, toScreen);
    expect(host.querySelector(".city-labels")!.hasAttribute("hidden")).toBe(true);
    city.update(0.02, undefined, screen); city.place(undefined, toScreen);
    expect(host.querySelector(".city-labels")!.hasAttribute("hidden")).toBe(true);
    city.destroy(); host.remove();
  });

  test("camera(): the whole ring on a desktop (k 1), an island at k 2 on a phone, the pure camera on the stand-in manifest", () => {
    const host = document.createElement("div"); document.body.append(host);
    const city = createCity(art, createBus(), host);
    const ring = city.camera(manualCity("city"), screen);
    expect(ring.k).toBe(1);
    // no manifest loads here, so the module frames the stand-in sizes and points (manifest.ts fallbackManifest)
    expect(ring).toEqual(cityCamera(manualCity("city"), screen, ringLayout(false, fallbackManifest()), fallbackManifest()));
    const phone = { w: 390, h: 844, dpr: 2, portrait: true };
    expect(city.camera(manualCity("city"), phone).k).toBe(1);
    const errors = { ...manualCity("city"), focus: "errors" as const };
    expect(city.camera(errors, phone)).toEqual(cityCamera(errors, phone, ringLayout(true, fallbackManifest()), fallbackManifest()));
    expect(city.camera(errors, phone).k).toBe(2);
    city.destroy(); host.remove();
  });

  test("the end of beat 3 and the dim: city-all-lit once, then one thud per island in the order the story steps them", () => {
    const host = document.createElement("div"); document.body.append(host);
    const bus = createBus(), events: DeckEvent[] = [];
    bus.on((e) => events.push(e));
    const city = createCity(art, bus, host);
    const all = per(1);
    city.update(0.02, lit({}, "city"), screen);
    city.update(0.02, { ...manualCity("city"), beat: "grow", lit: all }, screen);
    city.update(0.02, { ...manualCity("city"), beat: "grow", lit: all }, screen);
    expect(events).toEqual([{ type: "city-all-lit" }]);
    events.length = 0;
    let now = { ...all };
    for (const id of [...CITY_ISLANDS].reverse()) {
      now = { ...now, [id]: 0 };
      city.update(0.15, { ...manualCity("city"), beat: "dim", lit: now }, screen);
    }
    expect(events).toEqual([...CITY_ISLANDS].reverse().map((island) => ({ type: "city-dim", island })));
    city.destroy(); host.remove();
  });
});

describe("deck.css: the chips, plates and caption on the city", () => {
  const css = readFileSync(join(import.meta.dir, "../src/deck2d/deck.css"), "utf8");
  const escape = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  /** The declarations of the first top-level rule for this exact selector (a rule that starts a line, so not one inside a media query). */
  const rule = (selector: string) => new RegExp(`^${escape(selector)} \\{([^}]*)\\}`, "m").exec(css)?.[1] ?? null;
  const decl = (selector: string, prop: string) => new RegExp(`(?:^|[;\\s])${escape(prop)}:\\s*([^;]+?)\\s*(?:;|$)`).exec(rule(selector) ?? "")?.[1] ?? null;
  const lum = (hex: string) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const contrast = (a: string, b: string) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
  const SOOT = "#0a0604";
  const CITY_TOAST_INK = "#f6e3c0"; // --ink, the caption's colour

  test("the labels are on an opaque soot chip with a 1 px edge that is a shadow, so the box stays the size the camera counts on", () => {
    expect(decl(".city-label", "background")).toBe(SOOT); // opaque: no rgba
    expect(decl(".city-label", "box-shadow")).toBe("inset 0 0 0 1px #432f29");
    expect(decl(".city-label", "border")).toBeNull(); // a real border would make the box 2 px bigger than LABEL_CSS says
    expect(decl(".city-label", "padding")).toBe("2px 4px");
    expect(decl(".city-label", "line-height")).toBe("1");
    expect(decl(".city-label.line", "color")).toBe("#fdec9a");
  });

  test("the COMING SOON plate is quiet: dim brass text on the soot chip, a brass-brown 2 px border and the same 2 px soot drop", () => {
    expect(decl(".city-plate", "background")).toBe(SOOT);
    expect(decl(".city-plate", "color")).toBe("#c98115");
    expect(decl(".city-plate", "border")).toBe("2px solid #6d370c");
    expect(decl(".city-plate", "box-shadow")).toBe("0 2px 0 #0a0604");
    // the phone: 12 px is three device px per Silkscreen px at dpr 2; 12 + 2 x 2 padding + 2 x 2 border = a 20 px plate
    expect(decl(".city-plate", "font-size")).toBe("12px");
    expect(decl(".city-plate", "padding")).toBe("2px 4px");
    expect(decl(".city-plate", "line-height")).toBe("1");
    expect(css).toContain("@media (min-width: 900px) and (min-height: 560px) { .city-label { font-size: 16px; } .city-plate { font-size: 16px; padding: 2px 6px; } }");
  });

  test("the boxes are the sizes city/camera.ts counts on (LABEL_CSS): a label 20 / 16 px tall, a plate 24 / 20, worked out from the CSS", () => {
    const px = (v: string | null) => Number.parseFloat(v ?? "NaN");
    const rows = (v: string | null) => px((v ?? "").split(" ")[0]); // the vertical padding of "2px 4px"
    const border = px(decl(".city-plate", "border")); // "2px solid #422616"
    const tall = (font: number, rule: string) => font * px(decl(rule, "line-height")) + 2 * rows(decl(rule, "padding"));
    const phone = { text: tall(px(decl(".city-label", "font-size")), ".city-label"), plate: tall(px(decl(".city-plate", "font-size")), ".city-plate") + 2 * border };
    const bigFont = /@media \(min-width: 900px\) and \(min-height: 560px\) \{ \.city-label \{ font-size: (\d+)px; \} \.city-plate \{ font-size: (\d+)px;/.exec(css)!;
    const big = { text: px(bigFont[1]) + 2 * rows(decl(".city-label", "padding")), plate: px(bigFont[2]) + 2 * rows(decl(".city-plate", "padding")) + 2 * border };
    expect(phone).toEqual({ text: LABEL_CSS.small.text, plate: LABEL_CSS.small.plate });
    expect(big).toEqual({ text: LABEL_CSS.big.text, plate: LABEL_CSS.big.plate });
  });

  test("the label that is 'now' is the brightest, and is declared after 'lit' so it wins when both apply", () => {
    expect(decl(".city-label.now", "color")).toBe("#fdec9a");
    expect(css.indexOf(".city-label.now {")).toBeGreaterThan(css.indexOf(".city-label.lit {"));
  });

  test("the line's #fdec9a stays the brightest text on the ring: brighter than the plates, every other label and the caption's ink", () => {
    const line = decl(".city-label.line", "color")!;
    expect(line).toBe("#fdec9a");
    for (const other of [decl(".city-plate", "color")!, decl(".city-label", "color")!, decl(".city-label.lit", "color")!, CITY_TOAST_INK]) expect(lum(line), other).toBeGreaterThan(lum(other));
  });

  test("every label colour and the plate text are at least 4.5:1 on their chip", () => {
    const chip = decl(".city-label", "background")!;
    for (const selector of [".city-label", ".city-label.lit", ".city-label.now", ".city-label.line"]) {
      const color = decl(selector, "color")!;
      expect(color, selector).toMatch(/^#[0-9a-f]{6}$/);
      expect(contrast(color, chip), selector).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(decl(".city-plate", "color")!, decl(".city-plate", "background")!)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(CITY_TOAST_INK, SOOT)).toBeGreaterThanOrEqual(4.5); // the caption's own ink on the toast chip
  });

  test("at city zoom the caption sits on the same chip, as wide as its longest line, and still breaks its two lines", () => {
    const toast = 'body[data-deck-zoom="city"] .toast';
    expect(css).toContain(`${toast} { white-space: pre-line; line-height: 1.25; }`); // the two-line rules stay as they were
    expect(css).toContain(`${toast} { width: max-content; max-width: calc(100% - 24px); padding: 4px 10px; background: #0a0604; border: 1px solid #432f29; }`);
    // a phone's longest line is 340 px; with 2 x 10 px of padding and 2 x 1 px of edge it is 362 px, inside the 366 px band of a 390 px screen
    expect(340 + 2 * 10 + 2 * 1).toBeLessThanOrEqual(390 - 24);
    // the aria-live caption element itself is not touched by the city: its rules are all scoped to the zoom
    expect(css).not.toMatch(/^#toast/m);
  });

  test("with reduced motion a caption cuts in, it does not fade", () => {
    expect(css).toContain("@media (prefers-reduced-motion: reduce) { .toast { transition: none; } }");
  });

  test("the reveal's caption sits on the chip from the line beat on, and only during the reveal: the engine leaves data-city-beat empty everywhere else", () => {
    const chip = "{ width: max-content; max-width: calc(100% - 24px); padding: 4px 10px; background: #0a0604; border: 1px solid #432f29; }";
    const reveal = 'body[data-city-beat]:not([data-city-beat=""]) .toast';
    expect(css).toContain(`${reveal} ${chip}`);
    expect(css).toContain(`body[data-deck-zoom="city"] .toast ${chip}`); // the city's own rule is as it was
    // the bare attribute selector would match every page (engine.ts sets data-city-beat to "" at load), so it is not used for the chip
    expect(css).not.toMatch(/^body\[data-city-beat\] \.toast/m);
    // what the selector does, as the page's own attribute sees it
    const body = document.body;
    try {
      delete body.dataset.cityBeat;
      expect(body.matches(reveal.replace(/ \.toast$/, ""))).toBe(false); // no attribute
      body.dataset.cityBeat = "";
      expect(body.matches(reveal.replace(/ \.toast$/, ""))).toBe(false); // the engine's value outside the reveal: manual and live captions stay as they were
      for (const beat of ["line", "city", "islands", "grow", "dim", "card"]) { body.dataset.cityBeat = beat; expect(body.matches(reveal.replace(/ \.toast$/, "")), beat).toBe(true); }
    } finally { delete body.dataset.cityBeat; }
  });

  test("a phone's city caption is 12 px (3 device px per Silkscreen px at dpr 2), and an empty one leaves no chip behind", () => {
    expect(css).toContain('@media (max-width: 899px) { body[data-deck-zoom="city"] .toast { font-size: 12px; } }');
    expect(css).toContain('body[data-deck-zoom="city"] .toast:empty { visibility: hidden; }');
    // the desktop's 24 px caption is untouched: the phone rule only reaches under 900 px wide
    expect(css).toContain("@media (min-width: 900px) and (min-height: 560px) {\n  .toast { font-size: 24px; text-shadow: 0 3px 0 #000; }");
  });

  test("pixel text is not smoothed: the labels, the plates and the city's captions", () => {
    const rules = [...css.matchAll(/^([^{}\n]+) \{([^}]*-webkit-font-smoothing: none[^}]*)\}/gm)];
    expect(rules.length).toBe(1);
    const [, selector, body] = rules[0];
    for (const part of [".city-label", ".city-plate", 'body[data-deck-zoom="city"] .toast', 'body[data-city-beat]:not([data-city-beat=""]) .toast']) expect(selector, part).toContain(part);
    expect(body).toContain("-webkit-font-smoothing: none; font-smooth: never;");
  });

  test("the card takes focus for screen readers but wears no focus ring itself (Chrome's is #99c8ff and #eeeeee on this dark page); its buttons keep theirs", () => {
    expect(css).toContain('.ic-card[tabindex="-1"]:focus { outline: none; }');
    expect(css).not.toMatch(/\.ic-btn[^{]*:focus[^{]*\{[^}]*outline: none/); // nothing here takes the buttons' own ring away
    const main = readFileSync(join(import.meta.dir, "../src/deck2d/main.ts"), "utf8");
    expect(main).toContain("face.focus({preventScroll:true});"); // the card is still focused: that is how a screen reader finds it
    expect(main).toContain("face.tabIndex = -1;"); // ... and the rule above is keyed to exactly that
  });

  test("the Sign in button of the reveal's card is two art px taller and a little narrower inside, so its g clears the stripe", () => {
    expect(css).toContain('body[data-city-beat="card"] .ic-card .ic-btn.approve { min-height: calc(var(--p) * 22); padding-inline: calc(var(--p) * 3); }');
    expect(css).toContain('body[data-city-beat="card"] .ic-card .ic-btn b { overflow: visible; text-overflow: clip; white-space: nowrap; }'); // its words stay on one line
    const card = readFileSync(join(import.meta.dir, "../src/deck2d/card/card.css"), "utf8");
    expect(card).toContain("min-height: calc(var(--p) * 20); padding: 0 calc(var(--p) * 4);"); // every other card's button is as it was
  });
});

describe("web/deck.html: the Zoom button waits for the picture", () => {
  const html = readFileSync(join(import.meta.dir, "../deck.html"), "utf8");

  test("it stays hidden until the deck says it is ready (data-deck-ready, set after the first frame), not until the engine is built (data-deck-zoom)", () => {
    expect(html).toContain("body:not([data-deck-ready]) #zoom { visibility: hidden; }");
    expect(html).not.toContain("body:not([data-deck-zoom]) #zoom");
    const main = readFileSync(join(import.meta.dir, "../src/deck2d/main.ts"), "utf8");
    expect(main).toContain('document.body.dataset.deckReady = "1"');
    expect(main.indexOf("engine.frame(view, dt);")).toBeLessThan(main.indexOf('document.body.dataset.deckReady = "1"')); // after a frame has drawn
  });
});

describe("the shots script (scripts/shots/deck.mjs, CITY=1)", () => {
  const script = readFileSync(join(import.meta.dir, "../../scripts/shots/deck.mjs"), "utf8");

  test("it checks the reveal against the words the city really shows, so a changed caption cannot slip by", () => {
    const words = [CITY_COPY.line, CITY_COPY.city, ...CITY_ISLANDS.map((id) => CITY_COPY.island[id]), CITY_COPY.grow, CITY_COPY.dim, CITY_COPY.card.title];
    for (const w of words) expect(script).toContain(JSON.stringify(w));
    expect(script).not.toContain("CITY_MOCKUP"); // the first mockup's switch is gone
  });

  test("reduced motion is held to the same caption order as normal motion: its island captions are cuts", () => {
    expect(script).toContain("want = [COPY.line, COPY.city, ...COPY.islands, COPY.grow, COPY.dim]");
    expect(script).not.toMatch(/reduced \? \[COPY\.line/);
  });

  test("the clip opens once the deck says it is ready plus two animation frames, runs 31 s (the reveal is 29.1 s) and is recorded at the device size", () => {
    expect(script).toMatch(/waitForSelector\('\[data-deck-ready\]'[^\n]*\n\s*await revealPage\.evaluate\(\(\) => new Promise\(done => requestAnimationFrame\(\(\) => requestAnimationFrame\(done\)\)\)\);\n\s*const clipFrom = Date\.now\(\) \/ 1000;/);
    expect(script).toContain("const CLIP_DEFAULT = 31");
    expect(script).toContain("CLIP=31 records");
    expect(script).not.toContain("CLIP=26");
    expect(script.match(/startClip\(context, \w+, dir, deviceOf\(view\)\)/g)).toHaveLength(2); // the base page and the reveal page
    expect(script).toContain("keep(await page.screenshot({ type: 'jpeg', quality: 90"); // above dpr 1: screenshots at device pixels (780x1688), not the 390x844 screencast
    expect(script).not.toContain("send('Page.captureScreenshot'"); // a raw capture on a second DevTools session leaves the page shrunk into a corner after the first screenshot
    expect(0.5 + REVEAL_SECONDS.normal + 0.7).toBeLessThanOrEqual(31); // 0.5 s of running line, the reveal, the card sliding up: all inside the clip
  });

  test("a clip that ends before the card has come up and settled is a problem, with the story's own numbers", () => {
    const block = /const REVEAL_SECONDS = \{([^}]*)\}/.exec(script)![1];
    const num = (name: string) => Number(new RegExp(`${name}: (\\d+(?:\\.\\d+)?)`).exec(block)![1]);
    expect(num("normal")).toBe(REVEAL_SECONDS.normal); // the script cannot import the story, so this pin keeps its copy true
    expect(num("reduced")).toBe(REVEAL_SECONDS.reduced);
    expect(script).toContain("const CARD_SETTLE = 1.5;");
    expect(script).toContain("if (CLIP_S && CLIP_S < (reduced ? REVEAL_SECONDS.reduced : REVEAL_SECONDS.normal) + CARD_SETTLE) problems.push('clip ends before the card');");
    // CLIP=1 (the default clip) holds the whole reveal and the card; CLIP=26 would not, and no guidance says it does
    expect(Number(/const CLIP_DEFAULT = (\d+)/.exec(script)![1])).toBeGreaterThanOrEqual(REVEAL_SECONDS.normal + 1.5);
    expect(26).toBeLessThan(REVEAL_SECONDS.normal + 1.5);
    expect(script).not.toMatch(/CLIP=2\d\b|\b2[46][ -]?s(econd)?[ -]clip/i);
  });

  test("/api/me answers after ME_DELAY (300 ms with CITY=1), so the sign-in card is shot while it is still waiting", () => {
    expect(script).toContain("CITY ? 300 : 0;");
    expect(script).toMatch(/context\.route\('\*\*\/api\/me', async route => \{\n\s+if \(ME_DELAY\) await sleep\(ME_DELAY\);/);
    expect(script).toContain("STRICT=1 leaves it alone");
  });

  test("it fails the run if the card ever says \"Finding your repositories…\", changes height on its way up, or wears a focus ring", () => {
    expect(script).toContain("/Finding your repositories/i.test(t)");
    expect(script).toContain("the card changed height during the reveal");
    expect(script).toContain("the card shows a focus ring");
    expect(script).toContain("the Sign in button's words are on ${reveal.signInLines} lines, wanted 1"); // "Sign in with GitHub →" stays on one line at 390 and 1280
    expect(script).toContain("a label or plate shows under the sign-in card: ${reveal.underCard.join(', ')}"); // labels.ts steps a covered tag aside, cuts its plate or hides it
    expect(script).toContain("el.offsetHeight"); // layout height: the slide-in's transform does not count
    expect(script).toContain("getComputedStyle(el).outlineStyle");
  });
});
