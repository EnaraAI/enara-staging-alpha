// Friendly picture library for the kids screens: simple shapes only (no emoji, no external images),
// so every picture renders the same on every device. All pictures are decorative (aria-hidden); the button
// or tile that holds a picture carries the accessible name.
import { cn } from '@/lib/utils';

type P = { className?: string };
const ink = 'oklch(0.28 0.06 285)';

export function Apple({ className, color = 'red', box }: P & { color?: 'red' | 'green'; box?: { x: number; y: number; size: number } }) {
  const body = color === 'red' ? 'oklch(0.62 0.21 25)' : 'oklch(0.72 0.17 135)';
  const shade = color === 'red' ? 'oklch(0.52 0.19 25)' : 'oklch(0.6 0.15 135)';
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden {...(box ? { x: box.x, y: box.y, width: box.size, height: box.size } : {})}>
      <path d="M50 28c-6-6-26-8-32 10-6 18 6 46 20 50 6 2 9-1 12-1s6 3 12 1c14-4 26-32 20-50-6-18-26-16-32-10Z" fill={body} />
      <path d="M50 28c-6-6-26-8-32 10-3 9-2 20 2 30 4-16 14-28 30-30Z" fill={shade} opacity="0.35" />
      <ellipse cx="33" cy="44" rx="5" ry="9" fill="white" opacity="0.55" transform="rotate(20 33 44)" />
      <path d="M50 30c0-8 2-14 6-18" stroke="oklch(0.42 0.07 60)" strokeWidth="5" strokeLinecap="round" fill="none" />
      <path d="M56 20c6-8 16-9 22-6-4 8-14 11-22 6Z" fill="oklch(0.66 0.17 145)" />
    </svg>
  );
}

export function Banana({ className }: P) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <path d="M22 30c4 30 28 50 60 40 6-2 6-8 0-8-26 4-44-12-50-34-2-6-11-6-10 2Z" fill="oklch(0.88 0.16 95)" stroke="oklch(0.72 0.15 85)" strokeWidth="3" strokeLinejoin="round" />
      <path d="M30 40c8 16 22 26 42 26" stroke="oklch(0.78 0.15 88)" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M22 30l-2-8 6-2 4 6" fill="oklch(0.45 0.07 60)" />
    </svg>
  );
}

export function Ball({ className, color = 'red' }: P & { color?: 'red' | 'blue' }) {
  const c = color === 'red' ? 'oklch(0.62 0.21 25)' : 'oklch(0.62 0.15 240)';
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <circle cx="50" cy="52" r="34" fill={c} />
      <path d="M18 44c20 8 44 8 64 0M22 70c18-6 38-6 56 0" stroke="white" strokeWidth="6" fill="none" strokeLinecap="round" />
      <ellipse cx="38" cy="34" rx="8" ry="5" fill="white" opacity="0.45" transform="rotate(-25 38 34)" />
    </svg>
  );
}

export function Sun({ className, face = true }: P & { face?: boolean }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <g stroke="oklch(0.8 0.17 80)" strokeWidth="6" strokeLinecap="round">
        {Array.from({ length: 8 }, (_, i) => {
          const a = (i * Math.PI) / 4;
          return <line key={i} x1={50 + Math.cos(a) * 32} y1={50 + Math.sin(a) * 32} x2={50 + Math.cos(a) * 44} y2={50 + Math.sin(a) * 44} />;
        })}
      </g>
      <circle cx="50" cy="50" r="25" fill="oklch(0.88 0.17 90)" />
      {face && (
        <g>
          <circle cx="42" cy="46" r="3" fill={ink} /><circle cx="58" cy="46" r="3" fill={ink} />
          <path d="M41 56c5 6 13 6 18 0" stroke={ink} strokeWidth="3" fill="none" strokeLinecap="round" />
          <circle cx="36" cy="54" r="3.5" fill="oklch(0.75 0.13 25)" opacity="0.6" /><circle cx="64" cy="54" r="3.5" fill="oklch(0.75 0.13 25)" opacity="0.6" />
        </g>
      )}
    </svg>
  );
}

export function Cat({ className }: P) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <path d="M22 40 26 12l20 16Z M78 40 74 12 54 28Z" fill="oklch(0.78 0.12 60)" />
      <path d="M27 20l3 12 8-5Z M73 20l-3 12-8-5Z" fill="oklch(0.85 0.06 20)" />
      <ellipse cx="50" cy="52" rx="32" ry="28" fill="oklch(0.8 0.12 62)" />
      <circle cx="39" cy="48" r="4" fill={ink} /><circle cx="61" cy="48" r="4" fill={ink} />
      <circle cx="40.5" cy="46.5" r="1.3" fill="white" /><circle cx="62.5" cy="46.5" r="1.3" fill="white" />
      <path d="M47 57h6l-3 3Z" fill="oklch(0.6 0.15 15)" />
      <path d="M50 60c-2 4-7 4-9 2M50 60c2 4 7 4 9 2" stroke={ink} strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M30 58h-14M30 62l-12 4M70 58h14M70 62l12 4" stroke={ink} strokeWidth="1.6" strokeLinecap="round" opacity="0.6" />
    </svg>
  );
}

export function Tree({ className }: P) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <rect x="44" y="58" width="12" height="30" rx="4" fill="oklch(0.5 0.08 55)" />
      <circle cx="50" cy="40" r="26" fill="oklch(0.68 0.16 145)" />
      <circle cx="32" cy="52" r="15" fill="oklch(0.64 0.16 145)" /><circle cx="68" cy="52" r="15" fill="oklch(0.64 0.16 145)" />
      <circle cx="40" cy="36" r="4" fill="oklch(0.62 0.21 25)" /><circle cx="60" cy="46" r="4" fill="oklch(0.62 0.21 25)" /><circle cx="48" cy="54" r="4" fill="oklch(0.62 0.21 25)" />
    </svg>
  );
}

/** Colour swatch as a friendly paint splat. */
export function Splat({ className, color }: P & { color: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <path d="M50 14c10 0 12 10 20 10s16 8 12 18 4 14 0 24-14 10-20 14-16 6-24 0-18-4-22-14 2-16-2-24 4-18 14-18 12-10 22-10Z" fill={color} />
      <ellipse cx="38" cy="36" rx="8" ry="5" fill="white" opacity="0.35" transform="rotate(-30 38 36)" />
    </svg>
  );
}

/** Yassin's avatar: a smiling boy with a cap. */
export function KidAvatar({ className }: P) {
  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden>
      <circle cx="60" cy="60" r="58" fill="oklch(0.93 0.06 170)" />
      <path d="M22 112c6-22 22-30 38-30s32 8 38 30a58 58 0 0 1-76 0Z" fill="oklch(0.56 0.2 292)" />
      <circle cx="60" cy="56" r="28" fill="oklch(0.78 0.08 55)" />
      <circle cx="31" cy="58" r="6" fill="oklch(0.74 0.08 55)" /><circle cx="89" cy="58" r="6" fill="oklch(0.74 0.08 55)" />
      <path d="M32 46c0-18 12-26 28-26s28 8 28 26c-10-6-22-8-30-8s-18 2-26 8Z" fill="oklch(0.3 0.04 50)" />
      <path d="M30 42c2-16 14-24 30-24s28 8 30 24H30Z" fill="oklch(0.87 0.16 92)" />
      <path d="M80 42h22c2 0 2 4 0 5l-22 2Z" fill="oklch(0.8 0.16 80)" />
      <circle cx="50" cy="58" r="3.6" fill={ink} /><circle cx="70" cy="58" r="3.6" fill={ink} />
      <path d="M49 68c6 7 16 7 22 0" stroke={ink} strokeWidth="3.4" fill="none" strokeLinecap="round" />
      <circle cx="43" cy="66" r="4" fill="oklch(0.72 0.12 25)" opacity="0.5" /><circle cx="77" cy="66" r="4" fill="oklch(0.72 0.12 25)" opacity="0.5" />
    </svg>
  );
}

/** Nour the owl: the kids' tutor character. */
export function Owl({ className }: P) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <path d="M22 30 28 12l14 12Z M78 30 72 12 58 24Z" fill="oklch(0.5 0.17 292)" />
      <ellipse cx="50" cy="56" rx="34" ry="36" fill="oklch(0.56 0.2 292)" />
      <ellipse cx="50" cy="66" rx="20" ry="22" fill="oklch(0.86 0.07 292)" />
      <circle cx="36" cy="42" r="13" fill="white" /><circle cx="64" cy="42" r="13" fill="white" />
      <circle cx="38" cy="43" r="6" fill={ink} /><circle cx="62" cy="43" r="6" fill={ink} />
      <circle cx="40" cy="41" r="2" fill="white" /><circle cx="64" cy="41" r="2" fill="white" />
      <path d="M45 52h10l-5 7Z" fill="oklch(0.82 0.16 80)" />
      <path d="M40 74c4 3 8 3 10 0M50 74c4 3 8 3 10 0M44 82c4 3 8 3 10 0" stroke="oklch(0.7 0.1 292)" strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  );
}

/** A big friendly star (bigger and brighter than the shell's Star). */
export function BigStar({ className, dim }: P & { dim?: boolean }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <path d="M50 8l12.4 25.1 27.7 4-20 19.6 4.7 27.6L50 71.3 25.2 84.3l4.7-27.6-20-19.6 27.7-4Z" fill={dim ? 'var(--muted)' : 'oklch(0.87 0.17 90)'} stroke={dim ? 'var(--border)' : 'oklch(0.74 0.16 80)'} strokeWidth="4" strokeLinejoin="round" />
      {!dim && <>
        <circle cx="42" cy="48" r="3.4" fill={ink} /><circle cx="58" cy="48" r="3.4" fill={ink} />
        <path d="M43 57c4 4 10 4 14 0" stroke={ink} strokeWidth="3" fill="none" strokeLinecap="round" />
        <path d="M34 30l5 6" stroke="white" strokeWidth="4" strokeLinecap="round" opacity="0.7" />
      </>}
    </svg>
  );
}

/** Sticker earned for finishing the fruit words. */
export function FruitSticker({ className }: P) {
  return (
    <svg viewBox="0 0 160 160" className={className} aria-hidden>
      <path d="M58 120 44 156l18-8 10 14 8-36Z M102 120l14 36-18-8-10 14-8-36Z" fill="oklch(0.56 0.2 292)" />
      <g>
        {Array.from({ length: 16 }, (_, i) => {
          const a = (i * Math.PI) / 8;
          return <circle key={i} cx={80 + Math.cos(a) * 58} cy={72 + Math.sin(a) * 58} r="12" fill="oklch(0.87 0.17 90)" />;
        })}
      </g>
      <circle cx="80" cy="72" r="60" fill="oklch(0.87 0.17 90)" />
      <circle cx="80" cy="72" r="48" fill="white" stroke="oklch(0.74 0.16 80)" strokeWidth="4" strokeDasharray="6 6" />
      <Apple box={{ x: 38, y: 30, size: 84 }} />
    </svg>
  );
}

/** Confetti and stars bursting out: purely decorative, sits behind the celebration. */
export function Confetti({ className }: P) {
  const bits = [
    { x: 8, y: 18, r: 20, c: 'var(--chart-1)', s: 'rect' }, { x: 22, y: 6, r: -15, c: 'var(--chart-2)', s: 'tri' },
    { x: 40, y: 12, r: 40, c: 'var(--chart-5)', s: 'dot' }, { x: 62, y: 4, r: 10, c: 'var(--chart-3)', s: 'rect' },
    { x: 80, y: 14, r: -30, c: 'var(--chart-4)', s: 'tri' }, { x: 92, y: 30, r: 25, c: 'var(--chart-2)', s: 'dot' },
    { x: 4, y: 46, r: 60, c: 'var(--chart-3)', s: 'tri' }, { x: 95, y: 58, r: -40, c: 'var(--chart-5)', s: 'rect' },
    { x: 12, y: 74, r: 15, c: 'var(--chart-4)', s: 'dot' }, { x: 86, y: 82, r: 70, c: 'var(--chart-1)', s: 'tri' },
    { x: 30, y: 90, r: -20, c: 'var(--chart-2)', s: 'rect' }, { x: 70, y: 94, r: 35, c: 'var(--chart-3)', s: 'dot' },
  ];
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className={cn('pointer-events-none', className)} aria-hidden>
      {bits.map((b, i) => (
        <g key={i} transform={`translate(${b.x} ${b.y}) rotate(${b.r})`}>
          {b.s === 'rect' && <rect x="-2.2" y="-1" width="4.4" height="2" rx="0.6" fill={b.c} />}
          {b.s === 'dot' && <circle r="1.6" fill={b.c} />}
          {b.s === 'tri' && <path d="M0-2 2 1.6h-4Z" fill={b.c} />}
        </g>
      ))}
    </svg>
  );
}

/** Rays behind the stars. */
export function Burst({ className }: P) {
  return (
    <svg viewBox="0 0 200 200" className={className} aria-hidden>
      {Array.from({ length: 12 }, (_, i) => (
        <path key={i} d="M100 100 92 6h16Z" fill="oklch(0.87 0.17 90)" opacity="0.35" transform={`rotate(${i * 30} 100 100)`} />
      ))}
      <circle cx="100" cy="100" r="54" fill="oklch(0.87 0.17 90)" opacity="0.25" />
    </svg>
  );
}

/** Little step pictograms for the "today" path. */
export function StepIcon({ kind, className }: P & { kind: 'listen' | 'look' | 'talk' | 'star' }) {
  if (kind === 'star') return <BigStar className={className} />;
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
      {kind === 'listen' && <><path d="M10 28v-6a14 14 0 0 1 28 0v6" /><rect x="7" y="26" width="8" height="12" rx="3" fill="currentColor" /><rect x="33" y="26" width="8" height="12" rx="3" fill="currentColor" /></>}
      {kind === 'look' && <><path d="M4 24s8-12 20-12 20 12 20 12-8 12-20 12S4 24 4 24Z" /><circle cx="24" cy="24" r="5" fill="currentColor" /></>}
      {kind === 'talk' && <><path d="M8 12h32v20H22l-8 7v-7H8Z" /><circle cx="17" cy="22" r="1.5" fill="currentColor" /><circle cx="24" cy="22" r="1.5" fill="currentColor" /><circle cx="31" cy="22" r="1.5" fill="currentColor" /></>}
    </svg>
  );
}
