import { getConfig } from '../config/env';
import { fetchWithTimeout, readJson } from '../utils/httpClient';
import { logger, serializeError } from '../utils/logging';
import { meteredCall } from './aiGateway';

export type TeachingMethod = 'socratic' | 'gap_filler' | 'error_analysis';

export interface ChatHistoryItem {
  role: 'user' | 'assistant';
  content: string;
}

interface OrchestratorChatRequest {
  course_id: string;
  query: string;
  section_ids?: string[];
  teaching_method?: TeachingMethod;
  chat_history?: ChatHistoryItem[];
}

interface OrchestratorChatResponse {
  answer: string;
  intent: string;
  context_found: number;
  version: string;
}

interface Course {
  id: string;
  name: string;
}

interface Section {
  id: string;
  name: string;
}

function getOrchestratorConfig(): { baseUrl: string; apiKey: string; timeoutMs: number } | null {
  const config = getConfig();
  if (!config.enaraOrchestratorUrl || !config.enaraApiKey) {
    return null;
  }
  return {
    baseUrl: config.enaraOrchestratorUrl.replace(/\/+$/, ''),
    apiKey: config.enaraApiKey,
    timeoutMs: config.aiEngineTimeoutMs,
  };
}

function authHeaders(apiKey: string): Record<string, string> {
  return {
    'X-API-Key': apiKey,
    'Content-Type': 'application/json',
  };
}

async function safeJson<T>(response: Response): Promise<T | null> {
  if (!response.ok) return null;
  try {
    return await readJson<T>(response);
  } catch {
    return null;
  }
}

export async function fetchOrchestratorCourses(): Promise<Course[]> {
  const config = getOrchestratorConfig();
  if (!config) return [];

  try {
    const response = await fetchWithTimeout(
      `${config.baseUrl}/courses`,
      { headers: authHeaders(config.apiKey) },
      config.timeoutMs
    );
    return (await safeJson<Course[]>(response)) || [];
  } catch (error) {
    logger.warn('orchestrator_courses_fetch_failed', { error: serializeError(error) });
    return [];
  }
}

export async function fetchOrchestratorSections(courseId: string): Promise<Section[]> {
  const config = getOrchestratorConfig();
  if (!config) return [];

  try {
    const response = await fetchWithTimeout(
      `${config.baseUrl}/courses/${encodeURIComponent(courseId)}/sections`,
      { headers: authHeaders(config.apiKey) },
      config.timeoutMs
    );
    return (await safeJson<Section[]>(response)) || [];
  } catch (error) {
    logger.warn('orchestrator_sections_fetch_failed', { courseId, error: serializeError(error) });
    return [];
  }
}

// Each chat query is metered (orchestrator, usage unknown: the service reports
// no usage). Course and section reads are metadata lookups and not metered.
export async function queryOrchestratorChat(
  request: OrchestratorChatRequest,
  feature = 'tutor_chat'
): Promise<OrchestratorChatResponse | null> {
  const config = getOrchestratorConfig();
  if (!config) return null;

  try {
    const response = await meteredCall(
      { feature, provider: 'orchestrator', modelName: 'enara-orchestrator' },
      () =>
        fetchWithTimeout(
          `${config.baseUrl}/chat/query`,
          {
            method: 'POST',
            headers: authHeaders(config.apiKey),
            body: JSON.stringify(request),
          },
          config.timeoutMs
        ),
      { failed: (r) => (r.ok ? undefined : `http_${r.status}`) }
    );
    return await safeJson<OrchestratorChatResponse>(response);
  } catch (error) {
    logger.warn('orchestrator_chat_query_failed', { error: serializeError(error) });
    return null;
  }
}

export function buildFallbackTutorReply(
  _query: string,
  _teachingMethod: TeachingMethod,
  _lessonTitle?: string
): OrchestratorChatResponse {
  // Shown only when no AI service answered. Say so plainly rather than sending a
  // canned reply that reads like a real answer.
  return {
    answer:
      "The AI tutor can't be reached right now, so I can't answer this properly. " +
      'Your question is saved in this chat. Please try again in a few minutes.',
    intent: 'fallback_local',
    context_found: 0,
    version: 'local-fallback',
  };
}
