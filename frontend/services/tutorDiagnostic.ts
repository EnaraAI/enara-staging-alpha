import { getRailwayEndpoint } from './railwayApi';

export interface DiagnosticLogCycle {
  id: string;
  timestamp: string;
  prompt: string;
  lessonContext?: string;
  step1_sessionCreation: {
    endpoint: string;
    method: string;
    requestHeaders: Record<string, string>;
    requestBody: any;
    responseStatus: number;
    responseHeaders?: Record<string, string>;
    responseBody: any;
    durationMs: number;
    sessionId?: string;
  };
  step2_messageSend?: {
    endpoint: string;
    method: string;
    requestHeaders: Record<string, string>;
    requestBody: any;
    responseStatus: number;
    responseHeaders?: Record<string, string>;
    responseBody: any;
    durationMs: number;
  };
  rigidAnalysis: {
    isRigidResponse: boolean;
    rigidReason: string;
    intent?: string;
    contextFound?: number;
    version?: string;
    teachingMethod?: string;
    indicators: string[];
    recommendations: string[];
  };
  totalDurationMs: number;
}

// In-memory diagnostic log store
let diagnosticLogs: DiagnosticLogCycle[] = [];
let logListeners: ((logs: DiagnosticLogCycle[]) => void)[] = [];

export function getDiagnosticLogs(): DiagnosticLogCycle[] {
  return [...diagnosticLogs];
}

export function subscribeDiagnosticLogs(listener: (logs: DiagnosticLogCycle[]) => void) {
  logListeners.push(listener);
  return () => {
    logListeners = logListeners.filter(l => l !== listener);
  };
}

export function addDiagnosticLog(cycle: DiagnosticLogCycle) {
  diagnosticLogs = [cycle, ...diagnosticLogs].slice(0, 50); // Keep last 50
  try {
    localStorage.setItem('enara_tutor_diagnostic_logs', JSON.stringify(diagnosticLogs.slice(0, 10)));
  } catch (e) {}
  logListeners.forEach(l => l(diagnosticLogs));
}

export function clearDiagnosticLogs() {
  diagnosticLogs = [];
  try {
    localStorage.removeItem('enara_tutor_diagnostic_logs');
  } catch (e) {}
  logListeners.forEach(l => l(diagnosticLogs));
}

// Load initial logs from localStorage if present
if (typeof window !== 'undefined') {
  try {
    const saved = localStorage.getItem('enara_tutor_diagnostic_logs');
    if (saved) {
      diagnosticLogs = JSON.parse(saved);
    }
  } catch (e) {}
}

/**
 * Execute full request/response diagnostic cycle against the backend's student tutor API
 */
export async function runTutorDiagnosticCycle(
  prompt: string = "Teach me about this course",
  lessonContext: string = "Intro to Computer Science",
  credentials: { email?: string; password?: string; token?: string } = {}
): Promise<DiagnosticLogCycle> {
  const startTime = Date.now();
  const logId = `diag-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  
  // 1. The tutor endpoints only serve students, so the diagnostic signs in as the student
  // account given in the form. The token is used for this run only and never stored.
  let token = credentials.token?.trim() || null;
  let loginError: string | undefined;
  if (!token && credentials.email && credentials.password) {
    try {
      const loginRes = await fetch(getRailwayEndpoint('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: credentials.email, password: credentials.password })
      });
      const loginData = await loginRes.json().catch(() => ({}));
      if (loginRes.ok && loginData.token) {
        token = loginData.token;
      } else {
        loginError = loginData?.error?.message || loginData?.message || `Login failed (${loginRes.status})`;
      }
    } catch (e: any) {
      loginError = e?.message || 'Login request failed';
    }
  }

  const reqHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
  // Logs are kept in browser storage, so they record only the end of the token.
  const loggedHeaders: Record<string, string> = token
    ? { ...reqHeaders, Authorization: `Bearer …${token.slice(-6)}` }
    : reqHeaders;

  // STEP 1: POST /api/me/tutor/sessions
  const sessionEndpoint = getRailwayEndpoint('/api/me/tutor/sessions');
  const sessionReqBody = {
    prompt,
    lessonContext,
    subjectId: 'general-tutor',
    subjectName: lessonContext || 'General Curriculum'
  };

  const step1Start = Date.now();
  let step1Status = 0;
  let step1ResBody: any = null;
  let step1ResHeaders: Record<string, string> = {};
  let sessionId: string | undefined;

  try {
    const res1 = await fetch(sessionEndpoint, {
      method: 'POST',
      headers: reqHeaders,
      body: JSON.stringify(sessionReqBody)
    });
    step1Status = res1.status;
    res1.headers.forEach((v, k) => { step1ResHeaders[k] = v; });
    step1ResBody = await res1.json().catch(() => ({ error: 'Failed to parse JSON response' }));
    if (res1.ok && step1ResBody) {
      sessionId = step1ResBody.id || step1ResBody.sessionId;
    }
  } catch (err: any) {
    step1Status = 500;
    step1ResBody = { error: err.message || 'Network request failed' };
  }
  const step1Duration = Date.now() - step1Start;

  // STEP 2: POST /api/me/tutor/sessions/:id/messages (if session created)
  let step2Data: DiagnosticLogCycle['step2_messageSend'];
  if (sessionId) {
    const msgEndpoint = getRailwayEndpoint(`/api/me/tutor/sessions/${encodeURIComponent(sessionId)}/messages`);
    const msgReqBody = { text: prompt };
    const step2Start = Date.now();
    let step2Status = 0;
    let step2ResBody: any = null;
    let step2ResHeaders: Record<string, string> = {};

    try {
      const res2 = await fetch(msgEndpoint, {
        method: 'POST',
        headers: reqHeaders,
        body: JSON.stringify(msgReqBody)
      });
      step2Status = res2.status;
      res2.headers.forEach((v, k) => { step2ResHeaders[k] = v; });
      step2ResBody = await res2.json().catch(() => ({ error: 'Failed to parse JSON response' }));
    } catch (err: any) {
      step2Status = 500;
      step2ResBody = { error: err.message || 'Network request failed' };
    }
    const step2Duration = Date.now() - step2Start;

    step2Data = {
      endpoint: msgEndpoint,
      method: 'POST',
      requestHeaders: loggedHeaders,
      requestBody: msgReqBody,
      responseStatus: step2Status,
      responseHeaders: step2ResHeaders,
      responseBody: step2ResBody,
      durationMs: step2Duration
    };
  }

  // ANALYSIS: Inspect response for rigidness indicators
  const responseObj = step2Data?.responseBody || step1ResBody;
  const assistantMsgText = responseObj?.assistantMessage?.text || responseObj?.text || responseObj?.response || '';
  const meta = responseObj?.meta || step1ResBody?.meta || {};

  const indicators: string[] = [];
  const recommendations: string[] = [];

  let isRigid = false;

  if (step1Status >= 400 || (step2Data && step2Data.responseStatus >= 400)) {
    isRigid = true;
    const errStatus = step2Data?.responseStatus || step1Status;
    indicators.push(`HTTP ${errStatus} Error Response from endpoint`);
  }
  if (meta.intent === 'fallback_local' || meta.intent?.includes('fallback')) {
    isRigid = true;
    indicators.push(`Intent flagged as '${meta.intent}'`);
  }
  if (meta.contextFound === 0) {
    isRigid = true;
    indicators.push("RAG vector search returned contextFound = 0 (No curriculum context match)");
  }
  if (meta.version === 'local-fallback') {
    isRigid = true;
    indicators.push("Version = 'local-fallback' (Triggered static template engine)");
  }
  if (assistantMsgText.includes("Let's think through this together about this lesson") || 
      assistantMsgText.includes("What do you already know about") ||
      assistantMsgText.includes("Try stating one idea first")) {
    isRigid = true;
    indicators.push("Response text matches static Socratic fallback template formula");
  }
  if (loginError) {
    indicators.push(`Student sign-in failed: ${loginError}`);
  }
  if (step1Status === 401 || step2Data?.responseStatus === 401) {
    isRigid = true;
    indicators.push("HTTP 401 Unauthorized: Authorization token missing or expired");
  }
  if (step1Status === 403 || step2Data?.responseStatus === 403) {
    isRigid = true;
    indicators.push("HTTP 403 Forbidden: the tutor endpoints only accept student accounts");
  }

  let rigidReason = "";
  if (isRigid) {
    if (meta.contextFound === 0 && meta.intent === 'fallback_local') {
      rigidReason = "The Enara backend Socratic engine returned a rigid template response because no matching RAG curriculum vectors were found (contextFound = 0), triggering the backend's local Socratic fallback formula.";
      recommendations.push("Upload or index course curriculum vector embeddings into the backend RAG database.");
      recommendations.push("Provide explicit 'lessonContext' or 'subjectId' matching ingested backend curriculum modules.");
      recommendations.push("Ensure backend environment contains active LLM generator credentials.");
    } else if (step1Status === 401 || step1Status === 403) {
      rigidReason = `The backend refused the request (HTTP ${step1Status}), so no tutor reply was generated.`;
      recommendations.push("Run the diagnostic with a student account's email and password, or a student's access token.");
    } else {
      rigidReason = "The API endpoint returned static Socratic template text ('fallback_local').";
      recommendations.push("Check the backend server logs for LLM generator availability and embedding vector indexing status.");
    }
  } else {
    rigidReason = "API response evaluated as dynamic AI response.";
  }

  const cycleLog: DiagnosticLogCycle = {
    id: logId,
    timestamp: new Date().toISOString(),
    prompt,
    lessonContext,
    step1_sessionCreation: {
      endpoint: sessionEndpoint,
      method: 'POST',
      requestHeaders: loggedHeaders,
      requestBody: sessionReqBody,
      responseStatus: step1Status,
      responseHeaders: step1ResHeaders,
      responseBody: step1ResBody,
      durationMs: step1Duration,
      sessionId
    },
    step2_messageSend: step2Data,
    rigidAnalysis: {
      isRigidResponse: isRigid,
      rigidReason,
      intent: meta.intent,
      contextFound: meta.contextFound,
      version: meta.version,
      teachingMethod: meta.teachingMethod,
      indicators,
      recommendations
    },
    totalDurationMs: Date.now() - startTime
  };

  addDiagnosticLog(cycleLog);
  return cycleLog;
}
