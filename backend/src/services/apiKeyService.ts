import { createHash, randomBytes } from 'crypto';
import { ApiKey, IApiKey } from '../models/ApiKey';

const API_KEY_PREFIX = 'enara_live_';
const API_KEY_PATTERN = /^enara_live_[A-Za-z0-9_-]{32}$/;

export function generateApiKey(): { key: string; keyHash: string; keyPrefix: string } {
  const key = `${API_KEY_PREFIX}${randomBytes(24).toString('base64url')}`;
  return { key, keyHash: hashApiKey(key), keyPrefix: `${key.slice(0, API_KEY_PREFIX.length + 4)}…` };
}

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export function looksLikeApiKey(value: string): boolean {
  return value.startsWith(API_KEY_PREFIX);
}

export function isWellFormedApiKey(value: string): boolean {
  return API_KEY_PATTERN.test(value);
}

export function isApiKeyExpired(key: Pick<IApiKey, 'expiresAt'>): boolean {
  return !!key.expiresAt && key.expiresAt.getTime() < Date.now();
}

export async function findApiKey(rawKey: string) {
  if (!isWellFormedApiKey(rawKey)) return null;
  return ApiKey.findOne({ keyHash: hashApiKey(rawKey) });
}

export function generateInstitutionId(): string {
  return `inst-${randomBytes(6).toString('hex')}`;
}

export function generateApiKeyId(): string {
  return `key-${randomBytes(8).toString('hex')}`;
}

export function generateAdminPassword(): string {
  // 18 URL-safe characters, well above the 8-character minimum.
  return randomBytes(14).toString('base64url').slice(0, 18);
}
