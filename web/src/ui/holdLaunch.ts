// The consent behind the big red launch button: a launch happens only after one primary press is held
// for the full time on the same card. Anything else (early release, focus or tab leaving, losing the
// pointer, the card changing underneath) cancels. Screen readers activate buttons with a bare click, so
// that path asks twice: the first activation arms, a second one on the same card within a few seconds launches.
// This controller owns every timer, the confirm window's expiry included, so what the button shows can only
// follow the events below. A launch here means the request was sent; the rocket sound and its caption come
// from the server's launched state (sound/useFactorySound.ts), never from the button.

export interface HoldClock {
  now(): number;
  raf(cb: () => void): number;
  caf(id: number): void;
  after(ms: number, cb: () => void): number; // setTimeout
  clear(id: number): void; // clearTimeout
}

export interface HoldEvents {
  progress(p: number): void;
  launch(card: string): void; // the player consented: send the launch
  arm(): void; // a press started
  cancel(): void; // a press ended without launching
  confirm(card: string | null): void; // assistive path: armed for this card, or disarmed (also on expiry)
}

export const HOLD_MS = 800;
export const CONFIRM_MS = 5000;
const CLICK_AFTER_PRESS_MS = 600; // the click a browser fires after a key or pointer press is not a second activation
// The ring fills only while frames keep coming: one long stall (a janky page, a frozen tab) counts as
// at most this much, so a tap whose release is delivered late can never pass for a full hold.
export const MAX_FRAME_MS = 100;

export class HoldGesture {
  private card: string | null = null; // the card a press is holding, null when idle
  private held = 0; // ms of hold seen so far
  private last = 0;
  private frame = 0;
  private lastPress = -Infinity;
  private armed: { card: string; until: number; timer: number } | null = null;

  constructor(private readonly ev: HoldEvents, private readonly clock: HoldClock, private readonly ms = HOLD_MS) {}

  get holding() { return this.card !== null; }

  /** A primary press started on this card. A second press while one is held is ignored. */
  press(card: string) {
    if (this.card !== null) return;
    this.disarm();
    this.card = card;
    this.last = this.lastPress = this.clock.now();
    this.held = 0;
    this.ev.arm();
    this.ev.progress(0);
    this.frame = this.clock.raf(this.tick);
  }

  /** The press ended (pointer up, key up). Before the full hold this is a cancel. */
  release() { this.cancel(); }

  /** Blur, hidden tab, lost pointer capture, pointer cancel, or the card going away. */
  cancel() {
    if (this.card === null) return;
    this.stop();
    this.ev.progress(0);
    this.ev.cancel();
  }

  /** The button now belongs to this card. A hold or an armed confirm for any other card is dropped. */
  retarget(card: string) {
    if (this.card !== null && this.card !== card) this.cancel();
    if (this.armed && this.armed.card !== card) this.disarm();
  }

  /** A bare activation with no press before it (screen readers, switch access). Arms, then launches. */
  assistive(card: string) {
    const now = this.clock.now();
    if (this.card !== null || now - this.lastPress < CLICK_AFTER_PRESS_MS) return;
    if (this.armed && this.armed.card === card && now < this.armed.until) {
      this.disarm();
      this.ev.launch(card);
      return;
    }
    this.disarm();
    this.armed = { card, until: now + CONFIRM_MS, timer: this.clock.after(CONFIRM_MS, () => this.disarm()) };
    this.ev.confirm(card);
  }

  dispose() {
    if (this.card !== null) this.stop();
    if (this.armed) this.clock.clear(this.armed.timer);
    this.armed = null;
  }

  private disarm() {
    if (!this.armed) return;
    this.clock.clear(this.armed.timer);
    this.armed = null;
    this.ev.confirm(null);
  }

  private stop() {
    this.clock.caf(this.frame);
    this.card = null;
    this.lastPress = this.clock.now();
  }

  private tick = () => {
    if (this.card === null) return;
    const now = this.clock.now();
    this.held += Math.min(MAX_FRAME_MS, Math.max(0, now - this.last));
    this.last = now;
    const f = Math.min(1, this.held / this.ms);
    this.ev.progress(f);
    if (f < 1) { this.frame = this.clock.raf(this.tick); return; }
    const card = this.card;
    this.stop();
    this.ev.launch(card);
  };
}
