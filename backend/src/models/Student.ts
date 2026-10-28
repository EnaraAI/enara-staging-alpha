import { Schema, model, Document } from 'mongoose';

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
}

const studentSchema = new Schema<IStudent>(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    email: { type: String, required: true },
    grade: { type: String, default: '' },
    avatar: { type: String, default: '' },
    institutionId: { type: String, index: true },
    batchId: { type: String, index: true },
    academicYear: { type: String },
    groupId: { type: String },
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
  },
  { timestamps: true }
);

studentSchema.index({ institutionId: 1, email: 1 });

export const Student = model<IStudent>('Student', studentSchema);
