import React, { useEffect, useRef, useState } from 'react';

// "Continue with Google" for the Parents tab, using Google Identity Services.
// The official button is rendered by Google (branding guidelines), and the ID
// token it returns (credential) is sent to POST /api/parents/google, where it
// is verified server-side. Renders nothing if the script cannot load.

const GSI_SRC = 'https://accounts.google.com/gsi/client';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (cfg: Record<string, unknown>) => void;
          renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void;
          cancel?: () => void;
        };
      };
    };
  }
}

let gsiPromise: Promise<void> | null = null;
export function loadGsi(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (gsiPromise) return gsiPromise;
  gsiPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SRC}"]`);
    const s = existing ?? document.createElement('script');
    s.addEventListener('load', () => resolve());
    s.addEventListener('error', () => { gsiPromise = null; reject(new Error('gsi_load_failed')); });
    if (!existing) {
      s.src = GSI_SRC;
      s.async = true;
      s.defer = true;
      document.head.appendChild(s);
    }
  });
  return gsiPromise;
}

interface Props {
  clientId: string;
  lang: 'en' | 'ar';
  context: 'signin' | 'signup';
  disabled?: boolean;
  onCredential: (credential: string) => void;
  // The "or" divider shown under the button, before the email form.
  orLabel: string;
}

export const GoogleSignInButton: React.FC<Props> = ({ clientId, lang, context, disabled, onCredential, orLabel }) => {
  const holder = useRef<HTMLDivElement>(null);
  const cb = useRef(onCredential);
  cb.current = onCredential;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    loadGsi().then(() => {
      const el = holder.current;
      const gid = window.google?.accounts?.id;
      if (!alive || !el || !gid) return;
      gid.initialize({
        client_id: clientId,
        callback: (r: { credential?: string }) => { if (r?.credential) cb.current(r.credential); },
        ux_mode: 'popup',
        context,
        auto_select: false,
        cancel_on_tap_outside: true,
      });
      el.innerHTML = '';
      // Width in px (Google allows 200-400); full card width up to 400.
      const width = Math.max(200, Math.min(400, Math.floor(el.getBoundingClientRect().width || 320)));
      gid.renderButton(el, { type: 'standard', theme: 'outline', size: 'large', text: 'continue_with', shape: 'rectangular', logo_alignment: 'center', width, locale: lang });
    }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [clientId, lang, context]);

  if (failed) return null;
  return (
    <>
      <div className="si-google" aria-busy={disabled || undefined} style={disabled ? { pointerEvents: 'none', opacity: 0.6 } : undefined}>
        <div ref={holder} className="si-google-btn" />
      </div>
      <div className="si-or" role="separator" aria-label={orLabel}><span aria-hidden="true">{orLabel}</span></div>
    </>
  );
};
