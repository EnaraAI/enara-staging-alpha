import { Schema, model, Document } from 'mongoose';

// A passage of extracted curriculum text, with where it came from (file, page)
// so the tutor can cite it. Derived data: rebuilt from the uploaded file.
export interface ICurriculumChunk extends Document {
  id: string;
  institutionId: string;
  curriculumId: string;
  lessonId: string;
  fileUrl: string;
  fileName: string;
  // The document this passage came from (its CurriculumFileJob id, P2).
  // Passages extracted before P2 have none and are never attributed to a
  // document: an uploadIds-scoped search leaves them out.
  uploadId?: string;
  page?: number;
  // Where exact pages don't exist (Word files): "Section 2: Heading".
  sectionLabel?: string;
  chunkIndex: number;
  text: string;
  // Normalised search terms (unique), for keyword retrieval.
  terms: string[];
  termCount: number;
  objectiveIds: string[];
  contentHash: string;
  extractionVersion: string;
  createdAt: Date;
}

const chunkSchema = new Schema<ICurriculumChunk>(
  {
    id: { type: String, required: true, unique: true },
    institutionId: { type: String, required: true },
    curriculumId: { type: String, required: true },
    lessonId: { type: String, required: true },
    fileUrl: { type: String, required: true },
    fileName: { type: String, required: true },
    uploadId: String,
    page: Number,
    sectionLabel: String,
    chunkIndex: { type: Number, required: true },
    text: { type: String, required: true },
    terms: { type: [String], default: [] },
    termCount: { type: Number, default: 0 },
    objectiveIds: { type: [String], default: [] },
    contentHash: { type: String, required: true },
    extractionVersion: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: 'curriculum_chunks', versionKey: false },
);
chunkSchema.index({ institutionId: 1, curriculumId: 1, terms: 1 });
chunkSchema.index({ institutionId: 1, curriculumId: 1, fileUrl: 1 });
chunkSchema.index({ institutionId: 1, uploadId: 1 });

export const CurriculumChunk = model<ICurriculumChunk>('CurriculumChunk', chunkSchema);

// Processing status of one uploaded file; since P2 also the document record
// (its id is the document's uploadId): who uploaded it, their rights
// attestation, the malware-scan state and retention.
// 'deferred': no malware scanner is configured and the school's document
// policy allows AI processing without one. It means NOT scanned; never clean.
export type ScanStatus = 'not_required' | 'pending' | 'unavailable' | 'clean' | 'infected' | 'failed' | 'deferred';
export interface ICurriculumFileJob extends Document {
  id: string;
  institutionId: string;
  curriculumId: string;
  lessonId: string;
  fileUrl: string;
  // 'blocked': not extracted because the document is not cleared for
  // processing (no attestation, or the scan is not clean).
  status: 'pending' | 'processing' | 'done' | 'failed' | 'unsupported' | 'no_text' | 'removed' | 'blocked';
  fileName?: string;
  contentType?: string;
  sizeBytes?: number;
  uploadedBy?: string;
  rightsAttestation?: { attestedBy: string; attestedAt: Date; statementVersion: string };
  // Set by the server only. 'not_required': a school without the documents
  // safety gate (pre-P2 behaviour); never shown as "scanned".
  scanStatus?: ScanStatus;
  scanProvider?: string;
  scanDetail?: string;
  scannedAt?: Date;
  scanAttempts?: number;
  origin?: 'live' | 'demo_seed';
  deletedAt?: Date;
  deletionReason?: 'retention' | 'user' | 'infected';
  // Human-readable reason for anything other than done.
  detail?: string;
  pages?: number;
  pagesWithText?: number;
  extractedChars?: number;
  chunkCount?: number;
  contentHash?: string;
  attempts: number;
  extractionVersion?: string;
  updatedAt: Date;
}

const jobSchema = new Schema<ICurriculumFileJob>(
  {
    id: { type: String, required: true, unique: true },
    institutionId: { type: String, required: true },
    curriculumId: { type: String, required: true },
    lessonId: { type: String, required: true },
    fileUrl: { type: String, required: true },
    status: { type: String, enum: ['pending', 'processing', 'done', 'failed', 'unsupported', 'no_text', 'removed', 'blocked'], default: 'pending' },
    fileName: String,
    contentType: String,
    sizeBytes: Number,
    uploadedBy: String,
    rightsAttestation: { type: { attestedBy: String, attestedAt: Date, statementVersion: String, _id: false }, default: undefined },
    scanStatus: { type: String, enum: ['not_required', 'pending', 'unavailable', 'clean', 'infected', 'failed', 'deferred'] },
    scanProvider: String,
    scanDetail: String,
    scannedAt: Date,
    scanAttempts: { type: Number, default: 0 },
    origin: { type: String, enum: ['live', 'demo_seed'], default: 'live' },
    deletedAt: Date,
    deletionReason: { type: String, enum: ['retention', 'user', 'infected'] },
    detail: String,
    pages: Number,
    pagesWithText: Number,
    extractedChars: Number,
    chunkCount: Number,
    contentHash: String,
    attempts: { type: Number, default: 0 },
    extractionVersion: String,
  },
  { collection: 'curriculum_processing_jobs', versionKey: false, timestamps: true },
);
jobSchema.index({ curriculumId: 1, fileUrl: 1 }, { unique: true });
jobSchema.index({ status: 1, updatedAt: 1 });
jobSchema.index({ institutionId: 1, curriculumId: 1 });
jobSchema.index({ scanStatus: 1, updatedAt: 1 });

export const CurriculumFileJob = model<ICurriculumFileJob>('CurriculumFileJob', jobSchema);
