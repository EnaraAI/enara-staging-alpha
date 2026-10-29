import fs from 'fs';
import os from 'os';
import path from 'path';
import { deflateRawSync } from 'zlib';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// P2: documents. DOCX extraction, per-upload source scope, rights
// attestation, the fail-closed malware-scan gate, retention, and access.
// Offline: in-memory MongoDB, local upload dir, a fake scanner (tests only).
vi.mock('@anthropic-ai/sdk', () => {
  class Anthropic {
    static APIError = class extends Error {};
    messages = { create: vi.fn() };
    beta = { messages: { create: vi.fn(), stream: vi.fn() } };
  }
  return { default: Anthropic };
});

const FIXTURES = path.join(__dirname, 'fixtures');
const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'p2-docs-'));
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// A real .docx container (ZIP with word/document.xml), built with zlib.
function makeDocx(paragraphs: { text: string; heading?: boolean }[]): Buffer {
  const body = paragraphs
    .map((p) => `<w:p>${p.heading ? '<w:pPr><w:pStyle w:val="Heading1"/></w:pPr>' : ''}<w:r><w:t xml:space="preserve">${p.text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</w:t></w:r></w:p>`)
    .join('');
  const files: [string, Buffer][] = [
    ['[Content_Types].xml', Buffer.from('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>')],
    ['word/document.xml', Buffer.from(`<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`)],
  ];
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, data] of files) {
    const comp = deflateRawSync(data);
    const n = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(n.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 6); central.writeUInt16LE(8, 10);
    central.writeUInt32LE(comp.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(n.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(local, n, comp);
    centrals.push(central, n);
    offset += 30 + n.length + comp.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

let mongo: MongoMemoryServer;
let app: ReturnType<typeof import('../src/app').createApp>;
let signAccessToken: typeof import('../src/auth/jwt').signAccessToken;
let M: Record<string, mongoose.Model<any>>;
let scan: typeof import('../src/services/malwareScan');
let extraction: typeof import('../src/services/curriculumExtraction');
let retrieval: typeof import('../src/services/curriculumRetrieval');
let safety: typeof import('../src/services/documentSafety');

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: 'test', MONGODB_URI: mongo.getUri(), JWT_SECRET: 'test-jwt-secret-32-characters-minimum', JWT_EXPIRES_IN: '1h',
    JWT_ISSUER: 'enara-backend', JWT_AUDIENCE: 'enara-platform', INGEST_HMAC_SECRET: 'test-hmac-secret-32-characters-minimum',
    CORS_ALLOWED_ORIGINS: 'http://localhost:5173', ENARA_ORCHESTRATOR_URL: 'http://127.0.0.1:9999', ENARA_API_KEY: 'test-orchestrator-key',
    AI_ENGINE_URL: 'http://127.0.0.1:9998', AWS_S3_BUCKET: 'test-bucket', TRUST_PROXY: 'false', SERVE_LOCAL_UPLOADS: 'false', BCRYPT_ROUNDS: '10', UPLOAD_DIR: uploadDir,
  });
  (await import('../src/config/env')).resetConfigForTests();
  await mongoose.connect(mongo.getUri());
  ({ signAccessToken } = await import('../src/auth/jwt'));
  scan = await import('../src/services/malwareScan');
  extraction = await import('../src/services/curriculumExtraction');
  retrieval = await import('../src/services/curriculumRetrieval');
  safety = await import('../src/services/documentSafety');
  M = {};
  for (const n of ['User', 'Institution', 'Curriculum', 'CourseInstance']) M[n] = (await import(`../src/models/${n}`))[n];
  const c = await import('../src/models/CurriculumChunk');
  M.CurriculumChunk = c.CurriculumChunk;
  M.CurriculumFileJob = c.CurriculumFileJob;
  for (const m of Object.values(M)) await m.createIndexes();
  app = (await import('../src/app')).createApp();
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
  fs.rmSync(uploadDir, { recursive: true, force: true });
});

type Who = { id: string; auth: string };
async function who(role: string, institutionId?: string): Promise<Who> {
  const email = `${role}-${Math.random().toString(36).slice(2)}@t.test`;
  const user = await M.User.create({ email, password: 'x', role, name: email, status: 'active', institutionId });
  return { id: user._id.toString(), auth: `Bearer ${signAccessToken({ id: user._id.toString(), email, role: role as never, institutionId })}` };
}
const get = (w: Who, u: string) => request(app).get(u).set('Authorization', w.auth);
const del = (w: Who, u: string) => request(app).delete(u).set('Authorization', w.auth);
const post = (w: Who, u: string) => request(app).post(u).set('Authorization', w.auth);
const uploadAs = (w: Who, fields: Record<string, string>, file: Buffer, filename: string, contentType: string) => {
  let r = post(w, '/api/documents');
  for (const [k, v] of Object.entries(fields)) r = r.field(k, v);
  return r.attach('file', file, { filename, contentType });
};

const GATED = { documents_workspace_enabled: true };
let T: Who, T2: Who, AM: Who, WA: Who, S: Who, TB: Who, WB: Who;
const clean = { name: 'fake-test-scanner', scan: vi.fn(async () => ({ verdict: 'clean' as const })) };

beforeEach(async () => {
  for (const m of Object.values(M)) await m.deleteMany({});
  await mongoose.connection.collection('rate_limits').deleteMany({});
  (await import('../src/services/featureFlags')).forgetFeatureFlags();
  scan.setMalwareScannerForTests(null);
  clean.scan.mockClear();
  await M.Institution.create([{ id: 'instA', name: 'A', features: GATED }, { id: 'instB', name: 'B', features: GATED }, { id: 'instLegacy', name: 'Legacy' }]);
  T = await who('teacher', 'instA');
  T2 = await who('teacher', 'instA');
  AM = await who('academic_manager', 'instA');
  WA = await who('admin', 'instA');
  S = await who('student', 'instA');
  TB = await who('teacher', 'instB');
  WB = await who('admin', 'instB');
  await M.Curriculum.create([
    { id: 'curA', name: 'Reading', institutionId: 'instA', summary: 's', lastUpdated: '2026-10-29', createdBy: T.id, chapters: [{ id: 'L1', title: 'Main idea', uploads: [] }] },
    { id: 'curA2', name: 'Other teacher', institutionId: 'instA', summary: 's', lastUpdated: '2026-10-29', createdBy: T2.id, chapters: [{ id: 'L1', title: 'x', uploads: [] }] },
    { id: 'curB', name: 'School B', institutionId: 'instB', summary: 's', lastUpdated: '2026-10-29', createdBy: TB.id, chapters: [{ id: 'L1', title: 'x', uploads: [] }] },
  ]);
});
afterEach(() => scan.setMalwareScannerForTests(null));

const TXT = Buffer.from('Finding the main idea. The main idea is the central point of a paragraph that supporting details explain.');
const upTxt = (w: Who, cur = 'curA', extra: Record<string, string> = {}) => uploadAs(w, { curriculumId: cur, lessonId: 'L1', rightsAttested: 'true', ...extra }, TXT, 'notes.txt', 'text/plain');

describe('extraction', () => {
  it('PDF, text and Markdown extraction are unchanged', async () => {
    const pdf = await extraction.extractPages(fs.readFileSync(path.join(FIXTURES, 'lesson.pdf')), 'lesson.pdf');
    expect(pdf!.kind).toBe('pdf');
    expect(pdf!.pages.join(' ').length).toBeGreaterThan(20);
    expect(await extraction.extractPages(Buffer.from('plain text'), 'a.txt')).toEqual({ pages: ['plain text'], kind: 'text' });
    expect((await extraction.extractPages(Buffer.from('# Title'), 'a.md'))!.kind).toBe('text');
    expect(await extraction.extractPages(Buffer.from('x'), 'a.pptx')).toBeNull();
  });

  it('reads DOCX into ordered sections at headings, labelled because Word has no fixed pages', async () => {
    const docx = makeDocx([
      { text: 'Introduction to reading', heading: true },
      { text: 'Readers look for the main idea first & then the details.' },
      { text: 'الفكرة الرئيسية', heading: true },
      { text: 'الفكرة الرئيسية هي النقطة المركزية في الفقرة.' },
    ]);
    const out = await extraction.extractPages(docx, 'unit.docx');
    expect(out!.kind).toBe('docx');
    expect(out!.labels).toEqual(['Section 1: Introduction to reading', 'Section 2: الفكرة الرئيسية']);
    expect(out!.pages[0]).toContain('main idea first & then');
    expect(out!.pages[1]).toContain('النقطة المركزية');
  });

  it('rejects files that are not Word documents instead of pretending to extract them', async () => {
    const { DocxError } = await import('../src/utils/docxText');
    await expect(extraction.extractPages(Buffer.from('PK\x03\x04 not really a zip'), 'bad.docx')).rejects.toBeInstanceOf(DocxError);
  });

  it('a scanned PDF stays no_text and has no passages', async () => {
    fs.copyFileSync(path.join(FIXTURES, 'scanned.pdf'), path.join(uploadDir, 'scan-legacy.pdf'));
    await M.Curriculum.create({ id: 'curL', name: 'L', institutionId: 'instLegacy', summary: 's', lastUpdated: '2026-10-29', chapters: [{ id: 'L1', title: 'x', uploads: ['/uploads/scan-legacy.pdf'] }] });
    await extraction.processCurriculumFiles({ curriculumId: 'curL', limit: 5 });
    const job = await M.CurriculumFileJob.findOne({ curriculumId: 'curL' }).lean();
    expect(job!.status).toBe('no_text');
    expect(await M.CurriculumChunk.countDocuments({ curriculumId: 'curL' })).toBe(0);
  });
});

describe('rights attestation and the scan gate', () => {
  it('rejects an upload without the attestation (documents and legacy lesson upload)', async () => {
    const r = await upTxt(T, 'curA', { rightsAttested: 'false' });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('RIGHTS_ATTESTATION_REQUIRED');
    const legacy = await post(T, '/api/curriculums/curA/chapters/L1/uploads').attach('file', TXT, { filename: 'n.txt', contentType: 'text/plain' });
    expect(legacy.body.error.code).toBe('RIGHTS_ATTESTATION_REQUIRED');
    expect(await M.CurriculumFileJob.countDocuments()).toBe(0);
  });

  it('without a configured scanner an attested file is not scanned by policy: text extracted locally, never called clean, downloadable with a not-scanned warning (owner decision), raw file never sent to AI', async () => {
    const r = await upTxt(T);
    expect(r.status).toBe(201);
    expect(r.body.document).toMatchObject({ state: 'ready', scanStatus: 'deferred', malwareScan: 'not_scanned_by_policy', rightsAttested: true });
    expect(r.body.document.fileUrl).toMatch(/^\/uploads\/.+\?exp=\d+&sig=/);
    expect(r.body.document.downloadWarning).toMatch(/has not been scanned for malware/);
    expect(JSON.stringify(r.body.document)).not.toMatch(/"clean"|scanned clean/);
    const job = await M.CurriculumFileJob.findOne({ id: r.body.document.uploadId }).lean();
    expect(job).toMatchObject({ status: 'done', scanStatus: 'deferred' });
    expect(job!.scannedAt).toBeUndefined();
    expect(job!.scanProvider).toBeUndefined();
    expect(await M.CurriculumChunk.countDocuments({ uploadId: job!.id })).toBeGreaterThan(0);
    expect((await get(T, `/api/documents/${job!.id}/sources`)).body.sources.length).toBeGreaterThan(0);
    // The raw file is never forwarded to an AI provider without a real clean verdict.
    expect(await safety.filterClearedFileUrls('instA', [job!.fileUrl])).toEqual([]);
    const list = await get(T, '/api/documents');
    expect(list.body.notScannedNotice).toMatch(/has not been scanned for malware/);
    expect(list.body.documents[0]).toMatchObject({ malwareScan: 'not_scanned_by_policy' });
    expect(list.body.documents[0].fileUrl).toMatch(/^\/uploads\/.+\?exp=\d+&sig=/);
    expect(list.body.documents[0].downloadWarning).toMatch(/has not been scanned for malware/);
  });

  it('pending, failed and infected files are never offered for download', async () => {
    const r = await upTxt(T);
    const base = (await M.CurriculumFileJob.findOne({ id: r.body.document.uploadId }).lean())!;
    for (const scanStatus of ['pending', 'unavailable', 'failed', 'infected']) {
      await M.CurriculumFileJob.updateOne({ id: base.id }, { $set: { scanStatus } });
      const doc = (await get(T, '/api/documents')).body.documents.find((d: { uploadId: string }) => d.uploadId === base.id);
      expect(doc, scanStatus).toMatchObject({ fileUrl: null, downloadWarning: null });
    }
  });

  it('pending, failed and infected files are never extracted; an infected file is deleted', async () => {
    const job = (await upTxt(T)).body.document;
    await M.CurriculumChunk.deleteMany({});
    for (const status of ['pending', 'failed']) {
      await M.CurriculumFileJob.updateOne({ id: job.uploadId }, { $set: { scanStatus: status, status: 'pending', attempts: 0 } });
      await extraction.processCurriculumFiles({ limit: 10 });
      expect((await M.CurriculumFileJob.findOne({ id: job.uploadId }).lean())!.status).toBe('blocked');
      expect(await M.CurriculumChunk.countDocuments()).toBe(0);
    }
    scan.setMalwareScannerForTests({ name: 'fake-test-scanner', scan: async () => ({ verdict: 'error' }) });
    await M.CurriculumFileJob.updateOne({ id: job.uploadId }, { $set: { scanStatus: 'unavailable' } });
    expect((await post(T, `/api/documents/${job.uploadId}/retry`)).body.document.state).toBe('scan_failed');
    scan.setMalwareScannerForTests({ name: 'fake-test-scanner', scan: async () => ({ verdict: 'infected' }) });
    expect((await post(T, `/api/documents/${job.uploadId}/retry`)).body.document.state).toBe('rejected');
    const after = await M.CurriculumFileJob.findOne({ id: job.uploadId }).lean();
    expect(after).toMatchObject({ scanStatus: 'infected', deletionReason: 'infected' });
    expect(fs.existsSync(path.join(uploadDir, path.basename(after!.fileUrl)))).toBe(false);
    await extraction.processCurriculumFiles({ limit: 10 });
    expect(await M.CurriculumChunk.countDocuments()).toBe(0);
  });

  it('a clean verdict from the configured (test) scanner allows extraction; passages carry uploadId and refs', async () => {
    scan.setMalwareScannerForTests(clean);
    const r = await uploadAs(T, { curriculumId: 'curA', lessonId: 'L1', rightsAttested: 'true' }, makeDocx([{ text: 'Main idea', heading: true }, { text: 'The main idea is the central point of a paragraph.' }]), 'unit.docx', DOCX_MIME);
    expect(r.status).toBe(201);
    expect(clean.scan).toHaveBeenCalledTimes(1);
    expect(r.body.document).toMatchObject({ state: 'ready', scanStatus: 'clean' });
    const chunks = await M.CurriculumChunk.find({ uploadId: r.body.document.uploadId }).lean();
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]).toMatchObject({ institutionId: 'instA', curriculumId: 'curA', fileName: 'unit.docx', sectionLabel: 'Section 1: Main idea' });
    expect(chunks[0].page).toBeUndefined();
    const src = await get(T, `/api/documents/${r.body.document.uploadId}/sources`);
    expect(src.body.sources[0]).toMatchObject({ fileName: 'unit.docx', section: 'Section 1: Main idea', ref: 'Section 1: Main idea' });
    expect((await get(T, '/api/documents')).body.documents[0].fileUrl).toMatch(/^\/uploads\/.+\?exp=\d+&sig=/);
  });

  it('the client cannot mark a file clean: no route accepts a scan state', async () => {
    const job = (await upTxt(T)).body.document;
    await post(T, `/api/documents/${job.uploadId}/retry`).send({ scanStatus: 'clean' });
    expect((await M.CurriculumFileJob.findOne({ id: job.uploadId }).lean())!.scanStatus).toBe('deferred');
    expect((await request(app).patch(`/api/documents/${job.uploadId}`).set('Authorization', T.auth).send({ scanStatus: 'clean' })).status).toBe(404);
  });

  it('a test scanner cannot be installed outside tests, and none is configured by default', () => {
    const env = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      expect(() => scan.setMalwareScannerForTests(clean)).toThrow();
      expect(scan.getMalwareScanner()).toBeNull();
    } finally {
      process.env.NODE_ENV = env;
    }
  });

  it('the external ingestion engine refuses files from a gated school', async () => {
    const { submitFileToEngine } = await import('../src/services/ingestionService');
    await expect(submitFileToEngine({ schoolId: 'instA', courseId: 'c1', instructorId: 'i1', assetId: 'a1', s3Key: 'k', modality: 'document' })).rejects.toMatchObject({ code: 'DOCUMENT_SAFETY_GATE' });
  });

  it('a school without the documents flag keeps the pre-P2 upload behaviour', async () => {
    const TL = await who('teacher', 'instLegacy');
    await M.Curriculum.create({ id: 'curLeg', name: 'Leg', institutionId: 'instLegacy', summary: 's', lastUpdated: '2026-10-29', createdBy: TL.id, chapters: [{ id: 'L1', title: 'x', uploads: [] }] });
    const r = await post(TL, '/api/curriculums/curLeg/chapters/L1/uploads').attach('file', TXT, { filename: 'n.txt', contentType: 'text/plain' });
    expect(r.status).toBe(200);
    expect((await get(TL, '/api/documents')).status).toBe(404); // documents workspace is off
  });
});

describe('per-upload retrieval scope', () => {
  it('uploadIds narrow retrieval to those documents; legacy, other-curriculum and other-school passages never match', async () => {
    scan.setMalwareScannerForTests(clean);
    const a = (await upTxt(T)).body.document.uploadId;
    const b = (await uploadAs(T, { curriculumId: 'curA', lessonId: 'L1', rightsAttested: 'true' }, Buffer.from('Persuasive writing: an argument uses evidence, reasons and a clear claim to convince the reader.'), 'second.txt', 'text/plain')).body.document.uploadId;
    const other = (await uploadAs(TB, { curriculumId: 'curB', lessonId: 'L1', rightsAttested: 'true' }, TXT, 'b.txt', 'text/plain')).body.document.uploadId;
    // A passage extracted before P2 (no uploadId) in the same curriculum.
    await M.CurriculumChunk.create({ id: 'legacy-chunk', institutionId: 'instA', curriculumId: 'curA', lessonId: 'L1', fileUrl: '/uploads/old.txt', fileName: 'old.txt', chunkIndex: 0, text: 'volcano magma eruption lava', terms: ['volcano', 'magma', 'eruption', 'lava'], termCount: 4, contentHash: 'h', extractionVersion: 'extract-v1' });
    const q = { institutionId: 'instA', curriculumId: 'curA', query: 'main idea central point paragraph' };
    const onlyA = await retrieval.retrieveCurriculumSources({ ...q, uploadIds: [a] });
    expect(onlyA.length).toBeGreaterThan(0);
    expect(onlyA.every((s) => s.uploadId === a)).toBe(true);
    expect((await retrieval.retrieveCurriculumSources({ ...q, uploadIds: [other] }))).toEqual([]);
    expect((await retrieval.retrieveCurriculumSources({ ...q, curriculumId: 'curA2', uploadIds: [a] }))).toEqual([]);
    // Without uploadIds: each cleared document is reachable by its own content.
    expect((await retrieval.retrieveCurriculumSources({ ...q })).map((s) => s.uploadId)).toEqual([a]);
    expect((await retrieval.retrieveCurriculumSources({ ...q, query: 'persuasive argument evidence claim' })).map((s) => s.uploadId)).toEqual([b]);
    expect((await retrieval.retrieveCurriculumSources({ ...q, query: 'persuasive argument evidence claim', uploadIds: [a] }))).toEqual([]);
    // The legacy passage has no uploadId and no scan: never returned here.
    expect((await retrieval.retrieveCurriculumSources({ ...q, query: 'volcano magma eruption lava' }))).toEqual([]);
    expect((await retrieval.retrieveCurriculumSources({ ...q, query: 'volcano magma eruption lava', uploadIds: [a, b] }))).toEqual([]);
  });
});

describe('legacy passages in a school without the documents flag', () => {
  it('stay searchable as before, but an uploadIds scope never includes them', async () => {
    await M.CurriculumChunk.create({ id: 'old-1', institutionId: 'instLegacy', curriculumId: 'curOld', lessonId: 'L1', fileUrl: '/uploads/old.txt', fileName: 'old.txt', chunkIndex: 0, text: 'volcano magma eruption lava', terms: ['volcano', 'magma', 'eruption', 'lava'], termCount: 4, contentHash: 'h', extractionVersion: 'extract-v1' });
    const q = { institutionId: 'instLegacy', curriculumId: 'curOld', query: 'volcano magma eruption lava' };
    expect((await retrieval.retrieveCurriculumSources(q)).map((s) => s.chunkId)).toEqual(['old-1']);
    expect(await retrieval.retrieveCurriculumSources({ ...q, uploadIds: ['cfj-new'] })).toEqual([]);
    expect(await retrieval.retrieveCurriculumSources({ ...q, uploadIds: [] })).toEqual([]);
  });
});

describe('access and tenant isolation', () => {
  it('other schools and other teachers cannot see, read, retry or delete a document', async () => {
    const id = (await upTxt(T)).body.document.uploadId;
    for (const w of [TB, WB, T2]) {
      expect((await get(w, `/api/documents/${id}`)).status).toBe(404);
      expect((await get(w, `/api/documents/${id}/sources`)).status).toBe(404);
      expect((await post(w, `/api/documents/${id}/retry`)).status).toBe(404);
      expect((await del(w, `/api/documents/${id}`)).status).toBe(404);
      expect((await get(w, '/api/documents')).body.documents.map((d: { uploadId: string }) => d.uploadId)).not.toContain(id);
    }
    expect((await upTxt(TB, 'curA')).status).toBe(404); // upload into another school's curriculum
    expect((await upTxt(T2, 'curA')).status).toBe(404); // into another teacher's curriculum
    expect(await M.CurriculumFileJob.countDocuments({ id })).toBe(1);
  });

  it('academic managers and students cannot use documents; workspace admins see their school only', async () => {
    const id = (await upTxt(T)).body.document.uploadId;
    for (const w of [AM, S]) {
      expect((await get(w, '/api/documents')).status).toBe(403);
      expect((await upTxt(w)).status).toBe(403);
      expect((await del(w, `/api/documents/${id}`)).status).toBe(403);
    }
    expect((await get(WA, '/api/documents')).body.documents.map((d: { uploadId: string }) => d.uploadId)).toEqual([id]);
    expect((await get(WB, '/api/documents')).body.documents).toEqual([]);
  });

  it('a teacher deletes their own document: file, passages and lesson link go, the record stays for audit', async () => {
    scan.setMalwareScannerForTests(clean);
    const doc = (await upTxt(T)).body.document;
    const job = await M.CurriculumFileJob.findOne({ id: doc.uploadId }).lean();
    expect(await M.CurriculumChunk.countDocuments({ uploadId: doc.uploadId })).toBeGreaterThan(0);
    expect((await del(T, `/api/documents/${doc.uploadId}`)).status).toBe(204);
    expect(fs.existsSync(path.join(uploadDir, path.basename(job!.fileUrl)))).toBe(false);
    expect(await M.CurriculumChunk.countDocuments({ uploadId: doc.uploadId })).toBe(0);
    expect((await M.Curriculum.findOne({ id: 'curA' }).lean())!.chapters[0].uploads).not.toContain(job!.fileUrl);
    expect((await M.CurriculumFileJob.findOne({ id: doc.uploadId }).lean())).toMatchObject({ status: 'removed', deletionReason: 'user' });
  });
});

describe('retention', () => {
  it('deletes a school\'s documents once retention has passed, only that school, and is safe to re-run', async () => {
    scan.setMalwareScannerForTests(clean);
    const a = (await upTxt(T)).body.document.uploadId;
    const b = (await uploadAs(TB, { curriculumId: 'curB', lessonId: 'L1', rightsAttested: 'true' }, TXT, 'b.txt', 'text/plain')).body.document.uploadId;
    const { sweepDocumentRetention } = await import('../src/services/documentRetention');
    // Set by the Workspace Admin (workspace:billing); teachers cannot.
    expect((await request(app).put('/api/workspace/document-retention').set('Authorization', T.auth).send({ pilotEndsAt: '2026-01-01T00:00:00Z' })).status).toBe(403);
    const set = await request(app).put('/api/workspace/document-retention').set('Authorization', WA.auth).send({ pilotEndsAt: '2026-01-01T00:00:00Z' });
    expect(set.body).toMatchObject({ institutionId: 'instA', retentionDays: 180 });
    expect(await sweepDocumentRetention({ now: new Date('2026-06-01T00:00:00Z') })).toEqual([]); // < 180 days
    const run = await sweepDocumentRetention({ now: new Date('2026-07-01T00:00:00Z') });
    expect(run).toEqual([{ institutionId: 'instA', deleted: 1, failed: 0 }]);
    expect((await M.CurriculumFileJob.findOne({ id: a }).lean())).toMatchObject({ status: 'removed', deletionReason: 'retention' });
    expect(await M.CurriculumChunk.countDocuments({ uploadId: a })).toBe(0);
    expect((await M.CurriculumFileJob.findOne({ id: b }).lean())!.status).toBe('done');
    expect(await M.CurriculumChunk.countDocuments({ uploadId: b })).toBeGreaterThan(0);
    expect(await sweepDocumentRetention({ now: new Date('2026-07-02T00:00:00Z') })).toEqual([{ institutionId: 'instA', deleted: 0, failed: 0 }]);
  });
});

describe('demo documents', () => {
  it('seeded demo documents are labelled and kept out of the live view', async () => {
    const { seed4Level1 } = await import('../src/scripts/seed4Level1');
    await seed4Level1('inst4l1');
    await M.Institution.updateOne({ id: 'inst4l1' }, { features: GATED });
    const teacher = await M.User.findOne({ institutionId: 'inst4l1', role: 'teacher' }).lean();
    const t = { id: teacher!._id.toString(), auth: `Bearer ${signAccessToken({ id: teacher!._id.toString(), email: teacher!.email, role: 'teacher', institutionId: 'inst4l1' })}` };
    expect((await get(t, '/api/documents')).body.documents).toEqual([]);
    const demo = (await get(t, '/api/documents?origin=demo_seed')).body.documents;
    expect(demo).toHaveLength(1);
    expect(demo[0]).toMatchObject({ origin: 'demo_seed', state: 'scan_unavailable', fileUrl: null });
  });
});
