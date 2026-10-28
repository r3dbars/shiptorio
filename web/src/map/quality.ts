// Keeps phones cool and steady without touching the look on a good device.
// - Weak devices step down on their own, by measured frame time, never by user agent:
//   tier 1 redraws shadows every other frame, tier 2 also caps at 30 fps (a steady 30
//   reads better than a stuttering 45). It never steps back up, so it can't flicker.
// - Phones idle at 30 fps: no finger down and the camera still for a few seconds means
//   nobody is panning, and the chunky pixel art looks the same at half the battery.
// Hidden tabs already stop requestAnimationFrame, and sound suspends itself.

const FRAME = 1000 / 60;
const CAP = 1000 / 30;
const IDLE_AFTER = 4000; // ms without input before a phone drops to 30 fps
const SLOW = 24; // ms; an average above this for 60 frames in a row steps down a tier
const WARMUP = 3000;
// Repeated foreground stalls can be too slow to enter the ordinary average path.
// Two 0.5–2s frames after warm-up use the existing lowest tier. Longer gaps are
// treated as suspension/clock jumps; one isolated stall never changes the look.
const STALL_MIN = 500;
const STALL_MAX = 2000;

export class FrameGovernor {
  tier = 0;
  private lastDraw = 0;
  private avg = FRAME;
  private lastInput = performance.now();
  private n = 0;
  private slowFrames = 0;
  private stalledFrames = 0;
  private readonly born = performance.now();

  constructor(private readonly phone: boolean) {
    const q = new URLSearchParams(location.search).get("quality"); // ?quality=0|1|2 pins a tier for testing
    if (q !== null) {
      this.tier = Math.max(0, Math.min(2, Number(q) || 0));
      this.avg = -Infinity; // pinned: never steps down
    }
  }

  // any pan, pinch, tap or hover
  poke() {
    this.lastInput = performance.now();
  }

  // Whether to draw this animation frame. moving: the camera is gliding somewhere.
  draw(now: number, moving: boolean) {
    const idle = this.phone && !moving && now - this.lastInput > IDLE_AFTER;
    const capped = this.tier >= 2 || idle;
    const gap = now - this.lastDraw;
    if (capped && gap < CAP - 4) return false;
    this.lastDraw = now;
    this.n++;
    const foreground = typeof document === "undefined" || document.visibilityState === "visible";
    const stalled = !capped && foreground && this.avg !== -Infinity && now - this.born > WARMUP
      && gap >= STALL_MIN && gap <= STALL_MAX;
    this.stalledFrames = stalled ? this.stalledFrames + 1 : 0;
    if (this.stalledFrames >= 2) this.tier = 2;
    // only uncapped frames say how fast the device really is; skip long gaps (tab switches)
    // and not during the first seconds, while shaders compile and the island builds
    if (!capped && gap < 500 && this.avg !== -Infinity && now - this.born > WARMUP) {
      this.avg += (Math.min(gap, 100) - this.avg) * 0.05;
      this.slowFrames = this.avg > SLOW ? this.slowFrames + 1 : 0;
      if (this.slowFrames > 60 && this.tier < 2) {
        this.tier++;
        this.avg = FRAME;
        this.slowFrames = 0;
      }
    }
    return true;
  }

  // tier 1+: the sun's shadow map is redrawn every other frame
  shadows() {
    return this.tier === 0 || this.n % 2 === 0;
  }
}
