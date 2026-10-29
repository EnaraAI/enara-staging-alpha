import React, { useEffect, useState } from 'react';
import { Loader2, MessageSquare, Send, Trash2 } from 'lucide-react';
import {
  ApiError,
  askEducatorChat,
  ChatAnswer,
  ChatCitation,
  ChatDocument,
  deleteChatConversation,
  fetchChatConversation,
  fetchChatConversations,
  fetchChatDocuments,
} from '../../services/apiService';
import { UsageChip } from '../../components/UsageChip';
import { AnalyticsReport } from '../../components/AnalyticsReport';
import { requestIdOf } from '../../services/apiService';

// AI Chat (P3): ask questions answered only from approved documents. Shows the
// server's citations; never shows an answer without them, and explains when
// no approved document is available (no bypass offered). With class analytics
// on for the school, a question sent with no document selected is answered
// from the teacher's own class records instead (report, table and chart).
type Turn = { role: 'user' | 'assistant'; text: string; status?: ChatAnswer['status']; citations?: ChatCitation[]; analytics?: ChatAnswer['analytics']; requestId?: string | null };
type Failure = { kind: 'budget' | 'paused' | 'rate' | 'provider' | 'timeout' | 'other'; message: string };

const STATE_LABEL: Record<string, string> = {
  ready: 'Ready',
  awaiting_scan: 'Awaiting malware scan',
  scan_unavailable: 'Scan unavailable',
  scan_failed: 'Scan failed',
  rejected: 'Rejected',
  needs_attestation: 'Needs rights confirmation',
  queued: 'Queued for extraction',
  extracting: 'Extracting text',
  no_text: 'No text found',
  failed: 'Extraction failed',
  unsupported: 'Not supported',
  blocked: 'Not cleared for processing',
};

function failureOf(err: unknown): Failure {
  const e = err as ApiError & { name?: string };
  if (e?.name === 'AbortError' || e?.name === 'TimeoutError') return { kind: 'timeout', message: 'The request timed out. Please try again.' };
  switch (e?.code) {
    case 'AI_BUDGET_EXCEEDED':
    case 'AI_BUDGET_UNAVAILABLE':
    case 'AI_BUDGET_POLICY_MISSING':
      return { kind: 'budget', message: e.message };
    case 'AI_PAUSED':
      return { kind: 'paused', message: e.message };
    case 'RATE_LIMITED':
      return { kind: 'rate', message: 'Too many questions right now. Wait a minute and try again.' };
    case 'AI_PROVIDER_ERROR':
      return { kind: 'provider', message: e.message };
    default:
      return { kind: 'other', message: e?.message || 'Something went wrong.' };
  }
}

const cite = (c: ChatCitation) => `${c.fileName}${c.page ? `, p. ${c.page}` : c.section ? `, ${c.section}` : ''}`;

export const AIChat: React.FC = () => {
  const [docs, setDocs] = useState<ChatDocument[] | null>(null);
  const [disabled, setDisabled] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [question, setQuestion] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [conversations, setConversations] = useState<{ id: string; title: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [analyticsEnabled, setAnalyticsEnabled] = useState(false);

  const loadConversations = () => fetchChatConversations().then((r) => setConversations(r.conversations)).catch(() => setConversations([]));
  useEffect(() => {
    fetchChatDocuments()
      .then((r) => { setDocs(r.documents); setAnalyticsEnabled(Boolean(r.analyticsEnabled)); })
      .catch((err: ApiError) => {
        if (err.code === 'FEATURE_DISABLED') setDisabled(true);
        setDocs([]);
      });
    loadConversations();
  }, []);

  const eligible = (docs ?? []).filter((d) => d.eligible);
  // studentId: a student picked from the candidates of an ambiguous name (P10).
  const send = async (repeat?: { question: string; studentId: string }) => {
    if (!repeat && (!question.trim() || (!selected.length && !analyticsEnabled))) return;
    setBusy(true);
    setFailure(null);
    const q = repeat ? repeat.question : question.trim();
    setTurns((t) => [...t, { role: 'user', text: q }]);
    if (!repeat) setQuestion('');
    try {
      const r = await askEducatorChat({ question: q, uploadIds: repeat ? [] : selected, conversationId, ...(repeat ? { studentId: repeat.studentId } : {}) });
      setConversationId(r.conversationId);
      setTurns((t) => [...t, { role: 'assistant', text: r.answer, status: r.status, citations: r.citations, analytics: r.analytics, requestId: requestIdOf(r) }]);
      loadConversations();
    } catch (err) {
      setFailure(failureOf(err));
    } finally {
      setBusy(false);
    }
  };
  const open = (id: string) =>
    fetchChatConversation(id).then((r) => {
      setConversationId(id);
      setTurns(r.conversation.messages.map((m) => ({ role: m.role, text: m.text, status: m.status, citations: m.citations, analytics: m.analytics })));
    }).catch((err) => setFailure(failureOf(err)));

  if (disabled) return <p className="max-w-4xl mx-auto p-8 text-slate-700">AI Chat isn't enabled for your school.</p>;
  if (!docs) return <div className="p-8 flex items-center gap-2 text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>;

  return (
    <div className="max-w-6xl mx-auto p-6 grid lg:grid-cols-[260px_1fr] gap-5">
      <aside className="space-y-4">
        <section className="bg-white border border-slate-200 rounded-xl p-3">
          <h2 className="text-sm font-semibold text-slate-800 mb-2">Documents</h2>
          {!docs.length && <p className="text-sm text-slate-600">No documents yet. Upload them in Documents.</p>}
          <ul className="space-y-1.5">
            {docs.map((d) => (
              <li key={d.uploadId}>
                <label className={`flex items-start gap-2 text-sm ${d.eligible ? 'text-slate-800' : 'text-slate-400'}`}>
                  <input type="checkbox" disabled={!d.eligible} checked={selected.includes(d.uploadId)} onChange={(e) => setSelected((s) => (e.target.checked ? [...s, d.uploadId] : s.filter((x) => x !== d.uploadId)))} className="mt-1" />
                  <span>{d.fileName}<span className="block text-xs">{d.eligible ? d.curriculumName : STATE_LABEL[d.state] ?? d.state}</span>{d.eligible && d.malwareScan === 'not_scanned_by_policy' && <span className="block text-[11px] text-amber-800">Not malware-scanned (school policy)</span>}</span>
                </label>
              </li>
            ))}
          </ul>
          {docs.length > 0 && !eligible.length && (
            <p className="text-xs text-amber-800 bg-amber-50 rounded p-2 mt-2">
              No document is approved for AI use yet. A document becomes available once it is uploaded with a rights confirmation and its text is extracted (and, where a malware scanner is configured, once it passes the scan).
            </p>
          )}
        </section>
        <section className="bg-white border border-slate-200 rounded-xl p-3">
          <div className="flex justify-between items-center mb-2"><h2 className="text-sm font-semibold text-slate-800">Conversations</h2><button onClick={() => { setConversationId(undefined); setTurns([]); }} className="text-xs text-indigo-700 font-semibold">New</button></div>
          <ul className="space-y-1 text-sm">
            {conversations.map((c) => (
              <li key={c.id} className="flex justify-between gap-2">
                <button onClick={() => open(c.id)} className={`text-left truncate ${c.id === conversationId ? 'font-semibold text-slate-900' : 'text-slate-600'}`}>{c.title}</button>
                <button aria-label={`Delete ${c.title}`} onClick={() => deleteChatConversation(c.id).then(() => { if (c.id === conversationId) { setConversationId(undefined); setTurns([]); } loadConversations(); })} className="text-slate-400 hover:text-rose-700"><Trash2 className="w-3.5 h-3.5" /></button>
              </li>
            ))}
          </ul>
        </section>
      </aside>

      <main className="space-y-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-teal-700">AI Studio</p>
          <h1 className="text-2xl font-bold text-slate-900">AI Chat</h1>
          <p className="text-sm text-slate-600">Answers come only from the documents you choose, with their sources. If they don't cover a question, it says so.</p>
          {analyticsEnabled && <p className="text-sm text-slate-600">With no document selected, ask about your classes (for example "class performance summary for the last month" or "ارسم تطور درجات الفصل خلال آخر 3 تقييمات"). Reports use only classes you may see.</p>}
          <div className="mt-1"><UsageChip features={['educator_chat']} /></div>
        </div>
        <div className="space-y-3" aria-live="polite">
          {!turns.length && <p className="text-sm text-slate-500 flex items-center gap-2"><MessageSquare className="w-4 h-4" /> Choose documents and ask a question.</p>}
          {turns.map((t, i) => (
            <div key={i} className={`rounded-xl p-3 text-sm ${t.role === 'user' ? 'bg-slate-900 text-white ml-12' : t.status === 'answered' || t.analytics?.status === 'answered' ? 'bg-white border border-slate-200 mr-12' : 'bg-amber-50 border border-amber-200 text-amber-900 mr-12'}`}>
              {t.analytics ? <AnalyticsReport report={t.analytics} onPickStudent={(studentId) => { const asked = [...turns.slice(0, i)].reverse().find((x) => x.role === 'user'); if (asked) send({ question: asked.text, studentId }); }} /> : <p className="whitespace-pre-wrap">{t.text}</p>}
              {t.citations && t.citations.length > 0 && (
                <ol className="mt-2 border-t border-slate-100 pt-2 text-xs text-slate-600 space-y-0.5">
                  {t.citations.map((c) => <li key={c.n}>[{c.n}] {cite(c)}</li>)}
                </ol>
              )}
              {t.role === 'assistant' && t.requestId && <div className="mt-2"><UsageChip requestId={t.requestId} /></div>}
            </div>
          ))}
          {busy && <div className="flex items-center gap-2 text-slate-500 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Reading your documents…</div>}
          {failure && (
            <p role="alert" className={`text-sm rounded p-2 ${failure.kind === 'budget' || failure.kind === 'paused' ? 'bg-amber-50 text-amber-900' : 'bg-rose-50 text-rose-800'}`}>
              {failure.kind === 'budget' ? 'AI allowance: ' : failure.kind === 'paused' ? 'AI paused: ' : failure.kind === 'provider' ? 'AI error: ' : ''}{failure.message}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <textarea aria-label="Question" value={question} maxLength={2000} onChange={(e) => setQuestion(e.target.value)} rows={2} placeholder={selected.length ? 'Ask about the selected documents…' : analyticsEnabled ? 'Ask about your classes, or select documents…' : eligible.length ? 'Ask about the selected documents…' : 'No approved document available yet'} disabled={!eligible.length && !analyticsEnabled} className="flex-1 rounded-lg border border-slate-300 p-2 text-sm" />
          <button onClick={() => send()} disabled={busy || !question.trim() || (!selected.length && !analyticsEnabled)} className="px-4 rounded-lg bg-slate-900 text-white disabled:bg-slate-200 disabled:text-slate-500" aria-label="Send"><Send className="w-4 h-4" /></button>
        </div>
      </main>
    </div>
  );
};
