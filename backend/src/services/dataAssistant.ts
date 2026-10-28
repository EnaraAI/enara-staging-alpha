import Anthropic from '@anthropic-ai/sdk';
import { getConfig } from '../config/env';
import { AppError } from '../middleware/errorHandler';
import { buildOverview } from './analyticsService';
import { meteredMessage } from './aiGateway';
import { textTokenBound } from './priceCatalog';

// The staff "data assistant": answers questions about one school's own data.
// The data is built here, scoped by the caller's institution, so the browser
// never holds provider keys or decides what data the model sees.

let client: Anthropic | undefined;

export interface AssistantTurn {
  role: 'user' | 'assistant';
  content: string;
}

export async function answerDataQuestion(scope: Record<string, unknown>, message: string, history: AssistantTurn[]) {
  const config = getConfig();
  if (!config.anthropicApiKey) throw new AppError('The assistant is not configured', 503, 'AI_UNAVAILABLE');
  // Retries happen in the gateway (metered), not in the SDK.
  client ??= new Anthropic({ apiKey: config.anthropicApiKey, timeout: 25_000, maxRetries: 0 });

  const overview = await buildOverview(scope);
  const data = {
    generatedAt: overview.generatedAt,
    definitions: overview.definitions,
    totals: overview.totals,
    courses: (overview as { courses?: unknown[] }).courses,
    subjects: overview.subjects,
    weakestTopics: overview.topics.slice(0, 15),
    students: overview.students.slice(0, 300).map((s) => ({
      name: s.name,
      status: s.status,
      avgScore: s.avgScore,
      lessonCompletionRate: s.lessonCompletionRate,
      overdueAssessments: s.overdueAssessments,
      lastActiveAt: s.lastActiveAt,
      riskFlags: s.riskFlags,
    })),
  };

  const institutionId = typeof scope.institutionId === 'string' ? scope.institutionId : undefined;
  const system =
    "You are Enara's data assistant for school staff. Answer only from the school data provided, which " +
    'is computed from real activity. If the data does not answer the question, say so plainly; never ' +
    'invent students, numbers or deadlines. Be concise and use Markdown lists or tables where they help.\n\n' +
    `<school_data>${JSON.stringify(data)}</school_data>`;
  const messages = [...history.slice(-6), { role: 'user' as const, content: message }];
  const response = await meteredMessage(
    {
      feature: 'staff_assistant', modelName: config.anthropicTutorModel, institutionId, maxAttempts: 2,
      bound: { inputTokens: textTokenBound(system, messages), outputTokens: 2000 },
    },
    () =>
      client!.messages.create({
        model: config.anthropicTutorModel,
        max_tokens: 2000,
        output_config: { effort: 'low' },
        system,
        messages,
      }),
  );
  const answer = response.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
  if (!answer || response.stop_reason === 'refusal') {
    throw new AppError('The assistant could not answer that', 502, 'AI_NO_ANSWER');
  }
  return { answer, aiGenerated: true as const };
}
