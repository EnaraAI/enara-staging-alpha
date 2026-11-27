import type { ReactNode } from 'react';
import { ArrowRight, KeyRound, MessageCirclePlus, Sparkles } from 'lucide-react';
import { useT } from '@/lib/preview';
import { Logo } from '@/components/shell';
import { Badge, Button, Card, Dir } from '@/components/ui';

const T = {
  en: {
    title: 'Empty states', sub: 'What people see before there is anything to show. One friendly line, one clear next step.',
    cards: [
      { where: 'Student · Assignments', text: 'No assignments yet. When Ms Dina sets one, it will appear here.', action: 'Practise with the tutor' },
      { where: 'Student · Results', text: 'No results yet. Finish your first task to see how you did.', action: 'Go to assignments' },
      { where: 'Student · Messages', text: 'No messages yet. Questions to your teacher will show up here.', action: 'Write to your teacher' },
      { where: 'Parent · Home', text: 'No children linked yet. Use the code from your child’s school to add them.', action: 'Enter school code' },
    ],
  },
  ar: {
    title: 'الحالات الفارغة', sub: 'ما يراه المستخدم قبل وجود أي محتوى: سطر ودود واحد وخطوة تالية واضحة.',
    cards: [
      { where: 'الطالب · الواجبات', text: 'لا توجد واجبات بعد. عندما تضيف أ. دينا واجبًا سيظهر هنا.', action: 'تدرّبي مع المعلّم' },
      { where: 'الطالب · النتائج', text: 'لا توجد نتائج بعد. أنهي مهمتك الأولى لتري أداءك.', action: 'الانتقال إلى الواجبات' },
      { where: 'الطالب · الرسائل', text: 'لا توجد رسائل بعد. ستظهر هنا أسئلتك إلى معلّمتك.', action: 'راسلي معلّمتك' },
      { where: 'ولي الأمر · الرئيسية', text: 'لم تُربط أي حسابات لأبنائك بعد. استخدم الرمز الذي أرسلته المدرسة لإضافتهم.', action: 'إدخال رمز المدرسة' },
    ],
  },
};

const Frame = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 200 140" className="h-32 w-auto md:h-36" aria-hidden>
    <circle cx="100" cy="68" r="58" fill="var(--secondary)" opacity=".7" />
    <ellipse cx="100" cy="126" rx="70" ry="8" fill="var(--muted)" />
    {children}
  </svg>
);

const IlloAssignments = () => (
  <Frame>
    <rect x="62" y="20" width="76" height="98" rx="12" fill="var(--card)" stroke="var(--border)" strokeWidth="2" />
    <rect x="82" y="12" width="36" height="16" rx="6" fill="var(--primary)" />
    <rect x="76" y="44" width="10" height="10" rx="3" fill="var(--success-soft)" stroke="var(--success)" strokeWidth="2" />
    <rect x="92" y="46" width="34" height="6" rx="3" fill="var(--muted)" />
    <rect x="76" y="66" width="10" height="10" rx="3" fill="var(--muted)" />
    <rect x="92" y="68" width="28" height="6" rx="3" fill="var(--muted)" />
    <rect x="76" y="88" width="10" height="10" rx="3" fill="var(--muted)" />
    <rect x="92" y="90" width="32" height="6" rx="3" fill="var(--muted)" />
    <path d="M150 30l3 7 7 3-7 3-3 7-3-7-7-3 7-3Z" fill="var(--accent)" />
    <path d="M46 58l2 4.5 4.5 2-4.5 2-2 4.5-2-4.5-4.5-2 4.5-2Z" fill="var(--accent)" opacity=".7" />
  </Frame>
);
const IlloResults = () => (
  <Frame>
    <rect x="40" y="24" width="120" height="94" rx="14" fill="var(--card)" stroke="var(--border)" strokeWidth="2" />
    {[30, 48, 22, 40].map((h, i) => <rect key={i} x={58 + i * 22} y={100 - h} width="14" height={h} rx="4" fill="none" stroke="var(--input)" strokeWidth="2" strokeDasharray="4 4" />)}
    <line x1="52" y1="104" x2="148" y2="104" stroke="var(--border)" strokeWidth="2" strokeLinecap="round" />
    <circle cx="150" cy="30" r="18" fill="var(--info-soft)" />
    <circle cx="150" cy="30" r="11" fill="none" stroke="var(--info)" strokeWidth="2.5" />
    <path d="M150 24v6l4 3" stroke="var(--info)" strokeWidth="2.5" strokeLinecap="round" fill="none" />
  </Frame>
);
const IlloMessages = () => (
  <Frame>
    <path d="M38 34h82a12 12 0 0 1 12 12v30a12 12 0 0 1-12 12H66l-16 14v-14h-12a12 12 0 0 1-12-12V46a12 12 0 0 1 12-12Z" fill="var(--card)" stroke="var(--border)" strokeWidth="2" />
    <rect x="42" y="52" width="60" height="6" rx="3" fill="var(--muted)" />
    <rect x="42" y="66" width="40" height="6" rx="3" fill="var(--muted)" />
    <path d="M100 62h62a10 10 0 0 1 10 10v24a10 10 0 0 1-10 10h-6v12l-14-12h-42a10 10 0 0 1-10-10V72a10 10 0 0 1 10-10Z" fill="var(--primary)" />
    <circle cx="116" cy="84" r="4" fill="var(--primary-foreground)" opacity=".8" />
    <circle cx="131" cy="84" r="4" fill="var(--primary-foreground)" opacity=".6" />
    <circle cx="146" cy="84" r="4" fill="var(--primary-foreground)" opacity=".4" />
  </Frame>
);
const IlloChildren = () => (
  <Frame>
    <circle cx="74" cy="50" r="16" fill="var(--card)" stroke="var(--border)" strokeWidth="2" />
    <path d="M44 118c0-24 13-40 30-40s30 16 30 40Z" fill="var(--card)" stroke="var(--border)" strokeWidth="2" />
    <circle cx="132" cy="64" r="13" fill="none" stroke="var(--input)" strokeWidth="2" strokeDasharray="5 4" />
    <path d="M108 118c0-20 10-32 24-32s24 12 24 32" fill="none" stroke="var(--input)" strokeWidth="2" strokeDasharray="5 4" />
    <circle cx="160" cy="40" r="13" fill="var(--accent)" />
    <path d="M160 33v14M153 40h14" stroke="var(--accent-foreground)" strokeWidth="3" strokeLinecap="round" />
  </Frame>
);

export default function EmptyStates() {
  const t = useT(T);
  const illos = [<IlloAssignments key="a" />, <IlloResults key="b" />, <IlloMessages key="c" />, <IlloChildren key="d" />];
  const icons = [<Sparkles key="a" />, <Dir key="b"><ArrowRight /></Dir>, <MessageCirclePlus key="c" />, <KeyRound key="d" />];
  return (
    <div className="min-h-screen bg-background px-4 py-6 md:px-10 md:py-10">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 md:gap-8">
        <header className="flex flex-col gap-3">
          <Logo />
          <div><h1 className="text-2xl font-extrabold md:text-3xl">{t.title}</h1><p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-base">{t.sub}</p></div>
        </header>
        <div className="grid gap-4 md:grid-cols-2 md:gap-5">
          {t.cards.map((c, i) => (
            <Card key={c.where} className="flex flex-col p-4 md:p-5">
              <Badge tone="neutral" className="w-fit">{c.where}</Badge>
              <div className="flex flex-1 flex-col items-center gap-4 px-2 pb-3 pt-5 text-center md:px-6">
                {illos[i]}
                <p className="max-w-xs text-[15px] leading-relaxed">{c.text}</p>
                <Button variant={i === 0 || i === 3 ? 'default' : 'outline'}>{i === 1 ? <>{c.action}{icons[i]}</> : <>{icons[i]}{c.action}</>}</Button>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
