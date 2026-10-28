import { createHash, randomUUID } from 'crypto';
import path from 'path';
import { CurriculumChunk, CurriculumFileJob } from '../models/CurriculumChunk';
import { Curriculum, type ICurriculum } from '../models/Curriculum';
import { LearningObjective } from '../models/LearningObjective';
import { logger, serializeError } from '../utils/logging';
import { searchTerms } from './textSearch';
import { readUpload } from './uploadStorage';
import { docxSections } from '../utils/docxText';
import { isClearedForProcessing, isDocumentSafetyRequired } from './documentSafety';

// Extracts text from curriculum uploads into cited passages (extract-v1).
// - PDF (text layer) via unpdf, page by page; plain text and Markdown as is.
// - Word (.docx, P2) via utils/docxText: sections at headings, labelled
//   "Section N" because Word files have no fixed pages.
// - A PDF with no text layer (scanned) is marked no_text: it needs OCR, which
//   this version doesn't do. Other types (video, PowerPoint, images) are unsupported.
// - For a school with the documents safety gate (P2), a file is extracted
//   only once it is attested and scanned clean; otherwise it is 'blocked'.
// - Arabic lines from PDFs come out in visual order as presentation forms;
//   they are reversed and normalised (minor letter-order errors can remain).
// - Passages are ~1,000 characters on paragraph boundaries, never across pages.
// Uploaded text is untrusted: it is stored and later shown to the model as
// quoted data only.

export const EXTRACTION_VERSION = 'extract-v1';
const CHUNK_CHARS = 1000;
const MAX_FILE_BYTES = 30 * 1024 * 1024;
const MAX_ATTEMPTS = 3;

function fixRtlLine(line: string) {
  const n = line.normalize('NFKC');
  const arabic = (n.match(/[؀-ۿ]/g) || []).length;
  const latin = (n.match(/[A-Za-z]/g) || []).length;
  if (arabic <= latin || !/[ﭐ-﷿ﹰ-﻿]/.test(line)) return n;
  const reversed = [...line].reverse().join('').normalize('NFKC');
  return reversed.replace(/[0-9٠-٩:.,/]+/g, (m) => [...m].reverse().join(''));
}

export function chunkPage(text: string, page?: number) {
  const paragraphs = text
    .split(/\n\s*\n|\n(?=[A-Z؀-ۿ#•-])/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const chunks: { text: string; page?: number }[] = [];
  let current = '';
  for (const p of paragraphs) {
    if (current && current.length + p.length + 1 > CHUNK_CHARS) {
      chunks.push({ text: current, page });
      current = '';
    }
    if (p.length > CHUNK_CHARS * 1.5) {
      // Very long paragraph: split at the last space before the limit.
      let rest = p;
      while (rest.length > CHUNK_CHARS) {
        const cut = rest.lastIndexOf(' ', CHUNK_CHARS);
        const at = cut > CHUNK_CHARS / 2 ? cut : CHUNK_CHARS;
        chunks.push({ text: rest.slice(0, at).trim(), page });
        rest = rest.slice(at).trim();
      }
      if (rest) chunks.push({ text: rest, page });
    } else {
      current = current ? `${current} ${p}` : p;
    }
  }
  if (current) chunks.push({ text: current, page });
  return chunks;
}

export async function extractPages(body: Buffer, fileName: string): Promise<{ pages: string[]; kind: 'pdf' | 'text' | 'docx'; labels?: string[] } | null> {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === '.docx') {
    const sections = docxSections(body);
    return { pages: sections.map((s) => s.text), kind: 'docx', labels: sections.map((s) => s.label) };
  }
  if (ext === '.pdf' || body.subarray(0, 5).toString() === '%PDF-') {
    const { extractText, getDocumentProxy } = await import('unpdf');
    const pdf = await getDocumentProxy(new Uint8Array(body));
    const { text } = await extractText(pdf, { mergePages: false });
    return { pages: (text as string[]).map((page) => page.split('\n').map(fixRtlLine).join('\n')), kind: 'pdf' };
  }
  if (['.txt', '.md', '.markdown'].includes(ext)) return { pages: [body.toString('utf8')], kind: 'text' };
  return null;
}

// Makes sure every upload in the curriculum has a job, and marks jobs for
// removed files (their passages are deleted: they're derived from a file that
// no longer exists).
export async function syncCurriculumJobs(curriculum: Pick<ICurriculum, 'id' | 'institutionId' | 'chapters'>) {
  const uploads = curriculum.chapters.flatMap((c) => (c.uploads || []).map((u) => ({ lessonId: c.id, fileUrl: u.split('?')[0] })));
  const known = new Set(uploads.map((u) => u.fileUrl));
  // A file first seen here (not through an attested upload) in a school with
  // the safety gate is blocked until it is uploaded with an attestation.
  const gated = await isDocumentSafetyRequired(curriculum.institutionId);
  for (const u of uploads) {
    await CurriculumFileJob.updateOne(
      { curriculumId: curriculum.id, fileUrl: u.fileUrl },
      {
        $setOnInsert: {
          id: `cfj-${randomUUID()}`, institutionId: curriculum.institutionId, lessonId: u.lessonId, attempts: 0,
          status: gated ? 'blocked' : 'pending', scanStatus: gated ? 'pending' : 'not_required',
          ...(gated ? { scanDetail: 'Uploaded without a rights attestation; upload it again from Documents to process it.' } : {}),
        },
      },
      { upsert: true },
    );
  }
  const stale = await CurriculumFileJob.find({ curriculumId: curriculum.id, status: { $ne: 'removed' } }).lean();
  for (const job of stale.filter((j) => !known.has(j.fileUrl))) {
    await CurriculumChunk.deleteMany({ curriculumId: curriculum.id, fileUrl: job.fileUrl });
    await CurriculumFileJob.updateOne({ id: job.id }, { $set: { status: 'removed', detail: 'File removed from the curriculum' } });
  }
}

async function processJob(jobId: string) {
  const job = await CurriculumFileJob.findOneAndUpdate(
    { id: jobId, status: { $in: ['pending', 'failed'] }, attempts: { $lt: MAX_ATTEMPTS } },
    { $set: { status: 'processing' }, $inc: { attempts: 1 } },
    { new: true },
  );
  if (!job) return;
  const fileName = path.basename(job.fileUrl);
  const finish = (status: 'done' | 'failed' | 'unsupported' | 'no_text' | 'blocked', fields: Record<string, unknown> = {}) =>
    CurriculumFileJob.updateOne({ id: job.id }, { $set: { status, extractionVersion: EXTRACTION_VERSION, ...fields } });
  // Safety gate: never read a file that is not attested and scanned clean.
  if (!isClearedForProcessing(job, await isDocumentSafetyRequired(job.institutionId))) {
    return void (await finish('blocked', { detail: 'Not cleared for processing (needs a rights attestation and a clean malware scan)' }));
  }
  try {
    if (!job.fileUrl.startsWith('/uploads/')) return void (await finish('unsupported', { detail: 'Only uploaded files are processed' }));
    const file = await readUpload(fileName);
    if (!file) return void (await finish('failed', { detail: 'File not found in storage' }));
    if (file.body.length > MAX_FILE_BYTES) return void (await finish('unsupported', { detail: 'File larger than 30 MB' }));
    const extracted = await extractPages(file.body, fileName);
    if (!extracted) return void (await finish('unsupported', { detail: `No text extraction for ${path.extname(fileName) || 'this file type'}` }));
    const contentHash = createHash('sha256').update(file.body).digest('hex');
    const pagesWithText = extracted.pages.filter((p) => p.trim().length > 20).length;
    if (!pagesWithText) {
      await CurriculumChunk.deleteMany({ curriculumId: job.curriculumId, fileUrl: job.fileUrl });
      return void (await finish('no_text', { pages: extracted.pages.length, pagesWithText: 0, contentHash, detail: 'No text layer found (scanned document?). Needs OCR, which is not supported yet.' }));
    }
    const objectives = await LearningObjective.find({ institutionId: job.institutionId, curriculumId: job.curriculumId, lessonIds: job.lessonId, status: 'approved' }).select('id').lean();
    const chunks = extracted.pages.flatMap((text, i) =>
      chunkPage(text, extracted.kind === 'pdf' ? i + 1 : undefined).map((c) => ({ ...c, sectionLabel: extracted.labels?.[i] })),
    );
    // Replace this file's passages in one go.
    await CurriculumChunk.deleteMany({ curriculumId: job.curriculumId, fileUrl: job.fileUrl });
    await CurriculumChunk.insertMany(
      chunks.map((c, index) => {
        const terms = searchTerms(c.text);
        return {
          id: `chunk-${randomUUID()}`,
          institutionId: job.institutionId,
          curriculumId: job.curriculumId,
          lessonId: job.lessonId,
          fileUrl: job.fileUrl,
          fileName: job.fileName ?? fileName.replace(/^[0-9a-f-]{36}-/i, ''),
          uploadId: job.id,
          page: c.page,
          sectionLabel: c.sectionLabel,
          chunkIndex: index,
          text: c.text,
          terms: [...new Set(terms)],
          termCount: terms.length,
          objectiveIds: objectives.map((o) => o.id),
          contentHash,
          extractionVersion: EXTRACTION_VERSION,
        };
      }),
    );
    const partial = pagesWithText < extracted.pages.length;
    await finish('done', {
      pages: extracted.pages.length,
      pagesWithText,
      extractedChars: extracted.pages.reduce((n, p) => n + p.length, 0),
      chunkCount: chunks.length,
      contentHash,
      detail: partial ? `${extracted.pages.length - pagesWithText} page(s) had no text layer and were skipped` : undefined,
    });
  } catch (error) {
    logger.warn('curriculum_extraction_failed', { jobId: job.id, error: serializeError(error) });
    await finish('failed', { detail: String((error as Error).message).slice(0, 300) });
  }
}

// Processes pending/failed files, optionally for one curriculum.
export async function processCurriculumFiles(params: { curriculumId?: string; limit?: number } = {}) {
  // A run that died mid-file (function timeout) leaves 'processing' behind;
  // after 15 minutes it is treated as a failed attempt.
  await CurriculumFileJob.updateMany(
    { status: 'processing', updatedAt: { $lt: new Date(Date.now() - 15 * 60 * 1000) } },
    { $set: { status: 'failed', detail: 'Processing did not finish' } },
  );
  if (params.curriculumId) {
    const curriculum = await Curriculum.findOne({ id: params.curriculumId }).lean();
    if (curriculum) await syncCurriculumJobs(curriculum);
  }
  const jobs = await CurriculumFileJob.find({
    status: { $in: ['pending', 'failed'] },
    attempts: { $lt: MAX_ATTEMPTS },
    ...(params.curriculumId ? { curriculumId: params.curriculumId } : {}),
  })
    .sort({ updatedAt: 1 })
    .limit(params.limit ?? 5)
    .lean();
  for (const job of jobs) await processJob(job.id);
  return { processed: jobs.length };
}

// After a curriculum's files change: record jobs and start processing in the
// background (finished by the daily job if the request ends first). Only for
// schools with learning intelligence on.
export function queueCurriculumProcessing(curriculum: Pick<ICurriculum, 'id' | 'institutionId' | 'chapters'>) {
  const run = async () => {
    const { isFeatureEnabled } = await import('./featureFlags');
    if (!(await isFeatureEnabled(curriculum.institutionId, 'learning_intelligence_enabled'))) return;
    await syncCurriculumJobs(curriculum);
    await processCurriculumFiles({ curriculumId: curriculum.id, limit: 2 });
  };
  const task = run().catch((error) => logger.warn('curriculum_processing_queue_failed', { error: serializeError(error) }));
  import('@vercel/functions').then(({ waitUntil }) => waitUntil(task)).catch(() => undefined);
  return task;
}
