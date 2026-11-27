import { createContext, useContext } from 'react';

export type Lang = 'en' | 'ar';
export type Theme = 'kids' | 'learner' | 'admin';
export interface PreviewState { lang: Lang; theme: Theme; dark: boolean }
export const PreviewContext = createContext<PreviewState>({ lang: 'en', theme: 'learner', dark: false });
export const usePreview = () => useContext(PreviewContext);

/** Pick the strings for the current language: const t = useT({ en: {...}, ar: {...} }). Arabic is Modern Standard Arabic (fusha). */
export function useT<T>(dict: { en: T; ar: T }): T { return dict[usePreview().lang]; }

/** Numbers and dates: Latin digits in both languages (ENARA convention), Cairo time. */
export const num = (n: number, lang: Lang, opts?: Intl.NumberFormatOptions) => new Intl.NumberFormat(lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', opts).format(n);
export const egp = (n: number, lang: Lang) => `${num(n, lang)} ${lang === 'ar' ? 'ج.م' : 'EGP'}`;
