import type { ComponentType } from 'react';
import type { Theme } from '@/lib/preview';

export type Area = 'shared' | 'student' | 'kids' | 'parent' | 'teacher' | 'school' | 'platform';
/** One static screen. `render` reads the language from usePreview()/useT() inside the component. */
export interface ScreenDef { id: string; area: Area; title: { en: string; ar: string }; theme: Theme; render: ComponentType }
