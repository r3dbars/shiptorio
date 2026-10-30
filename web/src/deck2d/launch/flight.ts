// Visual flight choreography in seconds. No simulation or launch-permit decisions. Ignition, ascent and the climb's curve
// follow ?feel=rocketX (feel.ts; A is today's 1.4, 5.5, u^2).
import { FEEL } from "../feel";
export const FLIGHT = { ignition: FEEL.rocket.ignition, ascent: FEEL.rocket.ascent, coast: 2, landing: 8, settle: 1.3 } as const;
export const FLIGHT_SECONDS = Object.values(FLIGHT).reduce((a, b) => a + b, 0);
export function flightPose(age: number) {
  if (age >= FLIGHT_SECONDS) return { stage: "ready", u: 1, y: 0, x: 0, lean: 0, legs: 1 };
  let t = Math.max(0, age);
  if (t < FLIGHT.ignition) return { stage: "ignition", u: t / FLIGHT.ignition, y: 0, x: 0, lean: 0, legs: 0 };
  t -= FLIGHT.ignition;
  if (t < FLIGHT.ascent) { const u = t / FLIGHT.ascent; return { stage: "ascent", u, y: -Math.round(320 * u ** FEEL.rocket.curve), x: 0, lean: 0, legs: 0 }; }
  t -= FLIGHT.ascent;
  if (t < FLIGHT.coast) {
    const u = t / FLIGHT.coast;
    return { stage: "coast", u, y: -320 - Math.round(30 * Math.sin(Math.PI * u)), x: Math.round(24 * u * u * (3 - 2 * u)), lean: 0, legs: 0 };
  }
  t -= FLIGHT.coast;
  if (t < FLIGHT.landing) {
    const u = t / FLIGHT.landing, remain = 1 - u;
    return { stage: "landing", u, y: -Math.round(320 * remain * remain), x: Math.round(24 * remain * remain), lean: Math.round(5 * remain * Math.sin(u * 10)), legs: Math.min(1, Math.max(0, (u - 0.55) / 0.3)) };
  }
  t -= FLIGHT.landing;
  return { stage: t < FLIGHT.settle ? "settle" : "ready", u: Math.min(1, t / FLIGHT.settle), y: 0, x: 0, lean: 0, legs: 1 };
}
