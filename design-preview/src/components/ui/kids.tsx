// Kids (under 9) components. Rules: every tap target is at least 75 x 75 px; text 18-19 px; icon and sound over text;
// feedback on every tap (squish + pop via .kid-pressable); never placed at the bottom edge; one main action per screen.
import * as React from 'react';
import { Button as AriaButton, type ButtonProps } from 'react-aria-components';
import { Volume2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const tones = {
  primary: 'bg-primary text-primary-foreground shadow-[0_6px_0_oklch(0.42_0.18_292)]',
  sun: 'bg-accent text-accent-foreground shadow-[0_6px_0_oklch(0.72_0.15_85)]',
  mint: 'bg-secondary text-secondary-foreground shadow-[0_6px_0_oklch(0.8_0.08_170)]',
  white: 'bg-card text-foreground border-2 shadow-[0_6px_0_var(--border)]',
  success: 'bg-success text-success-foreground shadow-[0_6px_0_oklch(0.52_0.15_150)]',
};

/** The one big action of a kids screen, or a picture choice. Min 75 x 75 px, pressed state moves down onto its shadow. */
export function KidButton({ tone = 'primary', className, children, ...p }: ButtonProps & { tone?: keyof typeof tones; children?: React.ReactNode }) {
  return (
    <AriaButton
      {...p}
      className={cn(
        'kid-pressable inline-flex min-h-[75px] min-w-[75px] select-none items-center justify-center gap-3 rounded-2xl px-6 text-xl font-bold outline-none transition-transform',
        'data-[pressed]:translate-y-1 data-[pressed]:shadow-none data-[focus-visible]:ring-4 data-[focus-visible]:ring-ring [&_svg]:size-9',
        tones[tone], className,
      )}
    >
      {children}
    </AriaButton>
  );
}

/** "Hear it" button: every instruction can be listened to. 75 x 75. */
export function SpeakButton({ label, className, ...p }: ButtonProps & { label: string }) {
  return (
    <AriaButton {...p} aria-label={label} className={cn('kid-pressable grid size-[75px] shrink-0 place-items-center rounded-full bg-accent text-accent-foreground shadow-[0_5px_0_oklch(0.72_0.15_85)] outline-none data-[pressed]:translate-y-1 data-[pressed]:shadow-none data-[focus-visible]:ring-4 data-[focus-visible]:ring-ring', className)}>
      <Volume2 className="size-9" />
    </AriaButton>
  );
}

/** Steps in a lesson as big dots (no numbers to read). */
export function KidSteps({ total, done, label }: { total: number; done: number; label: string }) {
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} className="flex items-center gap-2">
      {Array.from({ length: total }, (_, i) => <span key={i} className={cn('h-4 rounded-full transition-all', i < done ? 'w-8 bg-success' : i === done ? 'w-8 bg-primary' : 'w-4 bg-border')} />)}
    </div>
  );
}

/** A friendly picture tile: emoji-free illustration made of shapes so it renders the same everywhere. */
export function PictureTile({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('grid place-items-center rounded-2xl bg-card border-2 shadow-[0_6px_0_var(--border)]', className)}>{children}</div>;
}
