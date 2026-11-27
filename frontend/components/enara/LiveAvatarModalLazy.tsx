// Speed (lms-speed-3): the live call (Anam SDK, LiveKit, ElevenLabs; about 0.8 MB of script) loads the first
// time the call is opened, not with the page that offers it. Once opened it stays mounted, exactly as before.
import React, { useEffect, useState } from 'react';
import { relayBase } from '../../services/relay';

type Props = React.ComponentProps<typeof import('./LiveAvatarModal').LiveAvatarModal>;
const Modal = React.lazy(() => import('./LiveAvatarModal').then((m) => ({ default: m.LiveAvatarModal })));

export const LiveAvatarModal: React.FC<Props> = (props) => {
  const [opened, setOpened] = useState(props.isOpen);
  useEffect(() => { if (props.isOpen) setOpened(true); }, [props.isOpen]);
  // The modal checks Enara's relay when it mounts, so a call can use it at once; keep that early check.
  useEffect(() => { void relayBase(); }, []);
  if (!opened && !props.isOpen) return null;
  return (
    <React.Suspense fallback={props.isOpen ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 text-white" aria-busy="true">Loading…</div> : null}>
      <Modal {...props} />
    </React.Suspense>
  );
};
