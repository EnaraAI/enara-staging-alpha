import { UsageEvent } from '../models/UsageEvent';
import { StudentCredit } from '../models/StudentCredit';
import { Student } from '../models/Student';
import { generateMessageId } from '../utils/idGenerator';

const FEATURE_COST = {
  chat: 10,
  voice: 25,
  tts: 15,
  visualize: 40,
  assessment: 5,
  curriculum: 2,
  research: 20,
} as const;

export type BillableFeature = keyof typeof FEATURE_COST;

export interface UsageReservation {
  eventId: string;
  userId: string;
  studentId: string;
  institutionId?: string;
  feature: BillableFeature;
  reservedCredits: number;
}

export async function ensureStudentCredits(studentId: string) {
  let credits = await StudentCredit.findOne({ studentId });
  if (!credits) {
    const student = await Student.findOne({ id: studentId });
    credits = await StudentCredit.create({
      studentId,
      institutionId: student?.institutionId,
      limit: 50000,
      usage: 0,
      period: 'monthly',
      status: 'active',
      restrictedFeatures: [],
    });
  }
  return credits;
}

function costFor(feature: BillableFeature, creditsUsed?: number): number {
  const value = creditsUsed ?? FEATURE_COST[feature] ?? 10;
  if (!Number.isFinite(value) || value <= 0) throw new Error('Invalid credit amount');
  return Math.ceil(value);
}

export async function reserveUsage(params: {
  userId: string;
  studentId: string;
  feature: BillableFeature;
  model?: string;
  sessionId?: string;
  tokensIn?: number;
  tokensOut?: number;
  creditsUsed?: number;
}): Promise<UsageReservation> {
  const credits = await ensureStudentCredits(params.studentId);
  const used = costFor(params.feature, params.creditsUsed);

  if (credits.status === 'blocked') {
    throw new Error('Credit limit blocked');
  }
  if (credits.restrictedFeatures.includes(params.feature)) {
    throw new Error(`Feature ${params.feature} is restricted`);
  }

  const reserved = await StudentCredit.findOneAndUpdate(
    {
      studentId: params.studentId,
      status: 'active',
      restrictedFeatures: { $ne: params.feature },
      $expr: { $lte: [{ $add: ['$usage', used] }, '$limit'] },
    },
    { $inc: { usage: used } },
    { new: true }
  );

  if (!reserved) {
    await StudentCredit.updateOne(
      {
        studentId: params.studentId,
        status: 'active',
        restrictedFeatures: { $ne: params.feature },
        $expr: { $gt: [{ $add: ['$usage', used] }, '$limit'] },
      },
      { $set: { status: 'throttled' } }
    );
    throw new Error('Credit limit exceeded');
  }

  const eventId = `evt-${generateMessageId()}`;
  await UsageEvent.create({
    id: eventId,
    userId: params.userId,
    studentId: params.studentId,
    institutionId: reserved.institutionId,
    feature: params.feature,
    modelName: params.model || 'enara-orchestrator',
    requestId: `req-${generateMessageId()}`,
    sessionId: params.sessionId,
    tokensIn: params.tokensIn,
    tokensOut: params.tokensOut,
    creditsUsed: used,
    status: 'reserved',
    timestamp: new Date(),
  });

  return {
    eventId,
    userId: params.userId,
    studentId: params.studentId,
    institutionId: reserved.institutionId,
    feature: params.feature,
    reservedCredits: used,
  };
}

export async function settleUsage(
  reservation: UsageReservation,
  details: {
    model?: string;
    tokensIn?: number;
    tokensOut?: number;
    actualCreditsUsed?: number;
  } = {}
) {
  const actualCredits = details.actualCreditsUsed
    ? costFor(reservation.feature, details.actualCreditsUsed)
    : reservation.reservedCredits;
  const delta = actualCredits - reservation.reservedCredits;
  if (delta !== 0) {
    const settled = await StudentCredit.findOneAndUpdate(
      {
        studentId: reservation.studentId,
        $expr: { $lte: [{ $add: ['$usage', delta] }, '$limit'] },
      },
      { $inc: { usage: delta } }
    );
    if (!settled) {
      await releaseUsage(reservation);
      throw new Error('Credit limit exceeded');
    }
  }

  await UsageEvent.updateOne(
    { id: reservation.eventId },
    {
      $set: {
        status: 'settled',
        modelName: details.model || 'enara-orchestrator',
        tokensIn: details.tokensIn,
        tokensOut: details.tokensOut,
        creditsUsed: actualCredits,
      },
    }
  );
}

export async function releaseUsage(reservation: UsageReservation) {
  await StudentCredit.updateOne(
    { studentId: reservation.studentId },
    { $inc: { usage: -reservation.reservedCredits } }
  );
  await StudentCredit.updateOne(
    { studentId: reservation.studentId, usage: { $lt: 0 } },
    { $set: { usage: 0 } }
  );
  await StudentCredit.updateOne(
    {
      studentId: reservation.studentId,
      status: 'throttled',
      $expr: { $lt: ['$usage', '$limit'] },
    },
    { $set: { status: 'active' } }
  );
  await UsageEvent.updateOne({ id: reservation.eventId }, { $set: { status: 'released' } });
}

export async function recordUsage(params: {
  userId: string;
  studentId: string;
  feature: BillableFeature;
  model?: string;
  sessionId?: string;
  tokensIn?: number;
  tokensOut?: number;
  creditsUsed?: number;
}) {
  const reservation = await reserveUsage(params);
  await settleUsage(reservation, {
    model: params.model,
    tokensIn: params.tokensIn,
    tokensOut: params.tokensOut,
    actualCreditsUsed: params.creditsUsed,
  });
  const [event, credits] = await Promise.all([
    UsageEvent.findOne({ id: reservation.eventId }),
    StudentCredit.findOne({ studentId: params.studentId }),
  ]);
  return { event, credits, used: reservation.reservedCredits };
}
