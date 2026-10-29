// Visual flight choreography in seconds. No simulation or launch-permit decisions.
export const FLIGHT = { ignition: 1.4, ascent: 2.2, coast: 2, landing: 4.5, settle: 1.3 } as const;
export const FLIGHT_SECONDS = Object.values(FLIGHT).reduce((a, b) => a + b, 0);
export function flightPose(age: number) {
  if (age >= FLIGHT_SECONDS) return { stage: "ready", u: 1, y: 0, x: 0, lean: 0, legs: 1 };
  let t = Math.max(0, age);
  if (t < FLIGHT.ignition) return { stage: "ignition", u: t / FLIGHT.ignition, y: 0, x: 0, lean: 0, legs: 0 };
  t -= FLIGHT.ignition;
  if (t < FLIGHT.ascent) { const u = t / FLIGHT.ascent; return { stage: "ascent", u, y: -Math.round(320 * u * u), x: 0, lean: 0, legs: 0 }; }
  t -= FLIGHT.ascent;
  if (t < FLIGHT.coast) return { stage: "coast", u: t / FLIGHT.coast, y: -320, x: 0, lean: 0, legs: 0 };
  t -= FLIGHT.coast;
  if (t < FLIGHT.landing) {
    const u = t / FLIGHT.landing, remain = 1 - u;
    return { stage: "landing", u, y: -Math.round(260 * remain * remain), x: Math.round(24 * remain * remain), lean: Math.round(5 * remain * Math.sin(u * 10)), legs: Math.min(1, Math.max(0, (u - 0.55) / 0.3)) };
  }
  t -= FLIGHT.landing;
  return { stage: t < FLIGHT.settle ? "settle" : "ready", u: Math.min(1, t / FLIGHT.settle), y: 0, x: 0, lean: 0, legs: 1 };
}
