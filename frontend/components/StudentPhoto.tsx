import React, { useEffect, useRef, useState } from 'react';
import { Camera, Check, Clock, X } from 'lucide-react';
import {
  approveStudentPhoto,
  fetchMe,
  fetchPendingPhotos,
  PendingPhoto,
  rejectStudentPhoto,
  setStudentPhoto,
  uploadMyPhoto,
} from '../services/apiService';
import { toast } from '../services/toastService';

export const PHOTO_ACCEPT = 'image/jpeg,image/png,image/gif,image/webp';

const initialsOf = (name?: string) => (name || '').split(' ').filter(Boolean).map(n => n[0]).join('').slice(0, 3).toUpperCase();

/** A student's photo, or their initials when there is none (or it fails to load). */
export const StudentAvatar: React.FC<{ photoUrl?: string | null; initials?: string; name?: string; className: string }> = ({ photoUrl, initials, name, className }) => {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [photoUrl]);
  if (photoUrl && !failed) {
    return <img src={photoUrl} alt={name ? `${name}` : 'Student photo'} onError={() => setFailed(true)} className={`${className} object-cover`} />;
  }
  return <div className={`${className} flex items-center justify-center`}>{initials || initialsOf(name)}</div>;
};

/** Hidden file input behind a button; calls onFile with the chosen image. */
export const PhotoPicker: React.FC<{ onFile: (f: File) => Promise<void>; label: string; className?: string }> = ({ onFile, label, className }) => {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <input ref={input} type="file" accept={PHOTO_ACCEPT} className="hidden" onChange={async e => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        setBusy(true);
        try { await onFile(file); } finally { setBusy(false); }
      }} />
      <button type="button" disabled={busy} onClick={e => { e.stopPropagation(); input.current?.click(); }}
        className={className ?? 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50'}>
        <Camera size={14} /> {busy ? 'Uploading…' : label}
      </button>
    </>
  );
};

const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Unexpected error');

/** Admin: set or replace a student's photo (takes effect at once). */
export async function adminSetPhoto(studentId: string, file: File): Promise<PendingPhoto | null> {
  try {
    const res = await setStudentPhoto(studentId, file);
    toast.success('Photo updated', 'The new photo shows now.');
    return res;
  } catch (e) {
    toast.error('Could not update the photo', errMsg(e));
    return null;
  }
}

/** Admin: photos students uploaded, waiting for approval. */
export const PendingPhotoQueue: React.FC<{ onDecided?: (row: PendingPhoto) => void; refreshKey?: unknown }> = ({ onDecided, refreshKey }) => {
  const [rows, setRows] = useState<PendingPhoto[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchPendingPhotos().then(r => { if (!cancelled) setRows(r); }, () => undefined);
    return () => { cancelled = true; };
  }, [refreshKey]);
  if (!rows.length) return null;
  const decide = async (row: PendingPhoto, approve: boolean) => {
    setBusy(row.id);
    try {
      const res = await (approve ? approveStudentPhoto(row.id) : rejectStudentPhoto(row.id));
      setRows(prev => prev.filter(r => r.id !== row.id));
      toast.success(approve ? 'Photo approved' : 'Photo rejected', row.name);
      onDecided?.(res);
    } catch (e) {
      toast.error('Could not update the photo', errMsg(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <section className="bg-white rounded-xl border border-amber-200 p-4 sm:p-5" aria-label="Photos waiting for approval">
      <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-3"><Clock size={16} className="text-amber-600" /> Photos waiting for approval ({rows.length})</h3>
      <ul className="flex flex-col gap-3">
        {rows.map(row => (
          <li key={row.id} className="flex items-center gap-3 flex-wrap">
            <StudentAvatar photoUrl={row.photoUrl} initials={row.avatar} name={row.name} className="w-10 h-10 rounded-lg bg-teal-600 text-white text-sm font-bold" />
            <span className="text-slate-400 text-xs">→</span>
            <StudentAvatar photoUrl={row.pendingPhotoUrl} initials={row.avatar} name={`${row.name} (new)`} className="w-10 h-10 rounded-lg bg-slate-200 text-slate-600 text-sm font-bold" />
            <span className="text-sm font-semibold text-slate-800 flex-1 min-w-[8rem]">{row.name}</span>
            <button type="button" disabled={busy === row.id} onClick={() => decide(row, true)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-teal-600 text-white text-xs font-semibold hover:bg-teal-700 disabled:opacity-50"><Check size={14} /> Approve</button>
            <button type="button" disabled={busy === row.id} onClick={() => decide(row, false)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 disabled:opacity-50"><X size={14} /> Reject</button>
          </li>
        ))}
      </ul>
    </section>
  );
};

/** Student: own avatar in the header, and "Change photo" (waits for approval). */
export function useMyPhoto(enabled: boolean) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetchMe().then((me: any) => {
      if (cancelled) return;
      setPhotoUrl(me?.photoUrl || null);
      setPending(!!me?.photoPending);
    }, () => undefined);
    return () => { cancelled = true; };
  }, [enabled]);
  const upload = async (file: File) => {
    try {
      await uploadMyPhoto(file);
      setPending(true);
      toast.success('Photo sent', 'It will show once your school approves it.');
    } catch (e) {
      toast.error('Could not upload the photo', errMsg(e));
    }
  };
  return { photoUrl, pending, upload };
}
