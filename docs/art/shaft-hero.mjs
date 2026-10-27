// Records the landing page's hero loop from the real shaft map: web/public/welcome/hero.mp4 (1600x900),
// hero-phone.mp4 (600x800) and their first-frame stills (hero.webp, hero-1024.webp, hero-phone.webp).
// Same method as the old Black Iron loop (docs/context/landing.md): frame by frame in headless Chromium with rAF off,
// seeded Math.random, every overlay hidden, the last second crossfaded into the first so the loop has no seam.
//
//   cd web && bunx vite --port 5310            # the shaft's test hooks (window.__shaft) exist in dev only
//   node docs/art/shaft-hero.mjs                # both cuts, written to web/public/welcome/
//   node docs/art/shaft-hero.mjs --only=phone --desk-view=line --phone-view=launch --out=/tmp/hero
//
// Needs playwright (PLAYWRIGHT_MODULE or NODE_PATH), ffmpeg and python3 with Pillow.

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1] ?? d;
const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const base = arg("base", "http://localhost:5310/");
const out = arg("out", join(root, "web/public/welcome"));
const scenario = arg("scenario", "judge");
const warm = Number(arg("warm", "45")); // seconds of sim before the first frame, so the line is busy
const FPS = 24, SECONDS = 10, FADE = FPS; // a 10s loop, the last second fading into the first
const CUTS = [
  { name: "hero", w: 1600, h: 900, view: arg("desk-view", "build"), crf: 26 },
  { name: "hero-phone", w: 600, h: 800, view: arg("phone-view", "launch"), crf: 25 },
].filter((c) => !arg("only") || c.name.endsWith(arg("only")) || (arg("only") === "desk" && c.name === "hero"));

const req = createRequire(import.meta.url);
const { chromium } = process.env.PLAYWRIGHT_MODULE ? req(process.env.PLAYWRIGHT_MODULE) : createRequire((process.env.NODE_PATH ?? ".") + "/")("playwright");
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
for (const cut of CUTS) {
  const frames = mkdtempSync(join(tmpdir(), `${cut.name}-`));
  const ctx = await browser.newContext({ viewport: { width: cut.w, height: cut.h }, deviceScaleFactor: 1, reducedMotion: "no-preference" });
  // the same sim every take
  await ctx.addInitScript(() => {
    let s = 20261104;
    Math.random = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(120000);
  await page.goto(`${base}?source=sim&world=shaft&scenario=${scenario}&raf=0&tour=0`);
  await page.waitForFunction(() => window.__shaft);
  // only the map: every plate, chip, tag, toast and caption hidden
  await page.addStyleTag({ content: "body *{visibility:hidden!important} canvas{visibility:visible!important}" });
  await page.evaluate(([v, warm]) => {
    window.__shaft.view(v);
    for (let t = 0; t < warm; t += 0.5) window.__shaft.advance(0.5);
  }, [cut.view, warm]);
  const total = FPS * SECONDS + FADE;
  for (let i = 0; i < total; i++) {
    await page.evaluate((dt) => (window.__shaft.advance(dt), window.__shaft.render()), 1 / FPS);
    await page.screenshot({ path: join(frames, `f${String(i).padStart(4, "0")}.png`) });
  }
  await ctx.close();
  // crossfade: frame i of the first second blends in from frame (loop + i), so frame 239 runs straight into frame 0
  const loop = join(frames, "loop");
  mkdirSync(loop);
  execFileSync("python3", ["-I", "-c", `
import sys
from PIL import Image
d, fps, n, fade = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4])
f = lambda i: Image.open(f"{d}/f{i:04d}.png").convert("RGB")
for i in range(n):
    im = f(i)
    if i < fade:
        im = Image.blend(f(n + i), im, i / fade)
    im.save(f"{d}/loop/l{i:04d}.png")
`, frames, String(FPS), String(FPS * SECONDS), String(FADE)]);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", join(loop, "l%04d.png"),
    "-c:v", "libx264", "-preset", "slow", "-crf", String(cut.crf), "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an",
    join(out, `${cut.name}.mp4`)]);
  // the still the page paints first is the loop's first frame
  execFileSync("python3", ["-I", "-c", `
import sys
from PIL import Image
im = Image.open(sys.argv[1]).convert("RGB")
im.save(sys.argv[2] + ".webp", quality=80, method=6)
if sys.argv[3] == "1": im.resize((1024, round(im.height * 1024 / im.width)), Image.LANCZOS).save(sys.argv[2] + "-1024.webp", quality=80, method=6)
`, join(loop, "l0000.png"), join(out, cut.name), cut.name === "hero" ? "1" : "0"]);
  rmSync(frames, { recursive: true, force: true });
  console.log(`${cut.name}: ${cut.w}x${cut.h}, ${cut.view} view, ${SECONDS}s at ${FPS}fps -> ${out}`);
}
await browser.close();
