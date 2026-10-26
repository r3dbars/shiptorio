import { BRAND } from "../copy";

// The Black Iron brand art (docs/art/IRON-STYLE.md §7). Pixel art: always rendered with nearest-neighbor scaling.
// Wordmark art is 297x50; mark art is a 32x32 grid.
const PIXEL = { imageRendering: "pixelated" } as const;

type Props = { className?: string; decorative?: boolean };

export function Wordmark({ width = 300, className, decorative }: Props & { width?: number }) {
  return (
    <img
      src="/brand/wordmark.svg"
      width={width}
      height={Math.round((width * 50) / 297)}
      alt={decorative ? "" : BRAND.wordmarkAlt}
      aria-hidden={decorative || undefined}
      className={className}
      style={PIXEL}
      draggable={false}
    />
  );
}

export function Mark({ size = 32, className, decorative }: Props & { size?: number }) {
  return (
    <img
      src="/brand/mark.svg"
      width={size}
      height={size}
      alt={decorative ? "" : BRAND.markAlt}
      aria-hidden={decorative || undefined}
      className={className}
      style={PIXEL}
      draggable={false}
    />
  );
}
