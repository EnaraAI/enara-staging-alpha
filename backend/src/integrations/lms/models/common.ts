import { randomUUID } from 'crypto';

// Shared helpers for LMS models. Every record that belongs to a school carries
// `institutionId` (required). Tool-wide records (signing keys, locks) do not.
export const newId = (prefix: string) => () => `${prefix}_${randomUUID().replace(/-/g, '')}`;

export const requiredOrg = { type: String, required: true, index: true } as const;
