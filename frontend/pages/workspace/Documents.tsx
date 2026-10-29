import React, { useEffect, useState } from 'react';
import { FileText, Loader2, RefreshCw, Trash2, Upload } from 'lucide-react';
import { OriginSelector } from '../../components/OriginSelector';
import { OriginView } from '../../services/roleRouting';
import {
  ApiError,
  deleteDocument,
  DocumentState,
  fetchCurriculums,
  fetchDocuments,
  fetchDocumentSources,
  retryDocument,
  uploadDocument,
  WorkspaceDocument, NOT_SCANNED_LABEL, NOT_SCANNED_NOTICE } from '../../services/apiService';
import { toast } from '../../services/toastService';

// Documents (P2): teaching materials with honest scan and extraction states.
// Nothing here says a file is safe or processed unless the server says so.
const STATE: Record<DocumentState, { label: string; tone: string; help?: string }> = {
  needs_attestation: { label: 'Needs rights confirmation', tone: 'bg-amber-50 text-amber-800', help: 'Upload it again here and confirm you have the right to use it.' },
  awaiting_scan: { label: 'Awaiting malware scan', tone: 'bg-amber-50 text-amber-800', help: 'Not processed until the scan finishes.' },
  scan_unavailable: { label: 'Scan unavailable', tone: 'bg-amber-50 text-amber-800', help: 'Not processed yet. Retry to process it under your school policy (no malware scanner is configured, so it will not be scanned).' },
  scan_failed: { label: 'Scan failed', tone: 'bg-rose-50 text-rose-800', help: 'The scan did not complete. Try again later.' },
  rejected: { label: 'Rejected (threat found)', tone: 'bg-rose-50 text-rose-800', help: 'The file was deleted.' },
  queued: { label: 'Queued for text extraction', tone: 'bg-slate-100 text-slate-700' },
  extracting: { label: 'Extracting text', tone: 'bg-slate-100 text-slate-700' },
  ready: { label: 'Ready', tone: 'bg-emerald-50 text-emerald-800' },
  no_text: { label: 'No text found', tone: 'bg-slate-100 text-slate-700', help: 'Looks scanned; text recognition (OCR) is not supported yet.' },
  failed: { label: 'Extraction failed', tone: 'bg-rose-50 text-rose-800', help: 'Try again; if it keeps failing, re-save the file and upload it again.' },
  unsupported: { label: 'Not supported', tone: 'bg-slate-100 text-slate-700' },
  blocked: { label: 'Not cleared for processing', tone: 'bg-amber-50 text-amber-800' },
  deleted: { label: 'Deleted', tone: 'bg-slate-100 text-slate-500' },
};

export const Documents: React.FC = () => {
  const [origin, setOrigin] = useState<OriginView>('live');
  const [data, setData] = useState<{ attestationStatement: string; notScannedNotice?: string; documents: WorkspaceDocument[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [curricula, setCurricula] = useState<{ id: string; name: string; chapters: { id: string; title: string }[] }[]>([]);
  const [form, setForm] = useState<{ curriculumId: string; lessonId: string; file: File | null; attested: boolean }>({ curriculumId: '', lessonId: '', file: null, attested: false });
  const [busy, setBusy] = useState(false);
  const [sources, setSources] = useState<{ doc: WorkspaceDocument; items: { chunkId: string; ref: string; preview: string }[] } | null>(null);

  const load = () => {
    setError(null);
    fetchDocuments(origin)
      .then(setData)
      .catch((err: ApiError) => {
        setData({ attestationStatement: '', documents: [] });
        setError(err.code === 'FEATURE_DISABLED' ? 'Documents are not enabled for your school.' : err.message || 'Could not load documents.');
      });
  };
  useEffect(load, [origin]);
  useEffect(() => {
    fetchCurriculums().then((list) => setCurricula(list.filter((c: any) => c.chapters?.length))).catch(() => setCurricula([]));
  }, []);

  const lessons = curricula.find((c) => c.id === form.curriculumId)?.chapters ?? [];
  const submit = async () => {
    if (!form.file || !form.curriculumId || !form.lessonId || !form.attested) return;
    setBusy(true);
    try {
      const { document } = await uploadDocument({ file: form.file, curriculumId: form.curriculumId, lessonId: form.lessonId, rightsAttested: form.attested });
      toast.success('Uploaded', STATE[document.state]?.label ?? document.state);
      setForm({ curriculumId: form.curriculumId, lessonId: form.lessonId, file: null, attested: false });
      load();
    } catch (err) {
      toast.error('Upload failed', (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-teal-700">AI Studio</p>
          <h1 className="text-2xl font-bold text-slate-900">Documents</h1>
          <p className="text-sm text-slate-600">Teaching materials for your lessons. A file is used by ENARA only after it is checked and its text extracted.</p>
        </div>
        <OriginSelector value={origin} onChange={setOrigin} />
      </div>

      <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-3" aria-label="Upload a document">
        <h2 className="text-sm font-semibold text-slate-800">Upload</h2>
        <div className="grid md:grid-cols-3 gap-3">
          <select aria-label="Curriculum" value={form.curriculumId} onChange={(e) => setForm({ ...form, curriculumId: e.target.value, lessonId: '' })} className="h-10 px-3 rounded-md border border-slate-300 text-sm">
            <option value="">Curriculum…</option>
            {curricula.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select aria-label="Lesson" value={form.lessonId} onChange={(e) => setForm({ ...form, lessonId: e.target.value })} className="h-10 px-3 rounded-md border border-slate-300 text-sm" disabled={!lessons.length}>
            <option value="">Lesson…</option>
            {lessons.map((l) => <option key={l.id} value={l.id}>{l.title || l.id}</option>)}
          </select>
          <input aria-label="File" type="file" accept=".pdf,.docx,.txt" onChange={(e) => setForm({ ...form, file: e.target.files?.[0] ?? null })} className="text-sm" />
        </div>
        {/* Separate from the rights statement: one does not imply the other. */}
        <p role="note" className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-3">{data?.notScannedNotice || NOT_SCANNED_NOTICE}</p>
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={form.attested} onChange={(e) => setForm({ ...form, attested: e.target.checked })} className="mt-1" />
          <span>{data?.attestationStatement || 'I confirm I have the right to upload this file and permit ENARA to process it.'}</span>
        </label>
        <button onClick={submit} disabled={busy || !form.file || !form.curriculumId || !form.lessonId || !form.attested} className="inline-flex items-center gap-2 px-4 h-10 rounded-lg bg-slate-900 text-white text-sm font-semibold disabled:bg-slate-200 disabled:text-slate-500">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Upload
        </button>
        <p className="text-xs text-slate-500">PDF, Word (.docx) or text. Scanned PDFs need text recognition, which is not supported yet.</p>
      </section>

      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      {!data ? (
        <div className="flex items-center gap-2 text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
      ) : !data.documents.length ? (
        !error && <p className="text-slate-600">No documents in this view yet.</p>
      ) : (
        <div className="overflow-x-auto bg-white border border-slate-200 rounded-xl">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-slate-500"><th className="p-3">File</th><th className="p-3">Lesson</th><th className="p-3">Uploaded</th><th className="p-3">Status</th><th className="p-3" /></tr></thead>
            <tbody>
              {data.documents.map((d) => {
                const base = STATE[d.state] ?? { label: d.state, tone: 'bg-slate-100 text-slate-700' };
                // Never a green "ready" badge for a file no scanner has inspected.
                const s = d.malwareScan === 'not_scanned_by_policy' && d.state === 'ready' ? { ...base, label: 'Ready · not malware-scanned', tone: 'bg-amber-50 text-amber-800' } : base;
                return (
                  <tr key={d.uploadId} className="border-t border-slate-100 align-top">
                    <td className="p-3">
                      <div className="flex items-center gap-2 font-semibold text-slate-900"><FileText className="w-4 h-4 text-slate-400" />{d.fileName}</div>
                      {d.origin === 'demo_seed' && <span className="mt-1 inline-block text-[11px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-800">Demo data</span>}
                    </td>
                    <td className="p-3 text-slate-700">{d.curriculumName}{d.lessonTitle ? ` · ${d.lessonTitle}` : ''}</td>
                    <td className="p-3 text-slate-600">{d.uploadedAt ? new Date(d.uploadedAt).toLocaleString() : '—'}</td>
                    <td className="p-3">
                      <span className={`text-xs font-semibold px-2 py-1 rounded-full ${s.tone}`}>{s.label}</span>
                      {(d.detail || s.help) && <p className="text-xs text-slate-500 mt-1 max-w-xs">{d.detail || s.help}</p>}
                      {d.malwareScan === 'not_scanned_by_policy' && <p className="text-xs text-amber-800 mt-1 max-w-xs" title={NOT_SCANNED_NOTICE}>{NOT_SCANNED_LABEL}. Extracted text may be sent to the AI provider.</p>}
                      {d.malwareScan === 'clean' && <p className="text-xs text-slate-500 mt-1">Malware scan: no threat found</p>}
                      {d.state === 'ready' && d.chunkCount != null && <p className="text-xs text-slate-500 mt-1">{d.chunkCount} passages{d.pages ? ` from ${d.pages} page(s)/section(s)` : ''}</p>}
                    </td>
                    <td className="p-3 whitespace-nowrap space-x-2">
                      {d.fileUrl && (
                        <a
                          href={d.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={d.downloadWarning ?? undefined}
                          onClick={(e) => { if (d.downloadWarning && !window.confirm(`${d.downloadWarning}\n\nDownload anyway?`)) e.preventDefault(); }}
                          className={d.downloadWarning ? 'text-amber-800 font-semibold' : 'text-indigo-700 font-semibold'}
                        >
                          {d.downloadWarning ? 'Download (not scanned)' : 'Download'}
                        </a>
                      )}
                      {d.state === 'ready' && (
                        <button onClick={() => fetchDocumentSources(d.uploadId).then((r) => setSources({ doc: d, items: r.sources })).catch((err) => toast.error('Could not load sources', (err as Error).message))} className="text-indigo-700 font-semibold">Sources</button>
                      )}
                      {d.canChange && ['scan_unavailable', 'scan_failed', 'awaiting_scan', 'failed'].includes(d.state) && (
                        <button aria-label={`Retry ${d.fileName}`} onClick={() => retryDocument(d.uploadId).then(load).catch((err) => toast.error('Retry failed', (err as Error).message))} className="text-slate-700"><RefreshCw className="w-4 h-4 inline" /></button>
                      )}
                      {d.canChange && (
                        <button aria-label={`Delete ${d.fileName}`} onClick={() => { if (window.confirm(`Delete ${d.fileName} and its extracted text?`)) deleteDocument(d.uploadId).then(load).catch((err) => toast.error('Delete failed', (err as Error).message)); }} className="text-rose-700"><Trash2 className="w-4 h-4 inline" /></button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {sources && (
        <section className="bg-white border border-slate-200 rounded-xl p-4" aria-label="Sources">
          <div className="flex justify-between items-center"><h2 className="text-sm font-semibold text-slate-800">Sources in {sources.doc.fileName}</h2><button onClick={() => setSources(null)} className="text-sm text-slate-500">Close</button></div>
          {!sources.items.length ? <p className="text-sm text-slate-600 mt-2">No passages.</p> : (
            <ol className="mt-2 space-y-2 text-sm">
              {sources.items.map((x) => <li key={x.chunkId}><span className="font-semibold text-slate-800">{sources.doc.fileName}, {x.ref}:</span> <span className="text-slate-600">{x.preview}{x.preview.length >= 240 ? '…' : ''}</span></li>)}
            </ol>
          )}
        </section>
      )}
    </div>
  );
};
