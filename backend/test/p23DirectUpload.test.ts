import { beforeEach, describe, expect, it, vi } from 'vitest';

// Direct uploads (P23): documents go from the browser straight to storage, so
// files over the hosting platform's 4.5 MB body limit work. Storage is an
// in-memory stand-in; no AI provider is involved.
const store = vi.hoisted(() => ({ remote: true, objects: new Map<string, Buffer>(), deleted: [] as string[] }));
vi.mock('../src/services/uploadStorage', () => ({
  isRemoteUploadStorage: () => store.remote,
  createDirectUploadUrl: async (name: string, type: string) => `https://storage.test/uploads/${name}?type=${encodeURIComponent(type)}&sig=x`,
  readUpload: async (name: string) => (store.objects.has(name) ? { body: store.objects.get(name)! } : null),
  deleteUpload: async (name: string) => { store.deleted.push(name); store.objects.delete(name); },
}));

import { claimDirectUpload, issueDirectUpload } from '../src/services/directUpload';

const PDF = Buffer.from('%PDF-1.7\n' + 'x'.repeat(6 * 1024 * 1024));

beforeEach(() => { store.remote = true; store.objects.clear(); store.deleted = []; });

describe('issueDirectUpload', () => {
  it('signs a school-prefixed name for a PDF larger than 4.5 MB', async () => {
    const r = await issueDirectUpload('inst-abc', 'Guide.pdf', PDF.length);
    expect(r.contentType).toBe('application/pdf');
    expect(r.storedName.startsWith('inst-abc~')).toBe(true);
    expect(r.storedName.endsWith('Guide.pdf')).toBe(true);
    expect(r.uploadUrl).toContain(r.storedName);
  });
  it('refuses types that are not documents', async () => {
    await expect(issueDirectUpload('inst-abc', 'run.exe', 10)).rejects.toMatchObject({ code: 'UPLOAD_TYPE_NOT_ALLOWED' });
    await expect(issueDirectUpload('inst-abc', 'clip.mp4', 10)).rejects.toMatchObject({ code: 'UPLOAD_TYPE_NOT_ALLOWED' });
  });
  it('refuses empty and oversized files', async () => {
    await expect(issueDirectUpload('inst-abc', 'a.pdf', 0)).rejects.toMatchObject({ code: 'UPLOAD_SIZE_NOT_ALLOWED' });
    await expect(issueDirectUpload('inst-abc', 'a.pdf', 51 * 1024 * 1024)).rejects.toMatchObject({ code: 'UPLOAD_SIZE_NOT_ALLOWED' });
  });
  it('answers 503 without remote storage, so the browser falls back to the API', async () => {
    store.remote = false;
    await expect(issueDirectUpload('inst-abc', 'a.pdf', 10)).rejects.toMatchObject({ statusCode: 503, code: 'UPLOAD_STORAGE_UNAVAILABLE' });
  });
});

describe('claimDirectUpload', () => {
  it('returns the stored file for the same school', async () => {
    const { storedName } = await issueDirectUpload('inst-abc', 'Guide.pdf', PDF.length);
    store.objects.set(storedName, PDF);
    const claimed = await claimDirectUpload('inst-abc', storedName, 'Guide.pdf');
    expect(claimed.file).toMatchObject({ originalname: 'Guide.pdf', mimetype: 'application/pdf', size: PDF.length });
    expect(claimed.file.buffer.equals(PDF)).toBe(true);
  });
  it("refuses another school's object without reading it", async () => {
    const { storedName } = await issueDirectUpload('inst-other', 'Guide.pdf', 100);
    store.objects.set(storedName, PDF);
    await expect(claimDirectUpload('inst-abc', storedName, 'Guide.pdf')).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
  it('refuses a name that was never uploaded', async () => {
    const { storedName } = await issueDirectUpload('inst-abc', 'Guide.pdf', 100);
    await expect(claimDirectUpload('inst-abc', storedName, 'Guide.pdf')).rejects.toMatchObject({ code: 'UPLOAD_REQUIRED' });
  });
  it('strips path tricks from the stored name', async () => {
    await expect(claimDirectUpload('inst-abc', '../../inst-other~x-Guide.pdf', 'Guide.pdf')).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
  it('keeps the stored extension when the given file name disagrees', async () => {
    const { storedName } = await issueDirectUpload('inst-abc', 'Guide.pdf', 100);
    store.objects.set(storedName, PDF);
    const claimed = await claimDirectUpload('inst-abc', storedName, 'Guide.docx');
    expect(claimed.file.originalname).toBe(storedName);
  });
  it('deletes an object larger than the limit', async () => {
    const { storedName } = await issueDirectUpload('inst-abc', 'Big.pdf', 100);
    store.objects.set(storedName, Buffer.alloc(51 * 1024 * 1024));
    await expect(claimDirectUpload('inst-abc', storedName, 'Big.pdf')).rejects.toMatchObject({ code: 'UPLOAD_SIZE_NOT_ALLOWED' });
    expect(store.deleted).toContain(storedName);
  });
});
