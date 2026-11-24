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
    tabs: { home: 'Home', progress: 'Progress', activity: 'Activity', controls: 'Controls', account: 'Account', school: 'School' },
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
    level: 'Level', toNext: (pct: string, next: string) => `${pct}% of the way to ${next}`, readyCheckpoint: (cur: string, next: string) => `Ready for the ${cur} checkpoint test. Passing it moves up to ${next}.`, subLevel: 'Step', newCanDo: 'New can-do:', noSubLevel: 'Sub-levels are measured for A1 and A2 only for now.',
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
    share: 'Share this week', shareTitle: (name: string) => `${name}'s week in English`, shareEmail: 'Send by email', shareWhatsapp: 'Share on WhatsApp', shareSent: 'Sent to your email.', shareWhatsappReady: 'WhatsApp message ready (sending is not connected yet):', shareFailed: 'Could not send. Try again later.', shareEmailBlocked: 'Parent emails are switched on in a later step.', close: 'Close',
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
    // Parents P1
    addAnotherChild: 'Add another child', addAnotherBody: "Enter the code from this child's school. Each child has their own code; children can be at different schools.",
    secretCode: "This code is secret. Anyone who has it can see your child's data. Don't share it. The school can unlink a parent at any time.",
    codeSchoolOff: "Parent access is switched off at this child's school. Ask the school.",
    planTitle: 'ENARA Parents', providedBy: (school: string) => `Provided by ${school}`, providedFree: 'Free for you: your school provides ENARA Parents.',
    signInTitle: 'Signing in', codeOnlyBody: 'You joined with a school code. This device remembers you. If you lose this device or sign out, ask the school for a new code.',
    codeOnlySignOut: 'You joined with a school code and have no email on this account. If you sign out, you will need a new code from the school to come back. Sign out anyway?',
    hiddenBySchool: "A child linked to you is hidden for now: their school switched parent access off. Ask the school.",
    // Parents school app (a). Data comes from the school; ENARA only shows it.
    sch: {
      title: 'School', today: 'Today', timetable: 'Timetable', attendance: 'Attendance', announcements: 'Announcements', notifications: 'Notifications',
      attendanceToday: 'Attendance today', notRecorded: 'Not recorded yet', todayClasses: 'Classes today', noClassesToday: 'No classes today.',
      status: { present: 'Present', absent: 'Absent', late: 'Late', excused: 'Excused' } as Record<string, string>,
      period: (p: string) => `Period ${p}`, teacher: 'Teacher', room: 'Room', group: (g: string) => `Class ${g}`, noTimetable: 'The school has not shared a timetable yet.',
      source: (label: string, when: string) => `From the school's ${label} · updated ${when}`, sourceNone: (label: string) => `From the school's ${label}`,
      srcLabel: { timetable: 'timetable', attendance: 'attendance sheet', announcements: 'announcements' } as Record<string, string>,
      month: 'Month', prevMonth: 'Previous month', nextMonth: 'Next month', noAttendance: 'No attendance recorded this month.', counts: (p: string, a: string, l: string, e: string) => `Present ${p} · Absent ${a} · Late ${l} · Excused ${e}`,
      noAnnouncements: 'No announcements right now.', newAnnouncements: (n: string) => `${n} announcements`, until: (d: string) => `Until ${d}`, forAll: 'Whole school', forGrade: 'This grade', forGroup: 'This class', forStudent: 'Only for your child',
      noNotifications: 'No notifications yet.', unread: (n: string) => `${n} unread`, markAllRead: 'Mark all as read', wasAbsent: (name: string, d: string) => `${name} was absent on ${d}.`, wasLate: (name: string, d: string) => `${name} was late on ${d}.`, fromRegister: "From the school's attendance register.", bell: (n: string) => `Notifications, ${n} unread`,
      kind: { absence: 'Absence', late: 'Late arrival', announcement: 'Announcement' } as Record<string, string>,
      off: 'The school has not shared this.', displayOnly: 'This information comes from the school. For any correction, contact the school.',
    },
    // Parents P3
    waitingForTeacher: 'Waiting for the teacher',
    allSubjects: 'All subjects', subjectsNav: 'Subjects', howToHelp: 'How you can help this week', helpWhy: 'Why', helpSay: 'You could say',
    pointsToPractise: 'Points to practise', pointsCount: (n: string) => `${n} to practise`, noPoints: 'Nothing to practise right now.',
    lessonsOf: (d: string, t: string) => `${d} of ${t} lessons`, outcomesOf: (m: string, t: string) => `${m} of ${t} outcomes mastered`,
    subjectLevel: 'Level', latestResult: 'Latest result', recentSessions: 'Recent sessions', noRecentSessions: 'No tutor sessions yet.',
    comingNext: 'Coming next', nextLesson: 'Next lesson', dueOn: (d: string) => `Due ${d}`, outcomesTitle: 'Outcomes', minThisWeek: (n: string) => `${n} min this week`,
    noSubjects: 'Subjects show here once there is activity.',
    // Parents P4
    emailWeekly: 'Weekly summary by email', emailNewResults: 'New results by email', emailsNeedAddress: 'Add your email above to get these.',
    shareNoEmail: 'Add your email in Account first, then try again.',
    // Parents P2: add your email (6-digit code) and the merge it may offer
    addEmailPrompt: 'Add your email to get notifications and sign in on any device.',
    addEmailLost: 'Without an email, if you lose this device or sign out, you will need a new code from the school.',
    addEmail: 'Add email', notNow: 'Not now', emailLabel: 'Your email', emailPh: 'name@example.com', sendCode: 'Email me a code',
    codeSentTo: (e: string) => `We sent a 6-digit code to ${e}. It expires in 10 minutes.`, codeLabel6: '6-digit code', verifyEmail: 'Confirm email',
    emailAdded: (e: string) => `Your email ${e} is confirmed. You can now sign in on any device with it.`,
    emailTitle: 'Email', emailVerified: 'Confirmed', emailNotVerified: 'Not confirmed yet', changeEmail: 'Change email',
    mergeTitle: 'This email already has an account with another child. Merge them?',
    mergeBody: (other: string) => `That account follows ${other}. Merging keeps every child, setting and history in one account, which you then sign in to with this email.`,
    merge: 'Merge accounts', merged: 'Your accounts are merged.',
    emailErrInvalid: 'That code is not right or has expired.', emailErrLocked: 'Too many tries. Ask for a new code.', emailErrSoon: 'Wait a minute before asking for a new code.',
    emailErrMany: 'Too many codes for this email. Try again in an hour.', emailErrUnusable: 'Use an email address you can receive mail at.', emailErrStaff: 'This email belongs to an ENARA school account. Use a different email.',
    emailErrBad: 'Enter an email like name@example.com.', emailErrSend: 'The code could not be sent. Try again later.',
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
    tabs: { home: 'الرئيسية', progress: 'التقدّم', activity: 'النشاط', controls: 'الإعدادات', account: 'الحساب', school: 'المدرسة' },
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
    level: 'المستوى', toNext: (pct: string, next: string) => `${pct}٪ من الطريق لـ ${next}`, readyCheckpoint: (cur: string, next: string) => `جاهز لاختبار مستوى ${cur}. لو نجح فيه يطلع لـ ${next}.`, subLevel: 'خطوة', newCanDo: 'مهارة جديدة:', noSubLevel: 'المستويات الفرعية بتتقاس لـ A1 و A2 بس دلوقتي.',
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
    share: 'شارك الأسبوع ده', shareTitle: (name: string) => `أسبوع ${name} في الإنجليزي`, shareEmail: 'ابعت بالإيميل', shareWhatsapp: 'شارك على واتساب', shareSent: 'اتبعت على إيميلك.', shareWhatsappReady: 'رسالة واتساب جاهزة (الإرسال لسه مش متوصّل):', shareFailed: 'مقدرناش نبعت. جرّب بعدين.', shareEmailBlocked: 'إيميلات أولياء الأمور هتتفعّل في خطوة جاية.', close: 'إغلاق',
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
    // Parents P1
    addAnotherChild: 'إضافة طفل آخر', addAnotherBody: 'أدخل الرمز الذي أعطته لك مدرسة هذا الطفل. لكل طفل رمز خاص به، ويمكن أن يكون الأبناء في مدارس مختلفة.',
    secretCode: 'هذا الرمز سري. أي شخص يحصل عليه يمكنه رؤية بيانات طفلك. لا تشاركه مع أحد. ويمكن للمدرسة إلغاء ربط أي ولي أمر في أي وقت.',
    codeSchoolOff: 'وصول أولياء الأمور متوقف في مدرسة هذا الطفل. تواصل مع المدرسة.',
    planTitle: 'بوابة أولياء الأمور في إنارة', providedBy: (school: string) => `مقدَّمة من ${school}`, providedFree: 'مجانية لك: تقدّم مدرستك بوابة أولياء الأمور.',
    signInTitle: 'تسجيل الدخول', codeOnlyBody: 'انضممت برمز من المدرسة. هذا الجهاز يتذكرك. إذا فقدت هذا الجهاز أو سجّلت الخروج، فاطلب رمزًا جديدًا من المدرسة.',
    codeOnlySignOut: 'انضممت برمز من المدرسة ولا يوجد بريد إلكتروني في هذا الحساب. إذا سجّلت الخروج فستحتاج إلى رمز جديد من المدرسة للعودة. هل تريد تسجيل الخروج؟',
    hiddenBySchool: 'أحد أبنائك المرتبطين مخفي حاليًا: أوقفت مدرسته وصول أولياء الأمور. تواصل مع المدرسة.',
    // تطبيق المدرسة لأولياء الأمور (أ). البيانات من المدرسة؛ إنارة تعرضها فقط.
    sch: {
      title: 'المدرسة', today: 'اليوم', timetable: 'الجدول', attendance: 'الحضور', announcements: 'الإعلانات', notifications: 'الإشعارات',
      attendanceToday: 'الحضور اليوم', notRecorded: 'لم يُسجَّل بعد', todayClasses: 'حصص اليوم', noClassesToday: 'لا حصص اليوم.',
      status: { present: 'حاضر', absent: 'غائب', late: 'متأخر', excused: 'غياب بعذر' } as Record<string, string>,
      period: (p: string) => `الحصة ${p}`, teacher: 'المعلم', room: 'القاعة', group: (g: string) => `الفصل ${g}`, noTimetable: 'لم تشارك المدرسة الجدول بعد.',
      source: (label: string, when: string) => `من ${label} المدرسة · آخر تحديث ${when}`, sourceNone: (label: string) => `من ${label} المدرسة`,
      srcLabel: { timetable: 'جدول', attendance: 'كشف حضور', announcements: 'إعلانات' } as Record<string, string>,
      month: 'الشهر', prevMonth: 'الشهر السابق', nextMonth: 'الشهر التالي', noAttendance: 'لا يوجد حضور مسجَّل هذا الشهر.', counts: (p: string, a: string, l: string, e: string) => `حاضر ${p} · غائب ${a} · متأخر ${l} · بعذر ${e}`,
      noAnnouncements: 'لا توجد إعلانات الآن.', newAnnouncements: (n: string) => `${n} إعلانات`, until: (d: string) => `حتى ${d}`, forAll: 'كل المدرسة', forGrade: 'هذا الصف', forGroup: 'هذا الفصل', forStudent: 'لطفلك فقط',
      noNotifications: 'لا توجد إشعارات بعد.', unread: (n: string) => `${n} غير مقروءة`, markAllRead: 'تعليم الكل كمقروء', wasAbsent: (name: string, d: string) => `تغيّب ${name} يوم ${d}.`, wasLate: (name: string, d: string) => `تأخّر ${name} يوم ${d}.`, fromRegister: 'من سجل الحضور في المدرسة.', bell: (n: string) => `الإشعارات، ${n} غير مقروءة`,
      kind: { absence: 'غياب', late: 'تأخر', announcement: 'إعلان' } as Record<string, string>,
      off: 'لم تشارك المدرسة هذه المعلومات.', displayOnly: 'هذه المعلومات من المدرسة. لأي تصحيح تواصل مع المدرسة.',
    },
    // Parents P3
    waitingForTeacher: 'بانتظار المعلم',
    allSubjects: 'كل المواد', subjectsNav: 'المواد', howToHelp: 'إزاي تساعد الأسبوع ده', helpWhy: 'ليه', helpSay: 'ممكن تقول',
    pointsToPractise: 'نقاط محتاجة تدريب', pointsCount: (n: string) => `${n} محتاجة تدريب`, noPoints: 'مفيش حاجة محتاجة تدريب دلوقتي.',
    lessonsOf: (d: string, t: string) => `${d} من ${t} درس`, outcomesOf: (m: string, t: string) => `${m} من ${t} هدف متقن`,
    subjectLevel: 'المستوى', latestResult: 'آخر نتيجة', recentSessions: 'آخر الجلسات', noRecentSessions: 'مفيش جلسات مع المعلم لسه.',
    comingNext: 'الجاي', nextLesson: 'الدرس الجاي', dueOn: (d: string) => `التسليم ${d}`, outcomesTitle: 'الأهداف', minThisWeek: (n: string) => `${n} دقيقة الأسبوع ده`,
    noSubjects: 'المواد هتظهر هنا أول ما يبقى فيه نشاط.',
    // Parents P4
    emailWeekly: 'الملخص الأسبوعي بالبريد الإلكتروني', emailNewResults: 'النتائج الجديدة بالبريد الإلكتروني', emailsNeedAddress: 'أضف بريدك الإلكتروني أعلاه لتصلك هذه الرسائل.',
    shareNoEmail: 'أضف بريدك الإلكتروني من صفحة الحساب أولًا، ثم حاول مرة أخرى.',
    // Parents P2
    addEmailPrompt: 'أضف بريدك الإلكتروني لتصلك الإشعارات وتسجّل الدخول من أي جهاز.',
    addEmailLost: 'بدون بريد إلكتروني، إذا فقدت هذا الجهاز أو سجّلت الخروج فستحتاج إلى رمز جديد من المدرسة.',
    addEmail: 'أضف البريد', notNow: 'ليس الآن', emailLabel: 'بريدك الإلكتروني', emailPh: 'name@example.com', sendCode: 'أرسل إليّ رمزًا',
    codeSentTo: (e: string) => `أرسلنا رمزًا من 6 أرقام إلى ${e}. تنتهي صلاحيته خلال 10 دقائق.`, codeLabel6: 'الرمز المكوّن من 6 أرقام', verifyEmail: 'تأكيد البريد',
    emailAdded: (e: string) => `تم تأكيد بريدك ${e}. يمكنك الآن تسجيل الدخول به من أي جهاز.`,
    emailTitle: 'البريد الإلكتروني', emailVerified: 'مؤكَّد', emailNotVerified: 'غير مؤكَّد بعد', changeEmail: 'تغيير البريد',
    mergeTitle: 'هذا البريد الإلكتروني له حساب بالفعل مع طفل آخر. هل تريد دمج الحسابين؟',
    mergeBody: (other: string) => `ذلك الحساب يتابع ${other}. الدمج يجمع كل الأبناء والإعدادات والسجل في حساب واحد، تسجّل الدخول إليه بهذا البريد.`,
    merge: 'دمج الحسابين', merged: 'تم دمج حساباتك.',
    emailErrInvalid: 'الرمز غير صحيح أو انتهت صلاحيته.', emailErrLocked: 'محاولات كثيرة. اطلب رمزًا جديدًا.', emailErrSoon: 'انتظر دقيقة قبل طلب رمز جديد.',
    emailErrMany: 'طلبات كثيرة لهذا البريد. حاول مرة أخرى بعد ساعة.', emailErrUnusable: 'استخدم بريدًا إلكترونيًا يمكنك استقبال الرسائل عليه.', emailErrStaff: 'هذا البريد تابع لحساب مدرسة على إنارة. استخدم بريدًا آخر.',
    emailErrBad: 'أدخل بريدًا إلكترونيًا مثل name@example.com.', emailErrSend: 'تعذّر إرسال الرمز. حاول لاحقًا.',
    unlink: 'شيل الربط', unlinkConfirm: (name: string) => `تشيل الربط بـ ${name}؟ مش هتشوف تقدّمه تاني.`,
    noLearners: 'مفيش أبناء مربوطين لسه', noLearnersBody: 'اطلب من مدرسة ابنك كود ربط وليّ الأمر، واكتبه هنا.',
    pendingLink: 'فيه ربط مستني التأكيد.',
    linkTitle: 'اربط ابنك', linkBody: 'اكتب الكود اللي من مدرسة ابنك. شكله كده ENR-ABCD-EFGH.', codeLabel: 'كود ربط وليّ الأمر', codePh: 'ENR-XXXX-XXXX', check: 'اتأكد من الكود',
    previewTitle: 'ده ابنك؟', previewSchool: (s: string) => `في ${s}`, confirm: 'أيوه، اربط ابني', cancel: 'إلغاء', linked: (name: string) => `${name} اتربط. تقدر تتابع تقدّمه دلوقتي.`,
    codeInvalid: 'الكود مش صحيح أو خلص', codeLocked: 'كودات غلط كتير. جرّب تاني بعد ١٥ دقيقة.', whatYouSee: 'بعد الربط هتشوف تقدّمه وجلساته ومحادثاته، وهو هيعرف إنك شايف.',
  },
};
export type Strings = (typeof T)['en'];
