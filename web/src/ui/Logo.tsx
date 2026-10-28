import { BRAND } from "../copy";

// Approved polished wordmark; compact vector seal stays crisp at icon sizes.
const VECTOR = { imageRendering: "auto" } as const;

type Props = { className?: string; decorative?: boolean };

export function Wordmark({ width = 300, className, decorative }: Props & { width?: number }) {
  return (
    <img
      src="/brand/wordmark-polished.webp"
      width={width}
      height={Math.round(width / 3)}
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
