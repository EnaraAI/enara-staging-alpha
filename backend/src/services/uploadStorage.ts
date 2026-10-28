import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import fs from 'fs';
import path from 'path';
import { getConfig } from '../config/env';

// Chapter uploads, addressed by stored file name and exposed as /uploads/<name>.
// Kept in Cloudflare R2 when configured (serverless disks are ephemeral),
// otherwise on the local upload directory.

let r2Client: S3Client | undefined;

function getR2() {
  const r2 = getConfig().r2;
  if (!r2) return undefined;
  r2Client ??= new S3Client({
    region: 'auto',
    endpoint: `https://${r2.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: r2.accessKeyId, secretAccessKey: r2.secretAccessKey },
  });
  return { client: r2Client, bucket: r2.bucket };
}

export function isRemoteUploadStorage(): boolean {
  return Boolean(getConfig().r2);
}

function localPath(name: string): string {
  return path.join(path.resolve(getConfig().uploadDir), path.basename(name));
}

export async function saveUpload(name: string, body: Buffer, contentType: string): Promise<void> {
  const r2 = getR2();
  if (r2) {
    await r2.client.send(
      new PutObjectCommand({ Bucket: r2.bucket, Key: `uploads/${name}`, Body: body, ContentType: contentType }),
    );
    return;
  }
  await fs.promises.mkdir(getConfig().uploadDir, { recursive: true });
  await fs.promises.writeFile(localPath(name), body, { flag: 'wx' });
}

export async function readUpload(name: string): Promise<{ body: Buffer; contentType?: string } | null> {
  const safeName = path.basename(name);
  const r2 = getR2();
  if (r2) {
    try {
      const res = await r2.client.send(new GetObjectCommand({ Bucket: r2.bucket, Key: `uploads/${safeName}` }));
      if (!res.Body) return null;
      return { body: Buffer.from(await res.Body.transformToByteArray()), contentType: res.ContentType };
    } catch (error) {
      if ((error as { name?: string }).name === 'NoSuchKey') return null;
      throw error;
    }
  }
  try {
    return { body: await fs.promises.readFile(localPath(safeName)) };
  } catch {
    return null;
  }
}

export async function deleteUpload(name: string): Promise<void> {
  const r2 = getR2();
  if (r2) {
    await r2.client.send(new DeleteObjectCommand({ Bucket: r2.bucket, Key: `uploads/${path.basename(name)}` }));
    return;
  }
  await fs.promises.rm(localPath(name), { force: true });
}

// Large files (lesson videos) skip the serverless function, whose request and
// response bodies are capped at ~4.5 MB: the browser PUTs straight to R2 with a
// short-lived signed URL, and viewers are redirected to a signed GET URL.

const SIGNED_URL_SECONDS = 60 * 60;

function requireR2() {
  const r2 = getR2();
  if (!r2) throw new Error('R2 upload storage is not configured');
  return r2;
}

export async function createDirectUploadUrl(name: string, contentType: string): Promise<string> {
  const r2 = requireR2();
  return getSignedUrl(
    r2.client,
    new PutObjectCommand({ Bucket: r2.bucket, Key: `uploads/${path.basename(name)}`, ContentType: contentType }),
    { expiresIn: SIGNED_URL_SECONDS },
  );
}

export async function createDownloadUrl(name: string): Promise<string> {
  const r2 = requireR2();
  return getSignedUrl(
    r2.client,
    new GetObjectCommand({ Bucket: r2.bucket, Key: `uploads/${path.basename(name)}` }),
    { expiresIn: SIGNED_URL_SECONDS },
  );
}

// Size, type and first bytes of a stored upload, or null when it doesn't exist.
export async function inspectUpload(
  name: string,
): Promise<{ size: number; contentType?: string; head: Buffer } | null> {
  const r2 = requireR2();
  const key = `uploads/${path.basename(name)}`;
  try {
    const meta = await r2.client.send(new HeadObjectCommand({ Bucket: r2.bucket, Key: key }));
    const res = await r2.client.send(new GetObjectCommand({ Bucket: r2.bucket, Key: key, Range: 'bytes=0-15' }));
    const head = res.Body ? Buffer.from(await res.Body.transformToByteArray()) : Buffer.alloc(0);
    return { size: meta.ContentLength ?? 0, contentType: meta.ContentType, head };
  } catch (error) {
    const code = (error as { name?: string }).name;
    if (code === 'NotFound' || code === 'NoSuchKey') return null;
    throw error;
  }
}
