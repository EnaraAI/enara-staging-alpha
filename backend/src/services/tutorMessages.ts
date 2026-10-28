import { TutorMessage } from '../models/TutorMessage';
import { recordLearningEvents } from './learningEvents';
import type { ITutorMessage } from '../models/TutorSession';

// Tutor chat messages live in the tutor_messages collection. Sessions from
// before the split may also hold messages embedded in the session document;
// reads merge both (by message id) so nothing is lost before or after the
// migration copies them across.

interface SessionLike {
  id: string;
  studentId: string;
  institutionId?: string;
  messages?: ITutorMessage[];
}

type StoredMessage = ITutorMessage;

function plainMessage(m: StoredMessage): StoredMessage {
  return {
    id: m.id,
    role: m.role,
    text: m.text,
    timestamp: m.timestamp,
    ...(m.imageUrl ? { imageUrl: m.imageUrl } : {}),
    ...(m.imagePrompt ? { imagePrompt: m.imagePrompt } : {}),
    ...(m.meta && Object.values(m.meta).some((v) => v !== undefined) ? { meta: m.meta } : {}),
  };
}

function merge(legacy: StoredMessage[] = [], stored: StoredMessage[]): StoredMessage[] {
  const ids = new Set(stored.map((m) => m.id));
  return [...legacy.filter((m) => !ids.has(m.id)), ...stored]
    .map(plainMessage)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

export async function appendTutorMessages(
  session: SessionLike & { courseId?: string; lessonId?: string },
  messages: StoredMessage[],
  // Set for student turns to record them as learning events. Typed questions are
  // what the server received (verified); spoken ones come from the browser's
  // transcription, and replies are AI output (neither verified).
  events?: { source: 'tutor_chat' | 'tutor_voice' },
): Promise<void> {
  if (!messages.length) return;
  if (events) {
    await recordLearningEvents(
      messages.map((m) => ({
        studentId: session.studentId,
        institutionId: session.institutionId,
        type: m.role === 'user' ? ('tutor_question' as const) : ('tutor_reply' as const),
        source: events.source,
        verified: m.role === 'user' && events.source === 'tutor_chat',
        refs: { sessionId: session.id, messageId: m.id, courseId: session.courseId, lessonId: session.lessonId },
        idempotencyKey: `msg:${session.id}:${m.id}`,
        at: new Date(m.timestamp),
      })),
    );
  }
  await TutorMessage.insertMany(
    messages.map((m) => ({
      ...plainMessage(m),
      sessionId: session.id,
      studentId: session.studentId,
      institutionId: session.institutionId,
    })),
  );
}

export async function loadTutorMessages(session: SessionLike): Promise<StoredMessage[]> {
  const stored = await TutorMessage.find({ sessionId: session.id }).sort({ timestamp: 1 }).lean();
  return merge(session.messages, stored as unknown as StoredMessage[]);
}

// Messages for many sessions at once (analytics), keyed by session id.
export async function loadMessagesForSessions(
  sessions: SessionLike[],
  filter: { role?: 'user' | 'ai'; since?: Date } = {},
): Promise<Map<string, StoredMessage[]>> {
  const query: Record<string, unknown> = { sessionId: { $in: sessions.map((s) => s.id) } };
  if (filter.role) query.role = filter.role;
  if (filter.since) query.timestamp = { $gte: filter.since };
  const stored = (await TutorMessage.find(query)
    .select('sessionId id role text timestamp meta')
    .lean()) as unknown as (StoredMessage & { sessionId: string })[];
  const bySession = new Map<string, StoredMessage[]>();
  for (const m of stored) {
    const list = bySession.get(m.sessionId) || [];
    list.push(m);
    bySession.set(m.sessionId, list);
  }
  const result = new Map<string, StoredMessage[]>();
  for (const s of sessions) {
    const legacy = (s.messages || []).filter(
      (m) => (!filter.role || m.role === filter.role) && (!filter.since || new Date(m.timestamp) >= filter.since),
    );
    result.set(s.id, merge(legacy, bySession.get(s.id) || []));
  }
  return result;
}

export async function deleteTutorMessages(sessionIds: string[]): Promise<void> {
  if (sessionIds.length) await TutorMessage.deleteMany({ sessionId: { $in: sessionIds } });
}
