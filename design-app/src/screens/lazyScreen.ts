import { lazy, type ComponentType } from 'react';

/** A screen loaded on demand (lms-speed-6), with preload() so its code can be fetched before it is shown. */
export type LazyScreen = ComponentType & { preload: () => Promise<unknown> };

export function lazyScreen(load: () => Promise<{ default: ComponentType }>): LazyScreen {
  let pending: Promise<{ default: ComponentType }> | undefined;
  const once = () => (pending ??= load());
  return Object.assign(lazy(once), { preload: once });
}
