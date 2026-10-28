import * as crypto from 'crypto';

// The AI engine requires standard UUIDs for institution/course/instructor/asset ids
// (anything else is a 422), but this backend's ids are free-form strings. Non-UUID ids
// are mapped deterministically (UUIDv5) so the same backend id always yields the same
// engine id; UUIDs pass through unchanged. Keep the namespace constant forever: changing
// it orphans every previously ingested course.
const ENGINE_ID_NAMESPACE = '6f1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuidV5(name: string, namespace: string): string {
  const bytes = crypto
    .createHash('sha1')
    .update(Buffer.from(namespace.replace(/-/g, ''), 'hex'))
    .update(name, 'utf8')
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function toEngineUuid(id: string): string {
  return UUID_PATTERN.test(id) ? id.toLowerCase() : uuidV5(id, ENGINE_ID_NAMESPACE);
}
