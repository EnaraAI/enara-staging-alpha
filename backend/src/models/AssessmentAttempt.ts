import { Schema, model, Document } from 'mongoose';

export interface IAttemptAnswer {
  questionId: string;
  questionText: string;
  topic?: string;
  studentAnswer: string | number;
  correctAnswer?: string | number;
  isCorrect: boolean;
  explanation: string;
  // Phase 3 grading (assignment attempts). Points awarded (null until graded),
  // how they were set, feedback, and whether a person must look at it.
  // 'ai': set by the automatic grader after validation (autograde-v1);
  // 'ai_proposal': a teacher accepted an AI proposal (older records).
  points?: number | null;
  maxPoints?: number;
  method?: 'rule' | 'ai' | 'ai_proposal' | 'teacher';
  feedback?: string;
  // From the automatic grader: why this score, what went well, what to work on.
  scoreExplanation?: string;
  strengths?: string[];
  improvements?: string[];
  // The first final score, kept when a teacher corrects it.
  originalPoints?: number;
  criterionScores?: { criterionId: string; levelId?: string; points: number }[];
  needsReview?: boolean;
  proposalId?: string;
}

// Automatic grading (autograde-v1):
//   grading_queued → grading_in_progress → finalized → released
//   grading_in_progress → grading_failed (retried later) → … → grading_exception (retries used up)
// 'finalized' and 'released' are written together by the grader. The older
// values (grading_pending, needs_review, graded_draft) remain for existing
// records and for schools that grade open answers by hand.
export type GradingStatus =
  | 'grading_queued' | 'grading_in_progress' | 'grading_failed' | 'grading_exception'
  | 'grading_pending' | 'needs_review' | 'graded_draft' | 'finalized' | 'released';
export const GRADING_STATUSES: GradingStatus[] = ['grading_queued', 'grading_in_progress', 'grading_failed', 'grading_exception', 'grading_pending', 'needs_review', 'graded_draft', 'finalized', 'released'];
export type IntelligenceStatus = 'pending' | 'done' | 'failed';

// source (P4 speaking exams): 'speech' is transcribed from the student's own
// recorded audio; 'typed_accommodation' is a teacher-allowed typed reply,
// never an oral score.
export interface IConversationTurn {
  questionId: string;
  role: 'examiner' | 'student';
  kind?: 'question' | 'follow_up' | 'closing';
  text: string;
  at: Date;
  source?: 'speech' | 'typed_accommodation';
  audioSeconds?: number;
}

// One speaking-exam attempt: how it was delivered, consent and evidence.
export interface ISpeakingAttempt {
  mode: 'voice_only' | 'voice_avatar' | 'text_accommodation';
  requestedMode?: string;
  settingsVersion: number;
  consentAt: Date;
  voiceSessionId: string;
  avatarSessionId?: string;
  fallback?: { from: string; to: string; at: Date; reason: string };
  studentTurns: number;
  noSpeechCount: number;
  audioSeconds: number;
  evidence?: 'sufficient' | 'insufficient';
  // Measures the transcript cannot support.
  notAssessed: string[];
  assessedAs?: 'spoken' | 'written_accommodation';
  transcriptPurgedAt?: Date;
}

export interface IAppeal {
  id: string;
  questionId?: string;
  message: string;
  createdAt: Date;
  status: 'open' | 'upheld' | 'rejected';
  response?: string;
  resolvedBy?: string;
  resolvedAt?: Date;
}

export interface IAssessmentAttempt extends Document {
  id: string;
  assessmentId: string;
  assessmentTitle: string;
  subject: string;
  studentId: string;
  institutionId?: string;
  // 'abandoned': an older duplicate open attempt, closed by a migration.
  status: 'in-progress' | 'submitted' | 'abandoned';
  answers: IAttemptAnswer[];
  score?: number;
  startedAt: Date;
  submittedAt?: Date;
  timeSpentSec?: number;
  // Phase 3: attempts on an assignment.
  assignmentId?: string;
  assessmentVersion?: number;
  // Answers saved before submitting (save/resume).
  draftAnswers?: Record<string, string | number>;
  draftSavedAt?: Date;
  // Conversation exams: every turn with the AI examiner, and where it is.
  conversation?: IConversationTurn[];
  conversationState?: { index: number; probed: boolean; done: boolean };
  speaking?: ISpeakingAttempt;
  // Time limit: the attempt can't be submitted after this.
  expiresAt?: Date;
  isLate?: boolean;
  gradingStatus?: GradingStatus;
  totalPoints?: number;
  maxPoints?: number;
  // Feedback for the whole attempt (shown once released).
  overallFeedback?: string;
  finalizedAt?: Date;
  finalizedBy?: string;
  releasedAt?: Date;
  // Automatic grading bookkeeping.
  gradingRuns?: number;
  gradingLeaseUntil?: Date;
  nextGradingAt?: Date;
  gradingError?: string;
  exceptionReason?: string;
  // Phase 2 update after release; retried on its own, never regrades.
  intelligenceStatus?: IntelligenceStatus;
  intelligenceAttempts?: number;
  intelligenceUpdatedAt?: Date;
  appeals?: IAppeal[];
  // Append-only audit trail of grading actions.
  history: { at: Date; by?: string; action: string; questionId?: string; from?: unknown; to?: unknown; reason?: string }[];
  // Demo/live separation (P1): seeded demo data is 'demo_seed'.
  origin?: 'live' | 'demo_seed';
}

const attemptAnswerSchema = new Schema<IAttemptAnswer>(
  {
    questionId: String,
    questionText: String,
    topic: String,
    studentAnswer: Schema.Types.Mixed,
    correctAnswer: Schema.Types.Mixed,
    isCorrect: Boolean,
    explanation: String,
    points: { type: Number, default: undefined },
    maxPoints: Number,
    method: { type: String, enum: ['rule', 'ai', 'ai_proposal', 'teacher'] },
    feedback: String,
    scoreExplanation: String,
    strengths: { type: [String], default: undefined },
    improvements: { type: [String], default: undefined },
    originalPoints: Number,
    criterionScores: { type: [{ criterionId: String, levelId: String, points: Number, _id: false }], default: undefined },
    needsReview: Boolean,
    proposalId: String,
  },
  { _id: false }
);

const assessmentAttemptSchema = new Schema<IAssessmentAttempt>(
  {
    id: { type: String, required: true, unique: true, index: true },
    assessmentId: { type: String, required: true, index: true },
    assessmentTitle: { type: String, required: true },
    subject: { type: String, default: '' },
    studentId: { type: String, required: true, index: true },
    institutionId: { type: String, index: true },
    status: { type: String, enum: ['in-progress', 'submitted', 'abandoned'], default: 'in-progress' },
    answers: { type: [attemptAnswerSchema], default: [] },
    score: Number,
    startedAt: { type: Date, default: Date.now },
    submittedAt: Date,
    timeSpentSec: Number,
    assignmentId: { type: String, index: true },
    assessmentVersion: Number,
    draftAnswers: { type: Schema.Types.Mixed, default: undefined },
    draftSavedAt: Date,
    conversation: {
      type: [{ questionId: String, role: { type: String, enum: ['examiner', 'student'] }, kind: { type: String, enum: ['question', 'follow_up', 'closing'] }, text: String, at: Date, source: { type: String, enum: ['speech', 'typed_accommodation'] }, audioSeconds: Number, _id: false }],
      default: undefined,
    },
    conversationState: { type: { index: Number, probed: Boolean, done: Boolean, _id: false }, default: undefined },
    speaking: { type: Schema.Types.Mixed, default: undefined },
    expiresAt: Date,
    isLate: Boolean,
    gradingStatus: { type: String, enum: GRADING_STATUSES },
    totalPoints: Number,
    maxPoints: Number,
    overallFeedback: String,
    finalizedAt: Date,
    finalizedBy: String,
    releasedAt: Date,
    gradingRuns: Number,
    gradingLeaseUntil: Date,
    nextGradingAt: Date,
    gradingError: String,
    exceptionReason: String,
    intelligenceStatus: { type: String, enum: ['pending', 'done', 'failed'] },
    intelligenceAttempts: Number,
    intelligenceUpdatedAt: Date,
    appeals: {
      type: [{ id: String, questionId: String, message: String, createdAt: Date, status: { type: String, enum: ['open', 'upheld', 'rejected'] }, response: String, resolvedBy: String, resolvedAt: Date, _id: false }],
      default: undefined,
    },
    history: {
      type: [{ at: Date, by: String, action: String, questionId: String, from: Schema.Types.Mixed, to: Schema.Types.Mixed, reason: String, _id: false }],
      default: [],
    },
    origin: { type: String, enum: ['live', 'demo_seed'], default: 'live' },
  },
  { timestamps: true }
);

assessmentAttemptSchema.index({ studentId: 1, assessmentId: 1 });
// At most one open attempt per student and assessment.
assessmentAttemptSchema.index(
  { studentId: 1, assessmentId: 1 },
  { unique: true, partialFilterExpression: { status: 'in-progress' }, name: 'one_open_attempt' },
);
assessmentAttemptSchema.index({ institutionId: 1, status: 1, submittedAt: -1 });
assessmentAttemptSchema.index({ assignmentId: 1, studentId: 1, status: 1 });
assessmentAttemptSchema.index({ institutionId: 1, gradingStatus: 1, submittedAt: 1 });
// Sweeps: attempts due for (re)grading, and Phase 2 updates to retry.
assessmentAttemptSchema.index({ gradingStatus: 1, nextGradingAt: 1 });
assessmentAttemptSchema.index({ intelligenceStatus: 1, intelligenceUpdatedAt: 1 });

export const AssessmentAttempt = model<IAssessmentAttempt>(
  'AssessmentAttempt',
  assessmentAttemptSchema
);
