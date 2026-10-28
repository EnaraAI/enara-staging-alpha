
export type UserRole = 'student' | 'teacher' | 'admin' | 'enara-admin';

export interface LearningEngineProfile {
  primaryEngine: string; // e.g., 'Socratic', 'Linear-Logical', etc.
  efficiencyRating: number; // percentage
  cylinderBreakdown: {
    analysis: string;
    dominance: string[];
  };
  clusterTag: string; // e.g., 'TECH-KIN-01'
  executiveSummary: string;
}

export interface Student {
  id: string;
  name: string;
  email: string;
  grade: string;
  avatar: string;
  progress: number;
  avgScore: number;
  studyTime: string;
  streak: number;
  status: 'excelling' | 'on track' | 'at risk';
  currentModule: string;
  affinitySubject?: string;
  learningEngineProfile?: LearningEngineProfile;
  subjects: Array<{
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
  batchId?: string;
  academicYear?: string;
  groupId?: string;
  ttu?: number; // Time-to-Understanding in minutes/hours
  password?: string;
  credentialsGenerated?: boolean;
  adaptiveProfile?: AdaptiveProfile;
  riskPrediction?: RiskPrediction;
  nextBestActions?: NextBestAction[];
  pastResults?: ExamResult[];
  chatLogs?: ChatMessage[];
}

export interface NextBestAction {
  id: string;
  type: 'plan' | 'action' | 'recommendation';
  title: string;
  description: string;
  priority: 'High' | 'Medium' | 'Low';
  expectedImpact: number; // percentage
  confidenceLevel: number; // percentage
  status: 'pending' | 'approved' | 'rejected' | 'completed';
}

export interface RiskPrediction {
  dropoutRisk: number; // percentage
  examFailureProbability: number; // percentage
  factors: string[];
  trend: 'improving' | 'stable' | 'declining';
}

export interface AdaptiveProfile {
  preferredLearningStyle: string;
  strengths: string[];
  weaknesses: string[];
  topicMastery: Record<string, number>;
}

export interface CourseInstance {
  id: string;
  courseId: string;
  courseName: string;
  academicYear: string;
  batchId: string;
  curriculumId?: string;
  groupId?: string;
  studentIds: string[];
}

export interface ExamResult {
  assessmentId: string;
  assessmentTitle: string;
  score: number;
  answers: Array<{
    questionId: string;
    questionText: string;
    topic?: string;
    studentAnswer: string | number;
    correctAnswer: string | number;
    isCorrect?: boolean;
    explanation: string;
    modelAnswer?: string;
    manualScore?: number;
    manualFeedback?: string;
    isManuallyGraded?: boolean;
  }>;
  date: string;
  isManuallyGraded?: boolean;
  manualTotalScore?: number;
}

export interface Chapter {
  id: string;
  title: string;
  uploads: string[]; // URLs or file names
  description?: string;
}

export interface Curriculum {
  id: string;
  name: string;
  courseName: string;
  type: string; // e.g., 'American', 'National', 'IB', 'IGCSE'
  level: string; // e.g., 'Grade 10', 'Advanced'
  languages: string[];
  summary: string; // Mandatory for AI context
  description: string;
  lastUpdated: string;
  subjectsCount: number;
  assignedBatches: string[];
  chapters: Chapter[];
  status: 'draft' | 'deployed';
  deploymentLink?: string;
  tags?: string[];
  firestoreDocId?: string;
}

export interface Batch {
  id: string;
  name: string;
  studentCount: number;
  curriculumId?: string;
  academicYear: string;
  groupId?: string;
}

export interface Lesson {
  id: string;
  title: string;
  duration: string;
  status: 'completed' | 'active' | 'locked';
  content?: string;
  order: number;
  materials?: string[];
  videoUrl?: string;
  quiz?: {
    questions: Array<{
      id: string;
      text: string;
      options: string[];
      correctAnswer: number;
      explanation: string;
    }>;
  };
}

export interface Module {
  id: string;
  title: string;
  status: 'completed' | 'active' | 'locked';
  lessonsCount: number;
  completedLessons: number;
  lessons: Lesson[];
  materials?: string[];
  explanation?: string;
}

export interface Course {
  id: string;
  subject: string;
  title: string;
  modules: Module[];
}

export interface ChatMessage {
  id: string;
  role: 'ai' | 'user';
  text: string;
  timestamp: Date;
  imageUrl?: string;
  imagePrompt?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  timestamp: Date;
  lessonTitle?: string;
}

export interface Question {
  id: string;
  type: 'multiple-choice' | 'true-false' | 'short-answer';
  text: string;
  topic?: string;
  options?: string[]; // Optional for short-answer
  correctAnswer: string | number; // Index for MC/TF, string for short-answer
  explanation: string;
  modelAnswer?: string;
}

export interface RubricLevel {
  score: number;
  label: string; // e.g., "Exceeds Expectations", "Meets Expectations", "Developing", "Beginning"
  description: string;
}

export interface RubricCriterion {
  id: string;
  category: string; // e.g., "Content Accuracy", "Clarity of Writing", "Critical Thinking"
  weight: number; // e.g., percentage or points
  levels: RubricLevel[];
}

export interface Rubric {
  id: string;
  title: string;
  description: string;
  totalPoints: number;
  criteria: RubricCriterion[];
  subject?: string;
  curriculumId?: string;
}

export interface Assessment {
  id: string;
  title: string;
  subject: string;
  duration: number; // in minutes
  questions: Question[];
  status: 'upcoming' | 'active' | 'completed' | 'pending' | 'in-progress';
  dueDate: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  curriculumId?: string;
  batchId?: string;
  studentId?: string; // For individual assignments
  instructions?: string;
  rubric?: Rubric;
}

export interface AssessmentRecommendation {
  suggestedTopic: string;
  suggestedDifficulty: 'Easy' | 'Medium' | 'Hard';
  suggestedQuestionTypes: string[];
  reasoning: string;
  focusAreas: string[];
}

export interface UsageEvent {
  id: string;
  userId: string;
  userName: string;
  organizationId: string;
  subAccountId?: string; // class/team
  feature: 'chat' | 'voice' | 'assessment' | 'curriculum' | 'research';
  model: string;
  requestId: string;
  sessionId: string;
  tokensIn?: number;
  tokensOut?: number;
  creditsUsed: number;
  timestamp: Date;
}

export interface Transaction {
  id: string;
  walletId: string;
  amount: number;
  type: 'allocation' | 'deduction' | 'adjustment';
  referenceUsageEventId?: string;
  timestamp: Date;
  description: string;
  performedBy: string; // 'Enara' or 'Admin Name'
}

export interface CreditLimit {
  id: string;
  targetId: string; // userId or subAccountId or organizationId
  targetType: 'user' | 'team' | 'org';
  limit: number;
  usage: number;
  period: 'daily' | 'monthly' | 'total';
  status: 'active' | 'blocked' | 'throttled';
  restrictedFeatures: string[];
}

export interface OrganizationWallet {
  id: string;
  orgId: string;
  balance: number;
  totalAllocated: number;
  totalConsumed: number;
  lastRechargeDate?: string;
}

export interface Institution {
  id: string;
  name: string;
  logo?: string;
  studentCount: number;
  activeStudents: number;
  signupDate: string;
  status: 'Healthy' | 'Warning' | 'At Risk' | 'Churned';
  tier: 'Standard' | 'Custom' | 'Enterprise';
  region: string;
  lastActive: string;
  mrr: number;
  arr: number;
  growthRate: number;
  onboardingDays: number;
  supportTickets: number;
  avgResolutionTime: string;
}

export interface Contract {
  id: string;
  institutionId: string;
  institutionName: string;
  startDate: string;
  expiryDate: string;
  value: number;
  creditsAllocated: number;
  pricePerCredit: number;
  discount: number;
  autoRenewal: boolean;
  status: 'Active' | 'Pending Renewal' | 'Expired';
}

export interface AuditLog {
  id: string;
  timestamp: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  action: string;
  category: 'Access' | 'Configuration' | 'Data' | 'System' | 'Security';
  details: string;
  ipAddress: string;
  signature: string;
}

export interface PlatformHealthMetrics {
  avgRagConfidence: number;
  outOfScopeRate: number;
  avgLatency: number;
  requestsPerSec: number;
  uptime: number;
}

export interface ROIMetrics {
  adoptionRate: number;
  selfServiceRate: number;
  teacherHoursSaved: number;
  avgExamScoreImprovement: number;
}

export interface InstitutionAnalytics {
  orgId: string;
  creditsUsed: number;
  creditsRemaining: number;
  creditsBurnedPerCourse: Array<{ courseId: string; courseName: string; credits: number }>;
  projectedDepletionDate: string;
  costPerStudentPerMonth: number;
  costPerResolvedQuestion: number;
  hoursSavedForTeachers: number;
  studentSelfServiceRate: number;
  activeToEnrolledRatio: number;
  courseEngagementRanking: Array<{ courseId: string; courseName: string; score: number }>;
  strugglingCourses: Array<{ courseId: string; courseName: string; struggleRate: number; contentGaps: string[] }>;
}

export interface CourseAnalytics {
  courseId: string;
  mostAskedQuestions: Array<{ text: string; count: number }>;
  difficultyHeatmap: Array<{ topic: string; difficultyLevel: number }>;
  engagementQuality: {
    avgConversationDepth: number;
    resolutionRate: number;
    repetitionRate: number;
    avgSessionDuration: number;
    returnRatePerTopic: Array<{ topic: string; rate: number }>;
  };
  contentGapDetection: {
    lowConfidenceQuestions: Array<{ text: string; confidence: number }>;
    outsideCourseClusters: string[];
    unansweredClusters: string[];
  };
  preExamBehavior: {
    chatVolume48h: number;
    topicSpikes: string[];
    nightBeforeStudyVsScore: Array<{ studentId: string; studyTime: number; score: number }>;
  };
}

export interface StudentDetailedAnalytics {
  studentId: string;
  totalSessions: number;
  sessionTypeDistribution: { long: number; short: number };
  languageDistribution: { arabic: number; english: number };
  avgSatisfaction: number;
  untouchedChapters: string[];
  totalCalls: number;
  learningTrajectory: {
    struggleResolutionTimeline: number;
    knowledgeProgression: Array<{ chapterId: string; progress: number }>;
    chatEngagementVsScore: number;
    lastActivityBeforeExam: string;
    badges: Array<'Watch' | 'At Risk' | 'Alert'>;
  };
  telemetry: {
    videoWatchTime: number;
    skippedContentCorrelation: number;
    chapterVisitPatterns: Array<{ chapterId: string; visits: number }>;
    chattedBeforeVideo: boolean;
    docScrollDepth: number;
    rewindHeatmap: any;
    contentVsChatRelation: number;
    timeToFirstChat: number;
  };
}

export interface ApiKey {
  id: string;
  key: string; // Bearer token
  adminId: string;
  adminEmail: string;
  institutionId: string;
  institutionName: string;
  lmsSystemId?: string;
  permissions: string[];
  status: 'active' | 'expired' | 'revoked';
  createdAt: string;
  expiryDate: string;
}

export interface ApiKeyValidationRequest {
  apiKey: string;
  lmsSystemId?: string;
  adminIdentifier: string; // email or ID
  institutionIdentifier: string; // name or ID
}

export interface ApiKeyValidationResponse {
  isValid: boolean;
  message: string;
  details?: {
    apiKeyStatus: 'active' | 'expired' | 'revoked' | 'not_found';
    adminMatch: boolean;
    institutionMatch: boolean;
    lmsMatch: boolean;
    hasPermissions: boolean;
    permissions: string[];
  };
}

export interface InstitutionCreationRequest {
  institutionName: string;
  lmsSystem: string;
  adminName: string;
  adminEmail: string;
  adminPhone: string;
}

export interface InstitutionCreationResponse {
  success: boolean;
  message: string;
  credentials?: {
    username: string;
    password: string;
  };
  apiKey?: string;
  institutionId: string;
}

export interface LiveAvatar {
  id: string;
  name: string;
  title: string;
  subject: string;
  provider: 'enara-webrtc' | 'tavus' | 'elevenlabs-did' | 'custom-webrtc';
  avatarModelId: string;
  voiceId: string;
  avatarUrl: string;
  previewVideoUrl?: string;
  accent: string;
  personalityPrompt: string;
  isActive: boolean;
  tags: string[];
  streamingQuality: '720p' | '1080p' | '4k';
  latencyMs: number;
  totalSessions: number;
  rating: number;
  gender?: 'female' | 'male' | 'neutral';
}

export interface AvatarConfig {
  provider: 'enara-webrtc' | 'tavus' | 'elevenlabs-did' | 'custom-webrtc';
  apiKey: string;
  apiEndpoint: string;
  apiKeyMasked?: string;
  defaultAvatarId: string;
  quality: '720p' | '1080p';
  autoStartVideo: boolean;
  enableSubtitles: boolean;
  sessionTimeoutMinutes: number;
  maxConcurrentSessions: number;
  webrtcIceServers: string[];
}

export interface AvatarSession {
  id: string;
  avatarId: string;
  avatarName: string;
  studentId: string;
  studentName: string;
  startTime: string;
  durationSeconds: number;
  status: 'active' | 'paused' | 'ended';
  latencyMs: number;
  provider: string;
}

export interface AvatarStreamAnalytics {
  activeSessionsCount: number;
  totalStreamMinutes: number;
  avgLatencyMs: number;
  tokenExpenditureMonthly: number;
  providerStatus: {
    enaraAvatar: 'operational' | 'degraded' | 'offline';
    elevenlabs: 'operational' | 'degraded' | 'offline';
    tavus: 'operational' | 'degraded' | 'offline';
  };
  recentSessions: AvatarSession[];
}

