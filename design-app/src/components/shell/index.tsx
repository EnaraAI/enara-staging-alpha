// Page shells. Every screen renders one shell; the shell adapts to phone (390 px) and desktop (1280 px) with Tailwind
// breakpoints (md = 768 px). All spacing uses logical properties (ps/pe/ms/me/start/end) so RTL needs no extra code.
import * as React from 'react';
import { Bell, ChevronLeft, Home, Languages, LogOut, Menu, Moon, Search, Settings, Volume2 } from 'lucide-react';
import { useSession } from '@/lib/session';
import { setLang } from '@/App';
import { cn } from '@/lib/utils';
import { EnaraLogo, EnaraMark } from '@/components/brand/EnaraLogo';
import { usePreview } from '@/lib/preview';
import { Avatar, Badge, Dir } from '@/components/ui';
import { KidButton } from '@/components/ui/kids';

/** ENARA's official logo (frontend/components/brand/EnaraLogo.tsx): the full lockup "Enara | إنارة", or the symbol alone
 *  when compact. Drawn in the current text colour (navy on light, white on the navy panels and in dark mode). */
export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  return compact
    ? <EnaraMark className={cn('h-7 w-auto shrink-0 text-primary', className)} title="ENARA" />
    : <EnaraLogo className={cn('h-8 w-auto shrink-0 text-primary', className)} />;
}

export interface NavItem { id: string; label: string; icon: React.ReactNode; badge?: string; href?: string }

/** Language switch and sign out: in every shell's header. */
export function SessionMenu({ compact }: { compact?: boolean }) {
  const { lang } = usePreview();
  const { user, logout } = useSession();
  if (!user) return null;
  return (
    <span className="flex items-center gap-1">
      <button type="button" onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')} className="inline-flex h-9 items-center gap-1 rounded-md px-2 text-xs font-bold hover:bg-muted" data-testid="lang-toggle" aria-label={lang === 'ar' ? 'English' : 'العربية'}><Languages className="size-4" />{!compact && (lang === 'ar' ? 'EN' : 'ع')}</button>
      <button type="button" onClick={() => { void logout().then(() => { window.location.hash = '#/login'; }); }} className="inline-flex h-9 items-center gap-1 rounded-md px-2 text-xs font-bold hover:bg-muted" data-testid="sign-out" aria-label={lang === 'ar' ? 'تسجيل الخروج' : 'Sign out'}><LogOut className="size-4 rtl:-scale-x-100" /></button>
    </span>
  );
}

/** Learners and parents: phone = top bar + bottom tab bar; desktop = side rail on the start side. */
export function AppShell({ title, subtitle, nav, active, children, actions, back, topExtra, bottomBar }: { title?: string; subtitle?: string; nav: NavItem[]; active: string; children: React.ReactNode; actions?: React.ReactNode; back?: boolean; topExtra?: React.ReactNode; bottomBar?: React.ReactNode }) {
  const { lang } = usePreview();
  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden md:flex w-64 shrink-0 flex-col gap-1 border-e bg-card p-4">
        <Logo className="mb-6 px-2" />
        {nav.map((n) => (
          <a key={n.id} href={n.href ?? '#'} aria-current={n.id === active ? 'page' : undefined} className={cn('flex items-center gap-3 rounded-lg px-3 min-h-tap text-sm font-semibold [&_svg]:size-5', n.id === active ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:bg-muted')}>
            {n.icon}<span className="flex-1">{n.label}</span>{n.badge && <Badge tone="accent">{n.badge}</Badge>}
          </a>
        ))}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b bg-card/90 px-4 py-3 backdrop-blur md:px-8">
          {back ? <a href="#" aria-label={lang === 'ar' ? 'رجوع' : 'Back'} className="grid size-tap place-items-center rounded-lg hover:bg-muted"><Dir><ChevronLeft className="size-5" /></Dir></a> : <Logo compact className="md:hidden" />}
          <div className="min-w-0 flex-1">
            {title && <h1 className="truncate text-lg font-bold leading-tight md:text-xl">{title}</h1>}
            {subtitle && <p className="truncate text-xs text-muted-foreground md:text-sm">{subtitle}</p>}
          </div>
          <SessionMenu compact />
          {actions ?? <a href="#" aria-label={lang === 'ar' ? 'الإشعارات' : 'Notifications'} className="relative grid size-tap place-items-center rounded-full hover:bg-muted"><Bell className="size-5" /><span className="absolute end-2 top-2 size-2 rounded-full bg-destructive" /></a>}
        </header>
        {topExtra}
        <main className="flex-1 px-4 py-5 md:px-8 md:py-8 md:pb-10">{children}</main>
        {/* Pinned to the bottom while scrolling (sticky, so it also sits at the page end in full-page screenshots).
            bottomBar: an optional bar pinned above the tabs, e.g. a chat input. */}
        {bottomBar && <div className="sticky bottom-[calc(3.75rem+max(env(safe-area-inset-bottom),0.5rem))] z-10 border-t bg-card/95 px-4 py-3 backdrop-blur md:bottom-0 md:px-8">{bottomBar}</div>}
        <nav className="sticky bottom-0 z-10 flex border-t bg-card/95 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-1 backdrop-blur md:hidden">
          {nav.slice(0, 5).map((n) => (
            <a key={n.id} href={n.href ?? '#'} aria-current={n.id === active ? 'page' : undefined} className={cn('flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1.5 text-[11px] font-semibold [&_svg]:size-6', n.id === active ? 'text-primary' : 'text-muted-foreground')}>
              {n.icon}<span>{n.label}</span>
            </a>
          ))}
        </nav>
      </div>
    </div>
  );
}

/** Teachers, school admins and platform admins: dense side navigation on desktop, menu button on phone. */
export function AdminShell({ title, subtitle, nav, active, children, actions, school, user, scopeLabel, searchPlaceholder }: { title: string; subtitle?: string; nav: NavItem[]; active: string; children: React.ReactNode; actions?: React.ReactNode; school: string; user: string; scopeLabel?: string; searchPlaceholder?: string }) {
  const { lang } = usePreview();
  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden lg:flex w-60 shrink-0 flex-col border-e bg-card">
        <div className="flex items-center gap-2 border-b px-4 py-3"><Logo /></div>
        <div className="px-3 py-3"><div className="rounded-lg bg-muted px-3 py-2"><p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{scopeLabel ?? (lang === 'ar' ? 'المدرسة' : 'School')}</p><p className="truncate text-sm font-semibold">{school}</p></div></div>
        <nav className="flex flex-1 flex-col gap-0.5 px-3">
          {nav.map((n) => (
            <a key={n.id} href={n.href ?? '#'} aria-current={n.id === active ? 'page' : undefined} className={cn('flex items-center gap-2.5 rounded-md px-2.5 h-9 text-sm font-medium [&_svg]:size-4', n.id === active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
              {n.icon}<span className="flex-1 truncate">{n.label}</span>{n.badge && <span className={cn('rounded-full px-1.5 text-[11px] font-bold', n.id === active ? 'bg-primary-foreground/20' : 'bg-accent text-accent-foreground')}>{n.badge}</span>}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2 border-t p-3"><Avatar name={user} className="size-8 text-xs" /><span className="truncate text-sm font-medium">{user}</span><Settings className="ms-auto size-4 text-muted-foreground" /></div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b bg-card/90 px-4 py-2.5 backdrop-blur lg:px-6">
          <a href="#" aria-label={lang === 'ar' ? 'القائمة' : 'Menu'} className="grid size-tap place-items-center rounded-md hover:bg-muted lg:hidden"><Menu className="size-5" /></a>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-bold lg:text-lg">{title}</h1>
            {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          <div className="hidden items-center gap-2 rounded-md border bg-background px-2.5 h-9 text-sm text-muted-foreground md:flex w-64"><Search className="size-4" />{searchPlaceholder ?? (lang === 'ar' ? 'ابحث عن طالب أو فصل…' : 'Search learners, classes…')}<kbd className="ms-auto rounded border px-1 text-[10px]">⌘K</kbd></div>
          {actions}
          <SessionMenu />
          <a href="#" aria-label={lang === 'ar' ? 'الإشعارات' : 'Notifications'} className="relative grid size-9 place-items-center rounded-md hover:bg-muted"><Bell className="size-4" /><span className="absolute end-1.5 top-1.5 size-2 rounded-full bg-destructive" /></a>
        </header>
        <main className="flex-1 px-4 py-5 lg:px-6 lg:py-6">{children}</main>
      </div>
    </div>
  );
}

/** Kids: top bar with big Home and Listen buttons; no navigation at the bottom edge; generous padding at the bottom. */
export function KidsShell({ children, title, listenLabel, homeLabel, stars }: { children: React.ReactNode; title?: string; listenLabel: string; homeLabel: string; stars?: number }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex items-center gap-3 px-4 pt-4 md:px-10 md:pt-6">
        <KidButton tone="white" aria-label={homeLabel} className="px-0" onPress={() => { window.location.hash = '#/kids'; }}><Home /></KidButton>
        <div className="min-w-0 flex-1 text-center">{title && <h1 className="truncate text-2xl font-extrabold">{title}</h1>}</div>
        {stars !== undefined && <span className="flex h-[75px] items-center gap-2 rounded-2xl bg-card px-4 text-2xl font-extrabold border-2" aria-label={usePreview().lang === 'ar' ? `${stars} نجمة` : `${stars} stars`}><Star className="size-8" />{stars}</span>}
        <KidButton tone="sun" aria-label={listenLabel} className="px-0"><Volume2 /></KidButton>
      </header>
      <main className="flex flex-1 flex-col px-4 pt-6 pb-16 md:px-10 md:pb-20">{children}</main>
    </div>
  );
}

export function Star({ className }: { className?: string }) {
  return <svg viewBox="0 0 24 24" className={className} aria-hidden><path d="m12 2.6 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4l-5.8 3.1 1.1-6.5L2.6 9.4l6.5-.9L12 2.6Z" fill="var(--accent)" stroke="oklch(0.72 0.15 85)" strokeWidth="1.2" strokeLinejoin="round" /></svg>;
}

/** Section heading used inside pages. */
export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return <div className="mb-3 flex items-center justify-between gap-2"><h2 className="text-base font-bold md:text-lg">{children}</h2>{action}</div>;
}

export { Home, Moon, Volume2 };
