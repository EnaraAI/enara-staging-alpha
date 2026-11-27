// ENARA UI kit: shadcn/ui-style components built on React Aria Components (accessible behaviour, keyboard, focus,
// RTL-aware) and styled only with the semantic tokens in styles.css. One file to keep the preview easy to read.
import * as React from 'react';
import {
  Button as AriaButton, type ButtonProps as AriaButtonProps,
  Link as AriaLink, type LinkProps as AriaLinkProps,
  TextField as AriaTextField, Input as AriaInput, TextArea as AriaTextArea, Label as AriaLabel, Text as AriaText, FieldError as AriaFieldError,
  Switch as AriaSwitch, type SwitchProps as AriaSwitchProps,
  Checkbox as AriaCheckbox, type CheckboxProps as AriaCheckboxProps,
  Tabs as AriaTabs, TabList as AriaTabList, Tab as AriaTab, TabPanel as AriaTabPanel,
  type TabsProps, type TabListProps, type TabProps, type TabPanelProps,
  ProgressBar as AriaProgressBar, Meter as AriaMeter,
  Select as AriaSelect, SelectValue, Popover as AriaPopover, ListBox, ListBoxItem,
  RadioGroup as AriaRadioGroup, Radio as AriaRadio,
  ToggleButton as AriaToggleButton, type ToggleButtonProps,
  SearchField as AriaSearchField,
  Table as AriaTable, TableHeader as AriaTableHeader, TableBody as AriaTableBody, Column as AriaColumn, Row as AriaRow, Cell as AriaCell,
  type TableProps, type ColumnProps, type RowProps, type CellProps,
  composeRenderProps,
} from 'react-aria-components';
import { cva, type VariantProps } from 'class-variance-authority';
import { Check, ChevronDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------- Button
export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-semibold transition-[background,box-shadow,transform] outline-none select-none data-[focus-visible]:ring-2 data-[focus-visible]:ring-ring data-[focus-visible]:ring-offset-2 data-[focus-visible]:ring-offset-background data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed data-[pressed]:scale-[0.98] [&_svg]:size-[1.15em] [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground data-[hovered]:bg-primary/90 shadow-sm',
        accent: 'bg-accent text-accent-foreground data-[hovered]:bg-accent/90 shadow-sm',
        secondary: 'bg-secondary text-secondary-foreground data-[hovered]:bg-secondary/80',
        outline: 'border border-input bg-card data-[hovered]:bg-muted',
        ghost: 'data-[hovered]:bg-muted',
        destructive: 'bg-destructive text-destructive-foreground data-[hovered]:bg-destructive/90',
        success: 'bg-success text-success-foreground data-[hovered]:bg-success/90',
        link: 'text-primary underline-offset-4 data-[hovered]:underline px-0',
      },
      size: {
        sm: 'h-8 px-3 text-sm',
        default: 'min-h-tap px-4 text-sm',
        lg: 'min-h-12 px-6 text-base',
        icon: 'size-tap',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);
export interface ButtonProps extends AriaButtonProps, VariantProps<typeof buttonVariants> {}
export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <AriaButton {...props} className={composeRenderProps(className as string | undefined, (c) => cn(buttonVariants({ variant, size }), c))} />;
}
export function LinkButton({ className, variant, size, ...props }: AriaLinkProps & VariantProps<typeof buttonVariants>) {
  return <AriaLink {...props} className={composeRenderProps(className as string | undefined, (c) => cn(buttonVariants({ variant, size }), c))} />;
}

// ---------------------------------------------------------------- Card
export const Card = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn('rounded-xl border bg-card text-card-foreground shadow-[0_1px_2px_rgb(0_0_0/0.04)]', className)} {...p} />;
export const CardHeader = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn('flex flex-col gap-1 p-5 pb-3', className)} {...p} />;
export const CardTitle = ({ className, ...p }: React.HTMLAttributes<HTMLHeadingElement>) => <h3 className={cn('text-base font-bold leading-tight', className)} {...p} />;
export const CardDescription = ({ className, ...p }: React.HTMLAttributes<HTMLParagraphElement>) => <p className={cn('text-sm text-muted-foreground', className)} {...p} />;
export const CardContent = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn('p-5 pt-0', className)} {...p} />;
export const CardFooter = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn('flex items-center gap-2 p-5 pt-0', className)} {...p} />;

// ---------------------------------------------------------------- Badge
export const badgeVariants = cva('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap [&_svg]:size-3.5', {
  variants: {
    tone: {
      neutral: 'bg-muted text-muted-foreground',
      primary: 'bg-primary text-primary-foreground',
      info: 'bg-info-soft text-info',
      success: 'bg-success-soft text-success',
      warning: 'bg-warning-soft text-warning-foreground',
      danger: 'bg-destructive-soft text-destructive',
      accent: 'bg-accent text-accent-foreground',
      outline: 'border text-foreground',
    },
  },
  defaultVariants: { tone: 'neutral' },
});
export const Badge = ({ className, tone, ...p }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) => <span className={cn(badgeVariants({ tone }), className)} {...p} />;

// ---------------------------------------------------------------- Fields
export const Label = ({ className, ...p }: React.ComponentProps<typeof AriaLabel>) => <AriaLabel className={cn('text-sm font-semibold', className)} {...p} />;
export const inputClass = 'w-full min-h-tap rounded-lg border border-input bg-card px-3 text-sm outline-none placeholder:text-muted-foreground data-[focused]:ring-2 data-[focused]:ring-ring data-[invalid]:border-destructive';
export function TextField({ label, description, error, placeholder, className, multiline, ...props }: React.ComponentProps<typeof AriaTextField> & { label?: string; description?: string; error?: string; placeholder?: string; multiline?: boolean }) {
  return (
    <AriaTextField {...props} className={cn('flex flex-col gap-1.5', className as string)}>
      {label && <Label>{label}</Label>}
      {multiline ? <AriaTextArea placeholder={placeholder} className={cn(inputClass, 'py-2 min-h-24')} /> : <AriaInput placeholder={placeholder} className={inputClass} />}
      {description && <AriaText slot="description" className="text-xs text-muted-foreground">{description}</AriaText>}
      <AriaFieldError className="text-xs text-destructive">{error}</AriaFieldError>
    </AriaTextField>
  );
}
export function SearchField({ placeholder, className, ...p }: React.ComponentProps<typeof AriaSearchField> & { placeholder?: string }) {
  return (
    <AriaSearchField {...p} className={cn('relative', className as string)}>
      <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <AriaInput placeholder={placeholder} className={cn(inputClass, 'ps-9')} />
    </AriaSearchField>
  );
}

// ---------------------------------------------------------------- Switch / Checkbox / Radio
export function Switch({ children, className, ...p }: AriaSwitchProps & { children?: React.ReactNode }) {
  return (
    <AriaSwitch {...p} className={cn('group flex items-center gap-3 text-sm min-h-tap', className as string)}>
      <span className="relative inline-flex h-6 w-11 shrink-0 rounded-full bg-input transition-colors group-data-[selected]:bg-success group-data-[focus-visible]:ring-2 group-data-[focus-visible]:ring-ring">
        <span className="absolute top-0.5 start-0.5 size-5 rounded-full bg-white shadow transition-transform group-data-[selected]:translate-x-5 rtl:group-data-[selected]:-translate-x-5" />
      </span>
      {children}
    </AriaSwitch>
  );
}
export function Checkbox({ children, className, ...p }: AriaCheckboxProps & { children?: React.ReactNode }) {
  return (
    <AriaCheckbox {...p} className={cn('group flex items-center gap-2 text-sm min-h-tap', className as string)}>
      <span className="grid size-5 place-items-center rounded-md border border-input bg-card group-data-[selected]:bg-primary group-data-[selected]:border-primary group-data-[selected]:text-primary-foreground">
        <Check className="size-3.5 opacity-0 group-data-[selected]:opacity-100" strokeWidth={3} />
      </span>
      {children}
    </AriaCheckbox>
  );
}
export const RadioGroup = ({ className, ...p }: React.ComponentProps<typeof AriaRadioGroup>) => <AriaRadioGroup className={cn('flex flex-col gap-2', className as string)} {...p} />;
export function Radio({ children, className, ...p }: React.ComponentProps<typeof AriaRadio>) {
  return (
    <AriaRadio {...p} className={cn('group flex items-center gap-2 text-sm min-h-tap', className as string)}>
      <span className="grid size-5 place-items-center rounded-full border border-input group-data-[selected]:border-primary"><span className="size-2.5 rounded-full bg-primary opacity-0 group-data-[selected]:opacity-100" /></span>
      {children as React.ReactNode}
    </AriaRadio>
  );
}

// ---------------------------------------------------------------- Select
export function Select<T extends object>({ label, items, placeholder, className, ...p }: Omit<React.ComponentProps<typeof AriaSelect>, 'children'> & { label?: string; items: { id: string; name: string }[]; placeholder?: string }) {
  return (
    <AriaSelect {...p} placeholder={placeholder} className={cn('flex flex-col gap-1.5', className as string)}>
      {label && <Label>{label}</Label>}
      <AriaButton className={cn(inputClass, 'flex items-center justify-between gap-2 text-start')}>
        <SelectValue className="truncate data-[placeholder]:text-muted-foreground" />
        <ChevronDown className="size-4 text-muted-foreground" />
      </AriaButton>
      <AriaPopover className="min-w-[--trigger-width] rounded-lg border bg-popover p-1 shadow-lg">
        <ListBox items={items} className="outline-none">
          {(it) => <ListBoxItem id={it.id} className="cursor-default rounded-md px-2 py-1.5 text-sm outline-none data-[focused]:bg-muted data-[selected]:font-semibold">{it.name}</ListBoxItem>}
        </ListBox>
      </AriaPopover>
    </AriaSelect>
  );
}

// ---------------------------------------------------------------- Tabs / segmented
export const Tabs = (p: TabsProps) => <AriaTabs {...p} className={cn('flex flex-col gap-3', p.className as string)} />;
export const TabList = <T extends object>(p: TabListProps<T>) => <AriaTabList {...p} className={cn('inline-flex w-fit gap-1 rounded-lg bg-muted p-1', p.className as string)} />;
export const Tab = (p: TabProps) => <AriaTab {...p} className={cn('cursor-default rounded-md px-3 py-1.5 text-sm font-semibold text-muted-foreground outline-none data-[selected]:bg-card data-[selected]:text-foreground data-[selected]:shadow-sm data-[focus-visible]:ring-2 data-[focus-visible]:ring-ring', p.className as string)} />;
export const TabPanel = (p: TabPanelProps) => <AriaTabPanel {...p} className={cn('outline-none', p.className as string)} />;
export function Toggle({ className, ...p }: ToggleButtonProps) {
  return <AriaToggleButton {...p} className={composeRenderProps(className as string | undefined, (c) => cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'data-[selected]:bg-primary data-[selected]:text-primary-foreground data-[selected]:border-primary', c))} />;
}

// ---------------------------------------------------------------- Progress / Meter
export function Progress({ value, label, ariaLabel, showValue, tone = 'primary', className, size = 'md' }: { value: number; label?: string; ariaLabel?: string; showValue?: boolean; tone?: 'primary' | 'success' | 'warning' | 'danger' | 'accent' | 'info'; className?: string; size?: 'sm' | 'md' | 'lg' }) {
  const bar = { primary: 'bg-primary', success: 'bg-success', warning: 'bg-warning', danger: 'bg-destructive', accent: 'bg-accent', info: 'bg-info' }[tone];
  const h = { sm: 'h-1.5', md: 'h-2.5', lg: 'h-4' }[size];
  return (
    <AriaProgressBar value={value} aria-label={ariaLabel ?? label ?? 'progress'} className={cn('flex flex-col gap-1.5 w-full', className)}>
      {({ percentage, valueText }) => (
        <>
          {(label || showValue) && <div className="flex justify-between text-xs font-semibold"><span>{label}</span>{showValue && <span className="text-muted-foreground">{valueText}</span>}</div>}
          <div className={cn('w-full overflow-hidden rounded-full bg-muted', h)}><div className={cn('h-full rounded-full', bar)} style={{ width: `${percentage}%` }} /></div>
        </>
      )}
    </AriaProgressBar>
  );
}
export function Ring({ value, size = 64, stroke = 7, tone = 'var(--primary)', children, ariaLabel }: { value: number; size?: number; stroke?: number; tone?: string; children?: React.ReactNode; ariaLabel?: string }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  return (
    <AriaMeter value={value} aria-label={ariaLabel ?? 'progress'} className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90"><circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--muted)" strokeWidth={stroke} /><circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tone} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)} /></svg>
      <span className="absolute text-sm font-bold">{children}</span>
    </AriaMeter>
  );
}

// ---------------------------------------------------------------- Table (React Aria grid: keyboard, selection, sorting)
export const Table = (p: TableProps) => <AriaTable {...p} className={cn('w-full text-sm border-separate border-spacing-0', p.className as string)} />;
export const TableHeader = <T extends object>(p: React.ComponentProps<typeof AriaTableHeader<T>>) => <AriaTableHeader {...p} className={cn('text-muted-foreground', p.className as string)} />;
export const Column = (p: ColumnProps) => <AriaColumn {...p} className={cn('border-b px-3 py-2 text-start text-xs font-semibold uppercase tracking-wide outline-none', p.className as string)} />;
export const TableBody = <T extends object>(p: React.ComponentProps<typeof AriaTableBody<T>>) => <AriaTableBody {...p} />;
export const Row = <T extends object>(p: RowProps<T>) => <AriaRow {...p} className={cn('outline-none data-[hovered]:bg-muted/60 data-[selected]:bg-info-soft data-[focus-visible]:ring-2 data-[focus-visible]:ring-ring', p.className as string)} />;
export const Cell = (p: CellProps) => <AriaCell {...p} className={cn('border-b px-3 py-2.5 align-middle', p.className as string)} />;

// ---------------------------------------------------------------- Small pieces
export const Separator = ({ className }: { className?: string }) => <div role="separator" className={cn('h-px w-full bg-border', className)} />;
export function Avatar({ name, src, className, tone = 'bg-secondary text-secondary-foreground' }: { name: string; src?: string; className?: string; tone?: string }) {
  const initials = name.split(/\s+/).filter((w) => w && !/\.$/.test(w)).map((w) => w[0]).slice(0, 2).join(''); // skips titles like "Ms." or "أ."
  return src ? <img src={src} alt={name} className={cn('size-10 rounded-full object-cover', className)} /> : <span aria-hidden className={cn('grid size-10 shrink-0 place-items-center rounded-full text-sm font-bold', tone, className)}>{initials}</span>;
}
export function Alert({ tone = 'info', icon, title, children, className }: { tone?: 'info' | 'success' | 'warning' | 'danger'; icon?: React.ReactNode; title?: React.ReactNode; children?: React.ReactNode; className?: string }) {
  const t = { info: 'bg-info-soft text-info', success: 'bg-success-soft text-success', warning: 'bg-warning-soft text-warning-foreground', danger: 'bg-destructive-soft text-destructive' }[tone];
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('flex gap-3 rounded-lg p-3 text-sm', t, className)}>
      {icon && <span className="mt-0.5 shrink-0 [&_svg]:size-5">{icon}</span>}
      <div className="flex flex-col gap-0.5">{title && <p className="font-bold">{title}</p>}{children && <div className="text-foreground/80">{children}</div>}</div>
    </div>
  );
}
export const Skeleton = ({ className }: { className?: string }) => <div className={cn('animate-pulse rounded-md bg-muted', className)} />;
export const Kbd = ({ children }: { children: React.ReactNode }) => <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[0.75em]">{children}</kbd>;
export const Stat = ({ label, value, hint, className }: { label: React.ReactNode; value: React.ReactNode; hint?: React.ReactNode; className?: string }) => (
  <div className={cn('flex flex-col gap-1', className)}><span className="text-xs font-semibold text-muted-foreground">{label}</span><span className="text-2xl font-bold tabular-nums leading-none">{value}</span>{hint && <span className="text-xs text-muted-foreground">{hint}</span>}</div>
);
/** Icons that point in a reading direction (arrows, chevrons) must flip in RTL. */
export const Dir = ({ children }: { children: React.ReactNode }) => <span className="inline-flex rtl:-scale-x-100">{children}</span>;
