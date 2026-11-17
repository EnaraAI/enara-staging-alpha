// Parents Portal copy, English and Egyptian Arabic. Learner-specific text from
// the API comes as { en, ar } pairs; everything else lives here.

export type Lang = 'en' | 'ar';
export type Bi = { en: string; ar: string };
export const bi = (v: Bi | string | null | undefined, lang: Lang): string => (v == null ? '' : typeof v === 'string' ? v : v[lang] || v.en);

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
/** Numbers in the page's language (Arabic-Indic digits in Arabic). */
export const num = (n: number | string, lang: Lang): string => (lang === 'ar' ? String(n).replace(/[0-9]/g, (d) => AR_DIGITS[+d]) : String(n));

type Tier = 'kid' | '13plus';

export const T = {
  en: {
    brand: 'ENARA', parents: 'Parents', sample: 'Sample data', sampleHint: 'Parts marked Sample data are examples until ENARA has real data for them.',
    chooseLearner: 'Choose learner', age: (n: string) => `Age ${n}`, main: 'Main',
    tabs: { home: 'Home', progress: 'Progress', activity: 'Activity', controls: 'Controls', account: 'Account' },
    updated: (when: string, time: string) => `Updated ${when} · ${time} Cairo time`, justNow: 'just now', minAgo: (n: string) => `${n} min ago`,
    refresh: 'Refresh', refreshing: 'Updating…', pullToRefresh: 'Pull to refresh', loading: 'Loading…', error: 'Could not load this. Check your connection and try again.', retry: 'Try again',
    signOut: 'Sign out', language: 'Language',
    status: {
      on_track: 'On track this week', needs_nudge: 'Needs a nudge', check_this: 'Check this',
    },
    reason: (code: string, p: Record<string, any>, n: (x: number) => string): string => {
      switch (code) {
        case 'on_pace': return `${p.name} has done ${n(p.minutesDone)} of ${n(p.goalMinutes)} minutes, with ${n(p.daysLeft)} days left.`;
        case 'goal_reached': return `${p.name} reached the goal: ${n(p.minutesDone)} of ${n(p.goalMinutes)} minutes.`;
        case 'behind_pace': return `${p.name} has done ${n(p.minutesDone)} of ${n(p.goalMinutes)} minutes, with ${n(p.daysLeft)} days left.`;
        case 'missed_days': return `${p.name} has done ${n(p.minutesDone)} of ${n(p.goalMinutes)} minutes and missed the last ${n(p.missedDays)} days.`;
        case 'safety_alert': return `ENARA noticed something in a conversation this week. See the alert below.`;
        case 'score_drop': return `The latest result dropped from ${n(p.from)}% to ${n(p.to)}%.`;
        default: return '';
      }
    },
    thisWeek: 'This week', ofMin: (a: string, b: string) => `${a} of ${b} min`, ofMinShort: (b: string) => `of ${b} min`,
    ringLabel: (a: string, b: string, pct: string) => `${a} of ${b} minutes, ${pct} percent`,
    streak: (n: string) => `${n}-day streak`, sessions: (n: string) => `${n} sessions`, lastPractised: (d: string) => `last practised ${d}`, notYet: 'no practice yet',
    dayState: { practised: 'practised', missed: 'not practised', today: 'today', upcoming: 'coming up' },
    weekdays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], weekdaysLong: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    level: 'Level', toNext: (pct: string, next: string) => `${pct}% of the way to ${next}`, subLevel: 'Step', newCanDo: 'New can-do:', noSubLevel: 'Sub-levels are measured for A1 and A2 only for now.',
    learned: (name: string, tier: Tier) => (tier === 'kid' ? `This week ${name} learned` : `This week ${name} worked on`),
    aiBadge: 'ENARA summary', aiBadgeLabel: 'Written by ENARA',
    tryAtHome: 'Try this at home',
    tierNotice: {
      kid: (name: string) => ({ title: 'Kids view', body: `You see everything for ${name}, including conversations.` }),
      '13plus': (name: string) => ({ title: '13+ view', body: `You see ${name}'s progress, summaries and conversations. ${name} can see exactly what you see.` }),
    },
    alerts: 'Alerts', noAlerts: 'None', safetyAlerts: 'Safety alerts', conversations: 'Conversations', conversationsVisible: 'You can read them',
    weeklyGoal: (n: string) => `Weekly goal: ${n} min`, acceptedBy: (name: string) => `Accepted by ${name}`, waitingFor: (name: string) => `Waiting for ${name}`,
    alertCat: { personal_details: 'Shared personal details', inappropriate_content: 'Tried to push the tutor off-limits', distress: 'Signs of distress', bullying: 'Mentioned bullying' } as Record<string, string>,
    whatEnaraDid: 'What ENARA did', excerpt: 'What was said', manage: 'Manage',
    share: 'Share this week', shareTitle: (name: string) => `${name}'s week in English`, shareEmail: 'Send by email', shareWhatsapp: 'Share on WhatsApp', shareSent: 'Sent to your email.', shareWhatsappReady: 'WhatsApp message ready (sending is not connected yet):', shareFailed: 'Could not send. Try again later.', close: 'Close',
    heLearned: 'Learned', streakShort: 'day streak', openPortal: 'Open ENARA Parents', weekOf: (d: string) => `ENARA · week of ${d}`,
    // Progress
    progressTitle: 'Progress', cefrTitle: 'English level (CEFR)', skills: 'Skills', skillsSub: (lvl: string) => `Share of ${lvl} goals mastered · trend over 4 weeks`,
    skill: { listening: 'Listening', speaking: 'Speaking', reading: 'Reading', writing: 'Writing', vocabulary: 'Vocabulary', grammar: 'Grammar' } as Record<string, string>,
    trend: { up: 'going up', flat: 'steady', down: 'going down' } as Record<string, string>,
    trendTitle: 'Overall score, last 8 weeks', trendLabel: (a: string, b: string) => `Overall score went from ${a} to ${b} over 8 weeks`, assessmentMark: 'Checkpoint', thisWeekShort: 'This week',
    canDos: (lvl: string) => `${lvl} can-dos`, ofN: (a: string, b: string) => `${a} of ${b}`,
    canDoState: { achieved: 'Achieved', in_progress: 'In progress', not_started: 'Not started' } as Record<string, string>,
    strengths: 'Strengths', focusNext: 'Focus next', assessments: 'Results', passed: 'Passed', notPassed: 'Keep practising', noAssessments: 'No results yet.', lessonsDone: (n: string) => `${n} lessons completed`,
    // Activity
    activityTitle: 'Activity', last2Weeks: 'Last 2 weeks', daysPractised: (a: string, b: string) => `${a} of ${b} days practised`, practised: 'Practised', upcoming: 'Coming up', missed: 'Not practised',
    allClasses: 'All classes', classFilter: 'Show activity for', inClass: (c: string) => `Class: ${c}`, noClass: 'No class',
    noSessions: 'No sessions in the last 30 days.', howTaught: 'How ENARA taught it', wentWell: 'Went well', wasHard: 'Was hard', words: 'Words to practise together',
    speakingTime: 'Speaking time', focus: 'Focus', focusLevel: { high: 'High', medium: 'Medium', low: 'Low' } as Record<string, string>, minShort: (n: string) => `${n} min`, mShort: (n: string) => `${n}m`,
    viewConversation: 'View conversation', keptDays: (n: string) => `Kept ${n} days`, summaryOnly: 'Older than 90 days: summary only', voice: 'voice call with the tutor', chat: 'chat with the tutor',
    transcriptTitle: 'Conversation', learnerSaid: (name: string) => name, enaraSaid: 'ENARA', transcriptExpires: (d: string) => `Kept until ${d}`, noAudio: 'No audio is recorded.',
    // Controls
    controlsTitle: 'Controls', notEnforced: 'Saved for later: ENARA does not apply these settings yet.', weeklyGoalTitle: 'Weekly goal', weeklyGoalSub: 'Drives the status line and the weekly summary',
    minPerWeek: 'min / week', perDay: (n: string) => `About ${n} minutes on 5 days`, decrease: (what: string) => `Decrease ${what}`, increase: (what: string) => `Increase ${what}`,
    screenTime: 'Screen time', dailyLimit: 'Daily limit', schoolNights: 'School nights (Sun–Thu)', weekend: 'Weekend (Fri, Sat)', schoolHours: '4:00 – 9:00 pm', weekendHours: '10:00 am – 8:00 pm',
    learningFocus: 'Learning focus', focusOpt: { conversation: 'Conversation', school: 'School support', exam: 'Exam prep', reading: 'Reading' } as Record<string, string>,
    tutorSettings: 'Tutor settings', toggles: { reminders: ['Practice reminders', 'Sun–Thu at 5:00 pm in the learner\'s app'], liveAvatar: ['Live avatar tutor', 'Video tutor; off = voice and text only'], microphone: ['Microphone', 'Needed for speaking practice'], camera: ['Camera', 'Used only for pronunciation mouth-shape tips'] } as Record<string, [string, string]>,
    save: 'Save', saved: 'Saved', viewOnly: 'You have view-only access. Ask the owner to change settings.',
    coSet: (name: string) => `${name} is 13 or older: your changes are suggestions until ${name} accepts them.`,
    preview: (name: string, limit: string, goal: string, focus: string) => `${name} can practise up to ${limit} minutes a day, 4–9 pm on school nights, aiming for ${goal} minutes this week with a focus on ${focus.toLowerCase()}.`,
    // Account
    accountTitle: 'Account', learners: 'Learners', linkChild: 'Link a child', tierLine: { kid: 'Kids · you see everything, including conversations', '13plus': 'Teen or adult · you see everything, including conversations; they know what you see' },
    consentPending: 'Parental consent pending', guardians: 'Guardians', you: 'You', role: { owner: 'Owner', full: 'Full access', view: 'View only' } as Record<string, string>, makeView: 'Make view only', makeFull: 'Give full access',
    plan: 'Family plan', learnersCount: (n: string) => `${n} learners`, renews: (d: string) => `renews on ${d}`, changePlan: 'Change plan', invoices: 'Invoices', payment: 'Payment',
    preferences: 'Preferences', weeklySummary: 'Weekly summary', onDemand: 'Live progress · share any time', alertsVia: 'Alerts', channels: { push: 'Push', whatsapp: 'WhatsApp', email: 'Email' } as Record<string, string>,
    privacy: 'Privacy and data', download: "Download a learner's data", deleteConvos: 'Delete saved conversations', closeAccount: "Close a learner's account", comingSoon: 'Coming soon',
    unlink: 'Remove link', unlinkConfirm: (name: string) => `Remove your link to ${name}? You will no longer see their progress.`,
    noLearners: 'No learners linked yet', noLearnersBody: "Ask your child's school for a parent link code, then enter it here.",
    pendingLink: 'A link is waiting to be confirmed.',
    // Link a child
    linkTitle: 'Link your child', linkBody: 'Enter the code from your child\'s school. It looks like ENR-ABCD-EFGH.', codeLabel: 'Parent link code', codePh: 'ENR-XXXX-XXXX', check: 'Check code',
    previewTitle: 'Is this your child?', previewSchool: (s: string) => `at ${s}`, confirm: 'Yes, link my child', cancel: 'Cancel', linked: (name: string) => `${name} is linked. You can now follow their progress.`,
    codeInvalid: 'Code not valid or expired', codeLocked: 'Too many wrong codes. Try again in 15 minutes.', whatYouSee: 'Once linked you see their progress, sessions and conversations, and they are told that you can.',
  },
  ar: {
    brand: 'إنارة', parents: 'أولياء الأمور', sample: 'بيانات تجريبية', sampleHint: 'الأجزاء المكتوب عليها «بيانات تجريبية» أمثلة لحد ما يبقى عند إنارة بيانات حقيقية ليها.',
    chooseLearner: 'اختار الابن', age: (n: string) => `${n} سنة`, main: 'القائمة الرئيسية',
    tabs: { home: 'الرئيسية', progress: 'التقدّم', activity: 'النشاط', controls: 'الإعدادات', account: 'الحساب' },
    updated: (when: string, time: string) => `اتحدّث ${when} · ${time} بتوقيت القاهرة`, justNow: 'دلوقتي', minAgo: (n: string) => `من ${n} دقيقة`,
    refresh: 'تحديث', refreshing: 'جاري التحديث…', pullToRefresh: 'اسحب للتحديث', loading: 'جاري التحميل…', error: 'مقدرناش نحمّل ده. اتأكد من الإنترنت وجرّب تاني.', retry: 'جرّب تاني',
    signOut: 'تسجيل خروج', language: 'اللغة',
    status: { on_track: 'ماشي كويس الأسبوع ده', needs_nudge: 'محتاج تشجيع', check_this: 'بص على ده' },
    reason: (code: string, p: Record<string, any>, n: (x: number) => string): string => {
      switch (code) {
        case 'on_pace': return `${p.name} عمل ${n(p.minutesDone)} من ${n(p.goalMinutes)} دقيقة، وفاضل ${n(p.daysLeft)} أيام.`;
        case 'goal_reached': return `${p.name} وصل للهدف: ${n(p.minutesDone)} من ${n(p.goalMinutes)} دقيقة.`;
        case 'behind_pace': return `${p.name} عمل ${n(p.minutesDone)} من ${n(p.goalMinutes)} دقيقة، وفاضل ${n(p.daysLeft)} أيام.`;
        case 'missed_days': return `${p.name} عمل ${n(p.minutesDone)} من ${n(p.goalMinutes)} دقيقة ومتدرّبش آخر ${n(p.missedDays)} أيام.`;
        case 'safety_alert': return 'إنارة لاحظت حاجة في محادثة الأسبوع ده. شوف التنبيه تحت.';
        case 'score_drop': return `آخر نتيجة نزلت من ${n(p.from)}٪ لـ ${n(p.to)}٪.`;
        default: return '';
      }
    },
    thisWeek: 'الأسبوع ده', ofMin: (a: string, b: string) => `${a} من ${b} دقيقة`, ofMinShort: (b: string) => `من ${b} دقيقة`,
    ringLabel: (a: string, b: string, pct: string) => `${a} من ${b} دقيقة، ${pct} في المية`,
    streak: (n: string) => `${n} أيام ورا بعض`, sessions: (n: string) => `${n} جلسات`, lastPractised: (d: string) => `آخر تدريب ${d}`, notYet: 'لسه متدرّبش',
    dayState: { practised: 'اتدرّب', missed: 'متدرّبش', today: 'النهارده', upcoming: 'جاي' },
    weekdays: ['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س'], weekdaysLong: ['الحد', 'الاتنين', 'التلات', 'الأربع', 'الخميس', 'الجمعة', 'السبت'],
    level: 'المستوى', toNext: (pct: string, next: string) => `${pct}٪ من الطريق لـ ${next}`, subLevel: 'خطوة', newCanDo: 'مهارة جديدة:', noSubLevel: 'المستويات الفرعية بتتقاس لـ A1 و A2 بس دلوقتي.',
    learned: (name: string, tier: Tier) => (tier === 'kid' ? `${name} اتعلّم الأسبوع ده` : `${name} اشتغل الأسبوع ده على`),
    aiBadge: 'ملخص إنارة', aiBadgeLabel: 'مكتوب بواسطة إنارة',
    tryAtHome: 'جرّب ده في البيت',
    tierNotice: {
      kid: (name: string) => ({ title: 'عرض الأطفال', body: `بتشوف كل حاجة لـ ${name}، ومعاها المحادثات.` }),
      '13plus': (name: string) => ({ title: 'عرض ١٣+', body: `بتشوف تقدّم ${name} والملخصات والمحادثات. و${name} يقدر يشوف بالظبط اللي انت شايفه.` }),
    },
    alerts: 'تنبيهات', noAlerts: 'مفيش', safetyAlerts: 'تنبيهات الأمان', conversations: 'المحادثات', conversationsVisible: 'تقدر تقراها',
    weeklyGoal: (n: string) => `هدف الأسبوع: ${n} دقيقة`, acceptedBy: (name: string) => `${name} وافق`, waitingFor: (name: string) => `مستني موافقة ${name}`,
    alertCat: { personal_details: 'شارك بيانات شخصية', inappropriate_content: 'حاول يخلّي المدرّس يتكلم في حاجة مش مناسبة', distress: 'علامات ضيق', bullying: 'اتكلم عن تنمّر' } as Record<string, string>,
    whatEnaraDid: 'إنارة عملت إيه', excerpt: 'اللي اتقال', manage: 'إدارة',
    share: 'شارك الأسبوع ده', shareTitle: (name: string) => `أسبوع ${name} في الإنجليزي`, shareEmail: 'ابعت بالإيميل', shareWhatsapp: 'شارك على واتساب', shareSent: 'اتبعت على إيميلك.', shareWhatsappReady: 'رسالة واتساب جاهزة (الإرسال لسه مش متوصّل):', shareFailed: 'مقدرناش نبعت. جرّب بعدين.', close: 'إغلاق',
    heLearned: 'اتعلّم', streakShort: 'أيام ورا بعض', openPortal: 'افتح إنارة لأولياء الأمور', weekOf: (d: string) => `إنارة · أسبوع ${d}`,
    progressTitle: 'التقدّم', cefrTitle: 'مستوى الإنجليزي (CEFR)', skills: 'المهارات', skillsSub: (lvl: string) => `نسبة أهداف ${lvl} اللي اتقنها · الاتجاه في ٤ أسابيع`,
    skill: { listening: 'الاستماع', speaking: 'الكلام', reading: 'القراءة', writing: 'الكتابة', vocabulary: 'الكلمات', grammar: 'القواعد' } as Record<string, string>,
    trend: { up: 'طالع', flat: 'ثابت', down: 'نازل' } as Record<string, string>,
    trendTitle: 'الدرجة العامة، آخر ٨ أسابيع', trendLabel: (a: string, b: string) => `الدرجة العامة طلعت من ${a} لـ ${b} في ٨ أسابيع`, assessmentMark: 'اختبار', thisWeekShort: 'الأسبوع ده',
    canDos: (lvl: string) => `مهارات ${lvl}`, ofN: (a: string, b: string) => `${a} من ${b}`,
    canDoState: { achieved: 'اتحققت', in_progress: 'شغّال عليها', not_started: 'لسه' } as Record<string, string>,
    strengths: 'نقاط القوة', focusNext: 'نركّز على', assessments: 'النتائج', passed: 'نجح', notPassed: 'محتاج تدريب', noAssessments: 'مفيش نتايج لسه.', lessonsDone: (n: string) => `${n} درس خلصوا`,
    activityTitle: 'النشاط', last2Weeks: 'آخر أسبوعين', daysPractised: (a: string, b: string) => `اتدرّب ${a} من ${b} يوم`, practised: 'اتدرّب', upcoming: 'جاي', missed: 'متدرّبش',
    allClasses: 'كل الفصول', classFilter: 'اعرض نشاط', inClass: (c: string) => `الفصل: ${c}`, noClass: 'من غير فصل',
    noSessions: 'مفيش جلسات في آخر ٣٠ يوم.', howTaught: 'إنارة علّمت إزاي', wentWell: 'اللي مشي كويس', wasHard: 'اللي كان صعب', words: 'كلمات تتدرّبوا عليها سوا',
    speakingTime: 'وقت الكلام', focus: 'التركيز', focusLevel: { high: 'عالي', medium: 'متوسط', low: 'قليل' } as Record<string, string>, minShort: (n: string) => `${n} دقيقة`, mShort: (n: string) => `${n} د`,
    viewConversation: 'شوف المحادثة', keptDays: (n: string) => `بتتحفظ ${n} يوم`, summaryOnly: 'أقدم من ٩٠ يوم: الملخص بس', voice: 'مكالمة صوتية مع المدرّس', chat: 'شات مع المدرّس',
    transcriptTitle: 'المحادثة', learnerSaid: (name: string) => name, enaraSaid: 'إنارة', transcriptExpires: (d: string) => `محفوظة لحد ${d}`, noAudio: 'مفيش صوت متسجّل.',
    controlsTitle: 'الإعدادات', notEnforced: 'محفوظة لبعدين: إنارة لسه مش بتطبّق الإعدادات دي.', weeklyGoalTitle: 'هدف الأسبوع', weeklyGoalSub: 'بيحدد حالة الأسبوع والملخص',
    minPerWeek: 'دقيقة / أسبوع', perDay: (n: string) => `حوالي ${n} دقيقة في ٥ أيام`, decrease: (what: string) => `قلّل ${what}`, increase: (what: string) => `زوّد ${what}`,
    screenTime: 'وقت الشاشة', dailyLimit: 'الحد اليومي', schoolNights: 'أيام المدرسة (الحد–الخميس)', weekend: 'الويك إند (الجمعة والسبت)', schoolHours: '٤:٠٠ – ٩:٠٠ م', weekendHours: '١٠:٠٠ ص – ٨:٠٠ م',
    learningFocus: 'تركيز التعلّم', focusOpt: { conversation: 'محادثة', school: 'دعم المدرسة', exam: 'تحضير امتحانات', reading: 'قراءة' } as Record<string, string>,
    tutorSettings: 'إعدادات المدرّس', toggles: { reminders: ['تذكير بالتدريب', 'الحد–الخميس الساعة ٥ م في تطبيق الابن'], liveAvatar: ['المدرّس بالفيديو', 'لو مقفول: صوت وكتابة بس'], microphone: ['الميكروفون', 'لازم لتدريب الكلام'], camera: ['الكاميرا', 'بتُستخدم بس لنصايح نطق الفم'] } as Record<string, [string, string]>,
    save: 'حفظ', saved: 'اتحفظ', viewOnly: 'عندك صلاحية عرض بس. اطلب من صاحب الحساب يغيّر الإعدادات.',
    coSet: (name: string) => `${name} عنده ١٣ سنة أو أكتر: تغييراتك اقتراحات لحد ما ${name} يوافق عليها.`,
    preview: (name: string, limit: string, goal: string, focus: string) => `${name} يقدر يتدرّب لحد ${limit} دقيقة في اليوم، من ٤ لـ ٩ م في أيام المدرسة، والهدف ${goal} دقيقة الأسبوع ده مع تركيز على ${focus}.`,
    accountTitle: 'الحساب', learners: 'الأبناء', linkChild: 'اربط ابن', tierLine: { kid: 'أطفال · بتشوف كل حاجة، ومعاها المحادثات', '13plus': 'مراهق أو كبير · بتشوف كل حاجة ومعاها المحادثات، وهو عارف انت شايف إيه' },
    consentPending: 'موافقة وليّ الأمر لسه', guardians: 'أولياء الأمور', you: 'انت', role: { owner: 'صاحب الحساب', full: 'صلاحية كاملة', view: 'عرض بس' } as Record<string, string>, makeView: 'خليه عرض بس', makeFull: 'اديله صلاحية كاملة',
    plan: 'باقة العيلة', learnersCount: (n: string) => `${n} أبناء`, renews: (d: string) => `بتتجدد ${d}`, changePlan: 'غيّر الباقة', invoices: 'الفواتير', payment: 'الدفع',
    preferences: 'التفضيلات', weeklySummary: 'ملخص الأسبوع', onDemand: 'تقدّم لحظي · شاركه في أي وقت', alertsVia: 'التنبيهات', channels: { push: 'إشعارات', whatsapp: 'واتساب', email: 'إيميل' } as Record<string, string>,
    privacy: 'الخصوصية والبيانات', download: 'نزّل بيانات ابن', deleteConvos: 'امسح المحادثات المحفوظة', closeAccount: 'اقفل حساب ابن', comingSoon: 'قريب',
    unlink: 'شيل الربط', unlinkConfirm: (name: string) => `تشيل الربط بـ ${name}؟ مش هتشوف تقدّمه تاني.`,
    noLearners: 'مفيش أبناء مربوطين لسه', noLearnersBody: 'اطلب من مدرسة ابنك كود ربط وليّ الأمر، واكتبه هنا.',
    pendingLink: 'فيه ربط مستني التأكيد.',
    linkTitle: 'اربط ابنك', linkBody: 'اكتب الكود اللي من مدرسة ابنك. شكله كده ENR-ABCD-EFGH.', codeLabel: 'كود ربط وليّ الأمر', codePh: 'ENR-XXXX-XXXX', check: 'اتأكد من الكود',
    previewTitle: 'ده ابنك؟', previewSchool: (s: string) => `في ${s}`, confirm: 'أيوه، اربط ابني', cancel: 'إلغاء', linked: (name: string) => `${name} اتربط. تقدر تتابع تقدّمه دلوقتي.`,
    codeInvalid: 'الكود مش صحيح أو خلص', codeLocked: 'كودات غلط كتير. جرّب تاني بعد ١٥ دقيقة.', whatYouSee: 'بعد الربط هتشوف تقدّمه وجلساته ومحادثاته، وهو هيعرف إنك شايف.',
  },
};
export type Strings = (typeof T)['en'];
