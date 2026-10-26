import type { ItemKind } from "@shiptorio/shared";

// From the art direction doc.
export const PALETTE = {
  stone: 0xc9b48a,
  cliff: 0x3a4268,
  moss: 0x4f7d3b,
  steel: 0x8a94a3,
  amber: 0xf2a93b,
  green: 0x5bd18b,
  red: 0xff5e52,
  blue: 0x6fb2ff,
  void: 0x1b2448,
  dark: 0x2a2f45,
  white: 0xe8ecf1,
};

// Science colors: red bug fixes, green features, grey cleanup, blue tests.
export const KIND_COLOR: Record<ItemKind, number> = {
  bug: PALETTE.red,
  feature: PALETTE.green,
  cleanup: PALETTE.steel,
  tests: PALETTE.blue,
};

export const css = (hex: number) => `#${hex.toString(16).padStart(6, "0")}`;
