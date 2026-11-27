import { CalendarClock, ChevronRight, Clock, FileText, LogOut, MessageSquare, Paperclip, Send, UserRound, Users } from 'lucide-react';
import * as React from 'react';
import { useT } from '@/lib/preview';
import { Avatar, Badge, Button, Card, Dir, SearchField, Select, TextField, Toggle } from '@/components/ui';
import { cn } from '@/lib/utils';
import { SchoolShell } from './SchoolShell';

type Status = 'sent' | 'progress' | 'done' | 'refused';
type Kind = 'cert' | 'leave' | 'meeting' | 'other';

const T = {
  en: {
    title: 'Requests', sub: '6 open · parents send these from the app', search: 'Search parent or learner',
    all: 'All', st: { sent: 'Sent', progress: 'In progress', done: 'Done', refused: 'Refused' } as Record<Status, string>,
    kind: { cert: 'Enrolment certificate', leave: 'Early leave', meeting: 'Meeting with a teacher', other: 'Other' } as Record<Kind, string>,
    type: 'Type', allTypes: 'All types', waiting: 'Waiting over 48 h',
    list: [
      { id: 'R-1047', parent: 'Karim Fathy', child: 'Laila Karim · 4C', kind: 'leave', when: 'Today, 08:05', status: 'sent', note: 'Pick-up at 12:30 for a doctor’s appointment' },
      { id: 'R-1046', parent: 'Hoda Samir', child: 'Youssef Samir · 8A', kind: 'cert', when: 'Today, 07:52', status: 'sent', note: 'Needed for the embassy, in English' },
      { id: 'R-1042', parent: 'Nadia Hassan', child: 'Omar Hassan · 6B', kind: 'meeting', when: 'Yesterday, 18:20', status: 'progress', note: 'About Omar’s maths results this term' },
      { id: 'R-1039', parent: 'Tamer Adel', child: 'Salma Tamer · 9A', kind: 'other', when: '24 Nov, 13:40', status: 'progress', note: 'Lost sports kit, can the school check?' },
      { id: 'R-1035', parent: 'Mona Ibrahim', child: 'Adam Mostafa · 2A', kind: 'cert', when: '23 Nov, 10:02', status: 'sent', note: 'For the sports club registration', late: true },
      { id: 'R-1031', parent: 'Sherif Lotfy', child: 'Mariam Sherif · 5B', kind: 'meeting', when: '22 Nov, 16:11', status: 'progress', note: 'Meeting with the class teacher', late: true },
      { id: 'R-1027', parent: 'Rania Saad', child: 'Ali Wael · 3C', kind: 'leave', when: '21 Nov, 09:30', status: 'done', note: 'Leave at 11:00 for a family event' },
      { id: 'R-1024', parent: 'Wael Gaber', child: 'Nour Wael · 7A', kind: 'other', when: '20 Nov, 20:45', status: 'refused', note: 'Change of bus stop mid-term' },
    ] as { id: string; parent: string; child: string; kind: Kind; when: string; status: Status; note: string; late?: boolean }[],
    open: 'R-1042', reqFor: 'For', cls: 'Class 6B', opened: 'Opened yesterday at 18:20',
    status: 'Status', assignee: 'Assigned to',
    people: [{ id: 'dina', name: 'Dina Mahmoud · Maths teacher' }, { id: 'ahmed', name: 'Ahmed Anwar · Admin' }, { id: 'reem', name: 'Reem Khalil · Head of Grade 6' }],
    statuses: [{ id: 'sent', name: 'Sent' }, { id: 'progress', name: 'In progress' }, { id: 'done', name: 'Done' }, { id: 'refused', name: 'Refused' }],
    msgs: [
      { me: false, who: 'Nadia Hassan', time: 'Yesterday, 18:20', text: 'Good evening. Omar’s maths marks dropped this term and he says the fractions unit was hard. Could I meet his maths teacher this week? Any afternoon after 14:00 works for me.' },
      { me: true, who: 'Ahmed Anwar', time: 'Today, 08:10', text: 'Good morning Mrs Nadia, thank you for reaching out. I have passed your request to Ms Dina Mahmoud, Omar’s maths teacher. She can meet on Tuesday 1 December at 14:15 or Wednesday 2 December at 14:30.' },
      { me: false, who: 'Nadia Hassan', time: 'Today, 08:34', text: 'Tuesday at 14:15 is perfect. Should I come to the main reception?' },
    ],
    system: 'Ahmed Anwar assigned this request to Dina Mahmoud · today, 08:10',
    reply: 'Reply to Nadia Hassan', replyPh: 'Write a reply. The parent sees it in the app.', replyV: 'Yes, please come to the main reception at 14:10. Ms Dina will meet you in meeting room 2.',
    attach: 'Attach', send: 'Send reply', sendDone: 'Send and mark done', visible: 'Parents see your name and replies. Internal notes stay with the school.',
  },
  ar: {
    title: 'الطلبات', sub: '6 طلبات مفتوحة · يرسلها أولياء الأمور من التطبيق', search: 'ابحث عن وليّ أمر أو طالب',
    all: 'الكل', st: { sent: 'مُرسَل', progress: 'قيد التنفيذ', done: 'مكتمل', refused: 'مرفوض' } as Record<Status, string>,
    kind: { cert: 'شهادة قيد', leave: 'انصراف مبكر', meeting: 'لقاء مع معلّم', other: 'طلب آخر' } as Record<Kind, string>,
    type: 'النوع', allTypes: 'كل الأنواع', waiting: 'ينتظر أكثر من 48 ساعة',
    list: [
      { id: 'R-1047', parent: 'كريم فتحي', child: 'ليلى كريم · 4C', kind: 'leave', when: 'اليوم، 08:05', status: 'sent', note: 'الانصراف في الساعة 12:30 لموعد عند الطبيب' },
      { id: 'R-1046', parent: 'هدى سمير', child: 'يوسف سمير · 8A', kind: 'cert', when: 'اليوم، 07:52', status: 'sent', note: 'مطلوبة للسفارة باللغة الإنجليزية' },
      { id: 'R-1042', parent: 'نادية حسن', child: 'عمر حسن · 6B', kind: 'meeting', when: 'أمس، 18:20', status: 'progress', note: 'بشأن نتائج عمر في الرياضيات هذا الفصل' },
      { id: 'R-1039', parent: 'تامر عادل', child: 'سلمى تامر · 9A', kind: 'other', when: '24 نوفمبر، 13:40', status: 'progress', note: 'فُقد الزي الرياضي، هل يمكن للمدرسة البحث عنه؟' },
      { id: 'R-1035', parent: 'منى إبراهيم', child: 'آدم مصطفى · 2A', kind: 'cert', when: '23 نوفمبر، 10:02', status: 'sent', note: 'للتسجيل في النادي الرياضي', late: true },
      { id: 'R-1031', parent: 'شريف لطفي', child: 'مريم شريف · 5B', kind: 'meeting', when: '22 نوفمبر، 16:11', status: 'progress', note: 'لقاء مع معلّمة الفصل', late: true },
      { id: 'R-1027', parent: 'رانيا سعد', child: 'علي وائل · 3C', kind: 'leave', when: '21 نوفمبر، 09:30', status: 'done', note: 'الانصراف في الساعة 11:00 لمناسبة عائلية' },
      { id: 'R-1024', parent: 'وائل جابر', child: 'نور وائل · 7A', kind: 'other', when: '20 نوفمبر، 20:45', status: 'refused', note: 'تغيير محطة الحافلة في منتصف الفصل' },
    ] as { id: string; parent: string; child: string; kind: Kind; when: string; status: Status; note: string; late?: boolean }[],
    open: 'R-1042', reqFor: 'بشأن', cls: 'فصل 6B', opened: 'فُتح أمس في الساعة 18:20',
    status: 'الحالة', assignee: 'المسؤول',
    people: [{ id: 'dina', name: 'دينا محمود · معلّمة الرياضيات' }, { id: 'ahmed', name: 'أحمد أنور · الإدارة' }, { id: 'reem', name: 'ريم خليل · رئيسة الصف السادس' }],
    statuses: [{ id: 'sent', name: 'مُرسَل' }, { id: 'progress', name: 'قيد التنفيذ' }, { id: 'done', name: 'مكتمل' }, { id: 'refused', name: 'مرفوض' }],
    msgs: [
      { me: false, who: 'نادية حسن', time: 'أمس، 18:20', text: 'مساء الخير. انخفضت درجات عمر في الرياضيات هذا الفصل، ويقول إن وحدة الكسور كانت صعبة. هل يمكنني لقاء معلّمة الرياضيات هذا الأسبوع؟ يناسبني أي يوم بعد الساعة 14:00.' },
      { me: true, who: 'أحمد أنور', time: 'اليوم، 08:10', text: 'صباح الخير أستاذة نادية، وشكرًا على تواصلك. أحلتُ طلبك إلى الأستاذة دينا محمود معلّمة الرياضيات. يمكنها اللقاء يوم الثلاثاء 1 ديسمبر في الساعة 14:15 أو يوم الأربعاء 2 ديسمبر في الساعة 14:30.' },
      { me: false, who: 'نادية حسن', time: 'اليوم، 08:34', text: 'الثلاثاء في الساعة 14:15 مناسب تمامًا. هل أحضر إلى الاستقبال الرئيسي؟' },
    ],
    system: 'أسند أحمد أنور هذا الطلب إلى دينا محمود · اليوم، 08:10',
    reply: 'الرد على نادية حسن', replyPh: 'اكتب ردًّا يراه وليّ الأمر في التطبيق.', replyV: 'نعم، يُرجى الحضور إلى الاستقبال الرئيسي في الساعة 14:10، وستلتقي بك الأستاذة دينا في قاعة الاجتماعات رقم 2.',
    attach: 'إرفاق', send: 'إرسال الرد', sendDone: 'إرسال وإنهاء الطلب', visible: 'يرى وليّ الأمر اسمك وردودك. أما الملاحظات الداخلية فتبقى لدى المدرسة.',
  },
};

const KIND_ICON: Record<Kind, React.ReactNode> = { cert: <FileText />, leave: <LogOut />, meeting: <Users />, other: <MessageSquare /> };
const TONE: Record<Status, 'info' | 'warning' | 'success' | 'danger'> = { sent: 'info', progress: 'warning', done: 'success', refused: 'danger' };

export default function SchoolRequests() {
  const t = useT(T);
  const open = t.list.find((r) => r.id === t.open)!;
  const types = [{ id: 'all', name: t.allTypes }, ...(Object.keys(t.kind) as Kind[]).map((k) => ({ id: k, name: t.kind[k] }))];
  return (
    <SchoolShell active="requests" title={t.title} subtitle={t.sub}>
      <div className="mx-auto flex max-w-6xl flex-col gap-4 lg:h-[calc(100vh-7rem)] lg:flex-row">
        {/* Inbox */}
        <div className="flex min-w-0 flex-col gap-3 lg:w-[380px] lg:shrink-0">
          <div className="flex gap-2">
            <SearchField aria-label={t.search} placeholder={t.search} className="min-w-0 flex-1" />
            <Select aria-label={t.type} items={types} defaultSelectedKey="all" className="w-40 shrink-0" />
          </div>
          <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-wrap lg:px-0">
            <Toggle defaultSelected className="shrink-0">{t.all}</Toggle>
            {(['sent', 'progress', 'done', 'refused'] as Status[]).map((s) => (
              <Toggle key={s} className="shrink-0">{t.st[s]}<span className="text-xs opacity-70 tabular-nums">{s === 'sent' ? 3 : s === 'progress' ? 3 : s === 'done' ? 41 : 4}</span></Toggle>
            ))}
          </div>
          <Card className="min-h-0 flex-1 divide-y overflow-y-auto">
            {t.list.map((r) => {
              const active = r.id === t.open;
              return (
                <a key={r.id} href="#" aria-current={active ? 'true' : undefined} className={cn('flex gap-3 px-3 py-3 hover:bg-muted/60', active && 'bg-secondary lg:shadow-[inset_3px_0_0_var(--primary)] rtl:lg:shadow-[inset_-3px_0_0_var(--primary)]')}>
                  <span className={cn('mt-0.5 grid size-8 shrink-0 place-items-center rounded-md [&_svg]:size-4', active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>{KIND_ICON[r.kind]}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="min-w-0 flex-1 truncate text-sm font-semibold">{r.parent}</p>
                      <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">{r.when}</span>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{t.kind[r.kind]} · {r.child}</p>
                    <p className="mt-0.5 truncate text-xs">{r.note}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <Badge tone={TONE[r.status]}>{t.st[r.status]}</Badge>
                      {r.late && <Badge tone="danger"><Clock />{t.waiting}</Badge>}
                    </div>
                  </div>
                  <Dir><ChevronRight className="mt-2 size-4 shrink-0 text-muted-foreground lg:hidden" /></Dir>
                </a>
              );
            })}
          </Card>
        </div>

        {/* Open request (desktop) */}
        <Card className="hidden min-w-0 flex-1 flex-col overflow-hidden lg:flex">
          <div className="flex flex-col gap-3 border-b p-4">
            <div className="flex items-start gap-3">
              <Avatar name={open.parent} className="size-10" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><h2 className="text-base font-bold">{t.kind[open.kind]}</h2><Badge tone="outline" className="font-mono">{open.id}</Badge></div>
                <p className="text-sm text-muted-foreground"><UserRound className="me-1 inline size-3.5 align-[-2px]" />{open.parent} · {t.reqFor} {open.child}</p>
                <p className="text-xs text-muted-foreground"><CalendarClock className="me-1 inline size-3.5 align-[-2px]" />{t.opened}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Select label={t.status} items={t.statuses} defaultSelectedKey="progress" />
              <Select label={t.assignee} items={t.people} defaultSelectedKey="dina" />
            </div>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto bg-muted/40 p-4">
            {t.msgs.map((m, i) => (
              <React.Fragment key={i}>
              {i === 1 && <p className="self-center rounded-full bg-card px-3 py-1 text-[11px] text-muted-foreground shadow-sm">{t.system}</p>}
              <div className={cn('flex max-w-[85%] flex-col gap-1', m.me ? 'self-end items-end' : 'self-start items-start')}>
                <span className="px-1 text-[11px] text-muted-foreground">{m.who} · {m.time}</span>
                <p className={cn('rounded-xl px-3.5 py-2.5 text-sm leading-relaxed', m.me ? 'rounded-se-sm bg-primary text-primary-foreground' : 'rounded-ss-sm border bg-card')}>{m.text}</p>
              </div>
              </React.Fragment>
            ))}
          </div>
          <div className="flex flex-col gap-2 border-t p-4">
            <TextField aria-label={t.reply} multiline placeholder={t.replyPh} defaultValue={t.replyV} />
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="ghost" size="sm"><Paperclip />{t.attach}</Button>
              <p className="min-w-0 flex-1 text-[11px] text-muted-foreground">{t.visible}</p>
              <Button variant="outline" size="sm">{t.sendDone}</Button>
              <Button size="sm"><Send className="rtl:-scale-x-100" />{t.send}</Button>
            </div>
          </div>
        </Card>
      </div>
    </SchoolShell>
  );
}
