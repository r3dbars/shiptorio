import { BRAND } from "../copy";

// Original Foundry vector art. See scripts/brand/build.py and docs/art/FOUNDRY-BRAND.md.
const VECTOR = { imageRendering: "auto" } as const;

type Props = { className?: string; decorative?: boolean };

export function Wordmark({ width = 300, className, decorative }: Props & { width?: number }) {
  return (
    <img
      src="/brand/wordmark.svg?v=foundry-o2"
      width={width}
      height={Math.round((width * 240) / 1085)}
      alt={decorative ? "" : BRAND.wordmarkAlt}
      aria-hidden={decorative || undefined}
      className={className}
      style={VECTOR}
      draggable={false}
    />
  );
}

export function Mark({ size = 32, className, decorative }: Props & { size?: number }) {
  return (
    <img
      src="/brand/mark.svg?v=foundry-s3"
      width={size}
      height={size}
      alt={decorative ? "" : BRAND.markAlt}
      aria-hidden={decorative || undefined}
      className={className}
      style={VECTOR}
      draggable={false}
    />
  );
}
