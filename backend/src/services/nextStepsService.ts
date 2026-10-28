import Anthropic from '@anthropic-ai/sdk';
import { trackAiCall } from './aiCalls';
import { getConfig } from '../config/env';
import { logger } from '../utils/logging';
import { describeSnapshot, LearnerSnapshot } from './learnerSnapshot';

// "Your next steps" on the student's home page. The steps come from the
// student's own data so every button leads somewhere real; Claude only writes
// the one-line note above them.

export type NextStep =
  | { kind: 'review'; title: string; detail: string; count: number }
  | { kind: 'tutor'; title: string; detail: string; prompt: string }
  | { kind: 'lesson'; title: string; detail: string; courseId: string; lessonId: string };

export function buildNextSteps(s: LearnerSnapshot): NextStep[] {
  const steps: NextStep[] = [];
  if (s.reviewsDue > 0) {
    steps.push({
      kind: 'review',
      title: `${s.reviewsDue} quick review question${s.reviewsDue === 1 ? '' : 's'}`,
      detail: 'Questions you missed before, back so they stick. About 2 minutes.',
      count: s.reviewsDue,
    });
  }
  for (const t of s.weakTopics.slice(0, 2)) {
    steps.push({
      kind: 'tutor',
      title: `Practise ${t.topic}`,
      detail: `${t.correct} of ${t.total} right in ${t.quiz}. A 5-minute session with your tutor.`,
      prompt: `In my "${t.quiz}" quiz I got ${t.total - t.correct} of ${t.total} questions about ${t.topic} wrong. Can you give me a short review of ${t.topic} and then a few practice questions, one at a time?`,
    });
  }
  for (const c of s.courses) {
    if (!c.nextLesson) continue;
    steps.push({
      kind: 'lesson',
      title: `${c.completedLessons ? 'Continue' : 'Start'}: ${c.nextLesson.title}`,
      detail: `${c.title} · ${c.completedLessons} of ${c.totalLessons} lessons done`,
      courseId: c.id,
      lessonId: c.nextLesson.id,
    });
  }
  return steps.slice(0, 4);
}

function fallbackNote(s: LearnerSnapshot, steps: NextStep[]): string {
  if (!steps.length) return `Nice work, ${s.firstName}: you're all caught up.`;
  if ((s.daysInactive ?? 0) >= 3) return `Welcome back, ${s.firstName}! Here's a good place to pick up.`;
  return `Here's what will help you most next, ${s.firstName}.`;
}

const noteCache = new Map<string, string>();
let client: Anthropic | undefined;

// One encouraging sentence, written once per student per day.
export async function nextStepsNote(s: LearnerSnapshot, steps: NextStep[]): Promise<string> {
  const config = getConfig();
  const key = `${s.studentId}:${new Date().toISOString().slice(0, 10)}:${steps.map((x) => x.title).join('|')}`;
  const cached = noteCache.get(key);
  if (cached) return cached;
  if (!config.anthropicApiKey || !steps.length) return fallbackNote(s, steps);

  client ??= new Anthropic({ apiKey: config.anthropicApiKey, timeout: 8_000, maxRetries: 0 });
  try {
    const response = await trackAiCall('next_steps_note', config.anthropicVoiceModel, () => client!.messages.create({
      model: config.anthropicVoiceModel,
      max_tokens: 300,
      output_config: { effort: 'low' },
      messages: [
        {
          role: 'user',
          content:
            `${describeSnapshot(s)}\n\nSuggested next steps:\n${steps.map((x) => `- ${x.title}: ${x.detail}`).join('\n')}\n\n` +
            `Write ONE short, warm sentence (max 25 words) to ${s.firstName}, a school student, on their home page, ` +
            'pointing them to the first step and why it helps. Specific, not generic praise; no emoji, no quotes.',
        },
      ],
    }));
    const note = response.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
    const result = note && response.stop_reason !== 'refusal' ? note : fallbackNote(s, steps);
    if (noteCache.size > 1000) noteCache.clear();
    noteCache.set(key, result);
    return result;
  } catch (error) {
    logger.warn('next_steps_note_failed', { message: (error as Error).message });
    return fallbackNote(s, steps);
  }
}
