/**
 * Legacy helpers that call the backend through the /api/railway proxy.
 * New code should use services/apiService.ts.
 */

import { getToken } from './apiService';

export function getRailwayEndpoint(endpointPath: string): string {
  const cleanPath = endpointPath.startsWith('/api') ? endpointPath.substring(4) : (endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`);
  if (typeof window !== 'undefined') {
    // Same base as apiService: /api/railway behind the frontend server, or
    // /api when the backend serves the SPA itself (staging single service).
    return `${(import.meta.env.VITE_API_URL || '/api/railway').replace(/\/+$/, '')}${cleanPath}`;
  }
  return `http://localhost:3000/api/railway${cleanPath}`;
}

function getAuthHeaders(extraHeaders: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extraHeaders,
  };
  const token = getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

export async function createTutorSessionWithRailway(payload: {
  subjectId?: string;
  subjectName?: string;
  lessonContext?: string;
  prompt?: string;
  history?: any[];
}): Promise<any> {
  try {
    const userPrompt = payload.prompt || 'Socratic tutoring query';
    const response = await fetch(getRailwayEndpoint('/api/me/tutor/sessions'), {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        ...payload,
        prompt: userPrompt
      })
    });

    const data = await response.json().catch(() => ({}));
    if (response.ok && data) {
      const sessionId = data.id || data.sessionId;
      if (sessionId && userPrompt) {
        const messageAnswer = await sendTutorMessageToRailway(sessionId, userPrompt);
        if (messageAnswer) {
          return { ...data, response: messageAnswer, text: messageAnswer };
        }
      }
      return data;
    }
    console.warn(`[Railway API] POST /api/me/tutor/sessions returned HTTP ${response.status}:`, data.message || data.error);
    return null;
  } catch (error) {
    console.warn("Error sending tutor session request to Railway backend:", error);
    return null;
  }
}

// ==========================================
// 5. AI TUTOR SESSIONS (/api/me/tutor/sessions)
// ==========================================
async function sendTutorMessageToRailway(sessionId: string, prompt: string): Promise<string | null> {
  try {
    const response = await fetch(getRailwayEndpoint(`/api/me/tutor/sessions/${sessionId}/messages`), {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ text: prompt })
    });
    if (response.ok) {
      const data = await response.json().catch(() => ({}));
      const text = data.assistantMessage?.text || data.text || data.message || data.response;
      if (text) return text;
    }
  } catch (err) {
    console.warn("Error sending tutor message to Railway:", err);
  }
  return null;
}
