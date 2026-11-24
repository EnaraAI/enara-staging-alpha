import { createHash } from 'crypto';

// The hash of exactly what a parent was shown on a consent form (titles, texts, choices and deadline). Kept with each answer.
export const consentTextHash = (f: { title: string; body: string; titleAr?: string; bodyAr?: string; options: { key: string; label: string; labelAr?: string }[]; deadline: string }) =>
  createHash('sha256').update(JSON.stringify([f.title, f.body, f.titleAr ?? '', f.bodyAr ?? '', f.options.map((o) => [o.key, o.label, o.labelAr ?? '']), f.deadline])).digest('hex');
