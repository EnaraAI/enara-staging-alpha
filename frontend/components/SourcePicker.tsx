import React, { useEffect, useState } from 'react';
import { fetchDocuments, type WorkspaceDocument } from '../services/apiService';

// P4.1: choose which uploaded documents an AI draft may draw on. Only
// documents that are ready (attested, scanned clean where required, text
// extracted) can be chosen; the others show their real state. The server
// checks everything again; this list only narrows the sources.

const STATE: Record<string, string> = {
  ready: 'Ready', awaiting_scan: 'Waiting for a malware scan', scan_unavailable: 'Not scanned (no scanner configured)', scan_failed: 'Scan failed',
  rejected: 'Blocked by the scan', needs_attestation: 'Needs a rights confirmation', queued: 'Processing', extracting: 'Processing', no_text: 'No readable text',
  unsupported: 'Unsupported file', failed: 'Processing failed', blocked: 'Not available',
};

export function SourcePicker({ curriculumId, value, onChange }: { curriculumId?: string; value: string[]; onChange: (ids: string[]) => void }) {
  const [docs, setDocs] = useState<WorkspaceDocument[] | null>(null);
  useEffect(() => {
    setDocs(null);
    fetchDocuments().then((r) => setDocs(r.documents)).catch(() => setDocs([]));
  }, []);
  const mine = (docs ?? []).filter((d) => !curriculumId || d.curriculumId === curriculumId);
  if (docs === null) return null;
  if (!mine.length) return <p className="text-xs text-slate-500">No uploaded documents for this curriculum. The draft will use any approved course passages, or none.</p>;
  const ready = mine.filter((d) => d.state === 'ready');
  return (
    <fieldset className="text-sm">
      <legend>Base it on these documents (optional)</legend>
      {!ready.length && <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2 mt-1">No document is ready for AI use yet. Documents become available once they are uploaded with a rights confirmation and their text is extracted.</p>}
      <div className="max-h-32 overflow-y-auto mt-1 space-y-1">
        {mine.map((d) => {
          const ok = d.state === 'ready';
          return (
            <label key={d.uploadId} className={`flex gap-2 items-start ${ok ? '' : 'text-slate-400'}`}>
              <input type="checkbox" disabled={!ok} checked={value.includes(d.uploadId)} onChange={(e) => onChange(e.target.checked ? [...value, d.uploadId] : value.filter((x) => x !== d.uploadId))} />
              <span>{d.fileName} <span className="text-xs">· {STATE[d.state] ?? d.state}</span>{ok && d.malwareScan === 'not_scanned_by_policy' && <span className="text-xs text-amber-800"> · not malware-scanned (school policy)</span>}</span>
            </label>
          );
        })}
      </div>
      {value.length > 0 && <p className="text-xs text-slate-500 mt-1">Items the chosen documents don't support are labelled "No supporting source" for you to correct.</p>}
    </fieldset>
  );
}
