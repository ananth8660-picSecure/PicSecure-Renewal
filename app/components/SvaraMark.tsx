import { useId } from "react";

/** PicSecure Svara's mark: an S made of two voice crescents (one speaks, one listens). Same as the Svara app icon. */
export default function SvaraMark({ size = 20 }: { size?: number }) {
  const id = `svara-g-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return <svg width={size} height={size} viewBox="270 260 484 484" aria-hidden="true">
    <defs><linearGradient id={id} gradientUnits="userSpaceOnUse" x1="205" y1="0" x2="819" y2="1024"><stop offset="0" stopColor="#22D3EE" /><stop offset="0.35" stopColor="#3B6BFF" /><stop offset="0.7" stopColor="#7C4DFF" /><stop offset="1" stopColor="#E14BD2" /></linearGradient></defs>
    <path fill={`url(#${id})`} d="M 526.84 579.44 A 196.0 196.0 0 1 1 707.44 398.84 A 150.0 150.0 0 1 0 526.84 579.44 Z" />
    <path fill={`url(#${id})`} d="M 497.16 444.56 A 196.0 196.0 0 1 1 316.56 625.16 A 150.0 150.0 0 1 0 497.16 444.56 Z" />
  </svg>;
}
