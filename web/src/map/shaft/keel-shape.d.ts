export const TOP: number;
export const TIP_Y: number;
export const CX: number;
export const FRONT_TOP: number;
export const FRONT_TIP: number;
export const R_TOP: number;
export const R_TIP: number;
export function radius(y: number): number;
export function front(y: number): number;
export function inside(x: number, y: number): boolean;
export const TIP: [number, number, number];
export const SOCKET: [number, number, number];
export const BANDS: number[];
export interface Crack { at: [number, number, number]; dir: [number, number]; len: number }
export const CRACKS: Crack[];
export interface Lip { at: [number, number, number]; side: -1 | 0 | 1; kind: "water" | "slag" }
export const LIPS: Lip[];
export const SMOG_TOP: number;
export function profile(n?: number): [number, number, number][];
export const KEEL: {
  TOP: number; TIP_Y: number; CX: number; TIP: [number, number, number]; SOCKET: [number, number, number]; BANDS: number[];
  CRACKS: Crack[]; LIPS: Lip[]; SMOG_TOP: number; radius: typeof radius; front: typeof front; inside: typeof inside; profile: typeof profile;
};
export default KEEL;
