import { BRAND } from "../copy";

// Approved polished wordmark.
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
