import type * as THREE from "three";
import type { Iron } from "./core";
export function artPass(): boolean;
export function buildout(): boolean;
export interface FollowOpts { wrap?: THREE.Texture; span?: number; zoom?: number; vh0?: number; home?: [number, number, number] }
export interface Backdrop {
  follow(obj: THREE.Object3D, factor: number, opts?: FollowOpts): unknown;
  dim(m: THREE.Material | THREE.Material[], floor?: number): void;
  calm(): boolean;
  artPass: typeof artPass;
  buildout: typeof buildout;
}
export function backdrop(I: Iron, root: THREE.Object3D): Backdrop;
export const ORDER: Record<"sky" | "skyFar" | "skyMid" | "skyNear" | "flotilla" | "smog" | "haze", number>;
export const Z: { skyFar: number; skyMid: number; skyNear: number; flotilla: [number, number]; smog: [number, number]; haze: number };
declare const _default: { artPass: typeof artPass; buildout: typeof buildout; backdrop: typeof backdrop; ORDER: typeof ORDER; Z: typeof Z };
export default _default;
