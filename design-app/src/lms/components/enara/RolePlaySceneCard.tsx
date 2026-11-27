import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Drama } from 'lucide-react';

// liveRolePlay (live tutor item 4): the scene card in the live call. The server sends it with each turn ({ scene } in /query-stream; null
// outside a scene). It sits in a corner of the tutor's video, so it never covers the Visual Aid panel; on a phone it starts collapsed to one line.
// Every text in English and Arabic; the Arabic card reads right to left.
export interface SceneText { en: string; ar: string }
export interface SceneCardData {
  id: string;
  title: SceneText;
  setting: SceneText;
  character: SceneText;
  goal: SceneText;
  beat: number;
  beats: number;
  phase: 'beat' | 'debrief';
}

const L = {
  roleplay: { en: 'Role-play', ar: 'لعب الأدوار' },
  setting: { en: 'Setting', ar: 'المكان' },
  character: { en: 'Tutor plays', ar: 'يؤدي المعلم دور' },
  goal: { en: 'Your goal', ar: 'هدفك' },
  step: { en: (n: number, of: number) => `Step ${n} of ${of}`, ar: (n: number, of: number) => `الخطوة ${n} من ${of}` },
  debrief: { en: 'Scene over: review', ar: 'انتهى المشهد: مراجعة' },
  show: { en: 'Show the scene', ar: 'اعرض المشهد' },
  hide: { en: 'Hide the scene', ar: 'أخفِ المشهد' },
  other: { en: 'عربي', ar: 'English' },
  otherLabel: { en: 'Show the card in Arabic', ar: 'اعرض البطاقة بالإنجليزية' },
};

const wide = () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia('(min-width: 640px)').matches : true);

export const RolePlaySceneCard: React.FC<{ card: SceneCardData | null; defaultLang?: 'en' | 'ar' }> = ({ card, defaultLang = 'en' }) => {
  const [lang, setLang] = useState<'en' | 'ar'>(defaultLang);
  // Collapsed on a phone; open on a wider screen. A new scene opens it again only on a wide screen.
  const [open, setOpen] = useState(wide);
  useEffect(() => { setOpen(wide()); }, [card?.id]);
  useEffect(() => { setLang(defaultLang); }, [defaultLang]);
  if (!card) return null;
  const ar = lang === 'ar';
  const t = (x: SceneText) => (ar ? x.ar : x.en);
  const progress = card.phase === 'debrief' ? L.debrief[lang] : L.step[lang](card.beat, card.beats);
  return (
    <div
      data-testid="roleplay-card"
      dir={ar ? 'rtl' : 'ltr'}
      lang={ar ? 'ar' : 'en'}
      className={`absolute top-3 ${ar ? 'right-3' : 'left-3'} z-10 w-[min(18rem,calc(100%-1.5rem))] rounded-xl bg-slate-900/85 text-white border border-white/15 shadow-lg backdrop-blur-sm text-sm`}
    >
      <button
        type="button"
        data-testid="roleplay-card-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? L.hide[lang] : L.show[lang]}
        className="w-full flex items-center gap-2 px-3 py-2 text-start"
      >
        <Drama size={16} className="text-teal-300 shrink-0" aria-hidden="true" />
        <span className="flex-1 min-w-0">
          <span className="block text-[11px] uppercase tracking-wide text-teal-300">{L.roleplay[lang]} · {progress}</span>
          <span className="block font-bold truncate" data-testid="roleplay-card-title">{t(card.title)}</span>
        </span>
        {open ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
      </button>
      {open && (
        <div className="px-3 pb-3" data-testid="roleplay-card-details">
          <dl className="m-0 space-y-1.5">
            <div><dt className="text-[11px] text-slate-400">{L.setting[lang]}</dt><dd className="m-0">{t(card.setting)}</dd></div>
            <div><dt className="text-[11px] text-slate-400">{L.character[lang]}</dt><dd className="m-0">{t(card.character)}</dd></div>
            <div><dt className="text-[11px] text-slate-400">{L.goal[lang]}</dt><dd className="m-0 font-semibold text-teal-100" data-testid="roleplay-card-goal">{t(card.goal)}</dd></div>
          </dl>
          <button
            type="button"
            data-testid="roleplay-card-lang"
            onClick={() => setLang(ar ? 'en' : 'ar')}
            aria-label={L.otherLabel[lang]}
            lang={ar ? 'en' : 'ar'}
            className="mt-2 px-2 py-1 rounded-md border border-white/20 text-xs font-semibold hover:bg-white/10"
          >
            {L.other[lang]}
          </button>
        </div>
      )}
    </div>
  );
};
