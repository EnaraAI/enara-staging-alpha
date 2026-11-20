import { LEARNER_AGE_BANDS, type LearnerAgeBand } from './learnerAgeBand';
import { Schema, model, Document } from 'mongoose';

export const STUDENT_UI_MODES = ['standard', 'kids'] as const;
// planner2: the learner's main goal for English (lesson shape TASK needs work, exam or daily life).
export const LEARNING_GOALS = ['work', 'exam', 'daily', 'school'] as const;
export type LearningGoal = (typeof LEARNING_GOALS)[number];
export const isLearningGoal = (v: unknown): v is LearningGoal => typeof v === 'string' && (LEARNING_GOALS as readonly string[]).includes(v);
export type StudentUiMode = (typeof STUDENT_UI_MODES)[number];

export interface IStudent extends Document {
  id: string;
  name: string;
  email: string;
  grade: string;
  avatar: string;
  institutionId?: string;
  batchId?: string;
  academicYear?: string;
  groupId?: string;
  // Trusted, staff-set coarse learning-context category (not an exact age).
  // Written only by Workspace Admins via /api/age-bands; never selected by
  // default so existing reads don't expose it.
  learnerAgeBand?: LearnerAgeBand;
  // Optional exact birth date (Parents Portal). When set it decides the
  // parent-portal tier (age < 13 = kid); otherwise learnerAgeBand does.
  // Never selected by default.
  birthDate?: Date;
  progress?: number;
  avgScore?: number;
  studyTime?: string;
  streak?: number;
  status?: 'excelling' | 'on track' | 'at risk';
  currentModule?: string;
  affinitySubject?: string;
  ttu?: number;
  learningEngineProfile?: {
    primaryEngine: string;
    efficiencyRating: number;
    cylinderBreakdown: { analysis: string; dominance: string[] };
    clusterTag: string;
    executiveSummary: string;
  };
  adaptiveProfile?: {
    preferredLearningStyle: string;
    strengths: string[];
    weaknesses: string[];
    topicMastery: Record<string, number>;
  };
  riskPrediction?: {
    dropoutRisk: number;
    examFailureProbability: number;
    factors: string[];
    trend: 'improving' | 'stable' | 'declining';
  };
  nextBestActions?: Array<{
    id: string;
    type: 'plan' | 'action' | 'recommendation';
    title: string;
    description: string;
    priority: 'High' | 'Medium' | 'Low';
    expectedImpact: number;
    confidenceLevel: number;
    status: 'pending' | 'approved' | 'rejected' | 'completed';
  }>;
  subjects?: Array<{
    name: string;
    progress: number;
    score: number;
    assessmentAccuracy?: number;
    weakConceptRatio?: number;
    firstAttemptSuccessRate?: number;
    knowledgeRetentionScore?: number;
    learningStyleAffinity?: string;
    optimalReviewCadence?: string;
  }>;
  // Demo/live separation (P1): seeded demo data is 'demo_seed'.
  origin?: 'live' | 'demo_seed';
  // 'kids' shows this student the Enara Kids interface (set per student by school staff).
  uiMode?: StudentUiMode;
  // Profile photo (approved) and a student's own upload awaiting a school admin.
  // Urls are plain /uploads/<key> paths, signed per response (uploadSigning).
  photoUrl?: string;
  photoKey?: string;
  pendingPhotoUrl?: string;
  pendingPhotoKey?: string;
  pendingPhotoAt?: Date;
  // Multi-class step 6 (ENROLLMENT_STUDENT_ARCHIVE): set while the student is
  // archived. `archive` records exactly what the archive ended, so a restore
  // puts back only that (IDs only).
  archivedAt?: Date;
  archivedBy?: string;
  archive?: StudentArchiveRecord;
  // planner2: main goal, asked once at onboarding (teen/adult: the learner; child: the parent or school) and editable.
  learningGoal?: LearningGoal;
  learningGoalSetAt?: Date;
  learningGoalSetBy?: 'student' | 'parent' | 'school';
  // The onboarding question was shown and skipped: not asked again automatically.
  learningGoalSkippedAt?: Date;
}

export interface StudentArchiveRecord {
  batchId?: string;
  classIds: string[];
  enrollmentIds: string[];
  userIds: string[];
}

const studentSchema = new Schema<IStudent>(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    email: { type: String, required: true },
    grade: { type: String, default: '' },
    uiMode: { type: String, enum: STUDENT_UI_MODES, default: 'standard' },
    avatar: { type: String, default: '' },
    photoUrl: { type: String },
    photoKey: { type: String },
    pendingPhotoUrl: { type: String },
    pendingPhotoKey: { type: String },
    pendingPhotoAt: { type: Date, index: true },
    institutionId: { type: String, index: true },
    batchId: { type: String, index: true },
    academicYear: { type: String },
    groupId: { type: String },
    learnerAgeBand: { type: String, enum: LEARNER_AGE_BANDS, select: false },
    birthDate: { type: Date, select: false },
    learningGoal: { type: String, enum: LEARNING_GOALS },
    learningGoalSetAt: { type: Date },
    learningGoalSetBy: { type: String, enum: ['student', 'parent', 'school'] },
    learningGoalSkippedAt: { type: Date },
    progress: { type: Number, default: 0 },
    avgScore: { type: Number, default: 0 },
    studyTime: { type: String, default: '0h/week' },
    streak: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['excelling', 'on track', 'at risk'],
      default: 'on track',
    },
    currentModule: { type: String, default: '' },
    affinitySubject: String,
    ttu: Number,
    learningEngineProfile: { type: Schema.Types.Mixed },
    adaptiveProfile: { type: Schema.Types.Mixed },
    riskPrediction: { type: Schema.Types.Mixed },
    nextBestActions: { type: [Schema.Types.Mixed], default: [] },
    subjects: { type: [Schema.Types.Mixed], default: [] },
    origin: { type: String, enum: ['live', 'demo_seed'], default: 'live' },
    archivedAt: { type: Date },
    archivedBy: { type: String },
    archive: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

studentSchema.index({ institutionId: 1, email: 1 });

export const Student = model<IStudent>('Student', studentSchema);
