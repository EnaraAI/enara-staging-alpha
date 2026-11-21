// Turns the student API responses into the data the Enara Kids screens show.
// Pure functions only, so they can be tested without a browser.
import type { Lang } from './enaraKids';

type Any = any;

export const isArabic = (lang: Lang) => lang === 'ar' || lang === 'ar-EG';
const tr = (lang: Lang) => (en: string, ar: string) => (isArabic(lang) ? ar : en);

// One colour per subject, kept the same everywhere a subject appears.
export function subjectBand(subject?: string): 'sun' | 'bubblegum' | 'leaf' | 'coral' {
  const s = (subject || '').toLowerCase();
  if (/math|رياض/.test(s)) return 'sun';
  if (/english|arabic|reading|language|لغة|عرب|انجل|إنجل/.test(s)) return 'bubblegum';
  if (/science|physics|chem|bio|علوم|فيزي|كيمي|أحياء/.test(s)) return 'leaf';
  return 'coral';
}

// Mastery levels a child can see; anything unknown counts as not tried yet.
const LEVELS = ['not_assessed', 'emerging', 'developing', 'proficient', 'mastered'];
export const levelOf = (status?: string) => (status && LEVELS.includes(status) ? status : 'not_assessed');

export const firstName = (name?: string) => (name || '').trim().split(/\s+/)[0] || '';

// ---------- Home ----------
export function homeData(input: {
  dashboard?: Any; tree?: Any; courses?: Any[]; results?: Any[]; achievements?: Any[];
  assignments?: Any[]; assessments?: Any[]; steps?: Any[]; now?: Date; lang: Lang;
}) {
  const { dashboard, tree, courses = [], results = [], achievements = [], assignments = [], assessments = [], steps = [], lang } = input;
  const now = input.now || new Date();

  // Resume: the active lesson of the course the dashboard suggests.
  let resume: Any = null;
  if (tree) {
    const lessons = (tree.modules || []).flatMap((m: Any) => m.lessons || []);
    const idx = lessons.findIndex((l: Any) => l.status === 'active');
    if (idx >= 0) {
      resume = {
        courseId: tree.id, lessonId: lessons[idx].id, subject: tree.subject, band: subjectBand(tree.subject),
        course: tree.title, lesson: lessons[idx].title, n: idx + 1, of: lessons.length,
      };
    }
  }

  // Due soon: open homework and quizzes first, then ones not open yet; three at most.
  const due: Any[] = [];
  for (const a of assignments) {
    if (a.canSubmit && (a.status === 'not_started' || a.status === 'in_progress')) {
      due.push({ id: a.id, kind: 'assignment', title: a.title, due: a.dueAt, open: true });
    }
  }
  for (const q of assessments) {
    const open = q.status === 'active' || q.status === 'in-progress';
    if (!open && q.status !== 'upcoming' && q.status !== 'pending') continue;
    due.push({
      id: q.id, kind: 'quiz', title: q.title, subject: q.subject,
      questions: q.questionCount ?? q.questions?.length, minutes: q.duration,
      due: q.dueDate, opens: open ? undefined : q.dueDate, open,
    });
  }
  due.sort((a, b) => Number(b.open) - Number(a.open) || String(a.due || '').localeCompare(String(b.due || '')));

  // The week: one stone per day for the last 7 days, counting quizzes and tutor chats.
  const days: number[] = [0, 0, 0, 0, 0, 0, 0];
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  for (const r of dashboard?.recentActivity || []) {
    const d = new Date(r.date);
    if (isNaN(d.getTime())) continue;
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const ago = Math.round((today - day) / 86_400_000);
    if (ago >= 0 && ago < 7) days[6 - ago]++;
  }

  const colors = ['sun', 'bubblegum', 'leaf', 'blue'];
  return {
    name: firstName(dashboard?.student?.name),
    resume,
    due,
    steps: steps.map((s: Any, i: number) => ({ id: `${s.kind}-${i}`, ...s })),
    courses: courses.map((c: Any) => ({
      id: c.id, subject: c.subject, band: subjectBand(c.subject), subjectColor: subjectBand(c.subject) === 'sun' ? 'blue' : 'sun',
      title: c.title, done: c.completedLessons || 0, total: c.lessonsCount || 0,
    })),
    results: results.slice(0, 3).map((r: Any) => ({ id: r.id, title: r.assessmentTitle, date: r.date, score: r.score ?? null })),
    week: days,
    badges: achievements.map((a: Any, i: number) => (a.unlocked
      ? { label: a.title, color: colors[i % colors.length], icon: i === 0 ? 'flame' : 'star' }
      : { label: a.title, locked: true })),
    weekLabels: lastSevenDayLetters(now, lang),
  };
}

export function lastSevenDayLetters(now: Date, lang: Lang): string[] {
  const out: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86_400_000);
    out.push(d.toLocaleDateString(isArabic(lang) ? 'ar-EG' : 'en-GB', { weekday: 'narrow' }));
  }
  return out;
}

// ---------- Courses and lessons ----------
export function courseOutline(tree: Any) {
  const modules = (tree?.modules || []).map((m: Any) => ({
    title: m.title,
    lessons: (m.lessons || []).map((l: Any) => ({ id: l.id, title: l.title, status: l.status })),
  }));
  const resources = (tree?.modules || []).flatMap((m: Any) => (m.materials || []).map((url: string) => ({ name: fileName(url), url })));
  return { subject: tree?.subject, title: tree?.title, modules, resources };
}

export function fileName(url: string) {
  try {
    const last = decodeURIComponent(String(url).split('?')[0].split('/').pop() || '');
    // Stored names are <school>~<uuid>-<original name>; older ones start with a timestamp.
    return last.replace(/^[A-Za-z0-9_-]+~[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i, '').replace(/^\d{10,}[-_]/, '') || url;
  } catch {
    return url;
  }
}

export function lessonView(tree: Any, lessonId: string) {
  for (const m of tree?.modules || []) {
    const lessons = m.lessons || [];
    const i = lessons.findIndex((l: Any) => l.id === lessonId);
    if (i < 0) continue;
    const l = lessons[i];
    const text = String(l.content || l.description || '').split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
    const quiz = (l.quiz?.questions || []).map((q: Any) => ({
      id: q.id, text: q.text,
      choices: (q.options || []).map((o: string, k: number) => ({ id: String(k), text: o })),
      answer: String(q.correctAnswer), why: q.explanation,
    }));
    const all = (tree.modules || []).flatMap((x: Any) => x.lessons || []);
    const at = all.findIndex((x: Any) => x.id === lessonId);
    return {
      lesson: {
        n: l.order || i + 1, minutes: null, module: m.title, title: l.title, tip: '', text, quiz,
        files: (l.materials || []).map((url: string) => ({ name: fileName(url), url })),
      },
      videoUrl: l.videoUrl as string | undefined,
      completed: l.status === 'completed',
      next: all[at + 1] && all[at + 1].status !== 'locked' ? all[at + 1] : all[at + 1] || null,
    };
  }
  return null;
}

// ---------- Quick review ----------
export function reviewQuestions(items: Any[]) {
  return items.map((q: Any) => ({
    id: q.id, topic: q.topic, text: q.question,
    choices: q.options && q.options.length ? q.options.map((o: string, i: number) => ({ id: String(i), text: o })) : undefined,
    typed: !(q.options && q.options.length),
  }));
}
// Reviews take the option index for choices and the text for typed answers.
export const reviewAnswer = (q: { typed?: boolean }, value: string) => (q.typed ? value : Number(value));
export function reviewResult(r: Any) {
  return { correct: !!r?.correct, answerText: r?.answer, explanation: r?.explanation, days: r?.nextInDays ?? undefined, mastered: r?.nextInDays === null };
}

// ---------- Homework ----------
export function homeworkList(items: Any[]) {
  return items.map((a: Any) => ({ id: a.id, title: a.title, status: a.status, due: a.dueAt, late: !!a.lateIfSubmittedNow }));
}

const HELP: Record<string, string> = { allowed: 'full', hints_only: 'hints', blocked: 'blocked' };
export function homeworkDetail(d: Any) {
  const a = d?.assignment || {};
  return {
    title: a.title, status: d?.status, due: a.dueAt,
    questions: a.questionCount, minutes: a.timeLimitMinutes || undefined, tries: a.maxAttempts > 1 ? a.maxAttempts : undefined,
    instructions: a.instructions || '',
    help: HELP[a.tutorPolicy] || 'full',
    speaking: a.format === 'english_conversation',
    format: a.format,
    late: !!(d?.window?.open && d.window.late), lateUntil: a.closesAt,
  };
}

// Assignment answers: choices are answered with the option text.
export function homeworkQuestions(questions: Any[]) {
  return questions.map((q: Any) => {
    const opts: string[] = q.options && q.options.length ? q.options : q.type === 'true-false' ? ['True', 'False'] : [];
    return {
      id: q.id, type: q.type, text: q.text,
      choices: q.type === 'multiple-choice' || q.type === 'true-false' ? opts.map(o => ({ id: o, text: o })) : undefined,
    };
  });
}

export function homeworkResult(r: Any) {
  if (!r?.released) return null;
  return {
    points: r.totalPoints ?? 0, max: r.maxPoints ?? 0, note: r.overallFeedback || '',
    items: (r.answers || []).map((x: Any, i: number) => ({
      n: i + 1, text: x.questionText, yours: x.studentAnswer ?? '',
      correct: x.isCorrect === false || (x.points != null && x.points < x.maxPoints) ? x.correctAnswer : undefined,
      right: x.isCorrect ?? (x.points != null && x.points >= x.maxPoints),
      got: x.points ?? 0, of: x.maxPoints ?? 0,
      well: (x.strengths || []).join(' '), work: [...(x.improvements || []), x.feedback].filter(Boolean).join(' '),
    })),
  };
}

// ---------- Quizzes (assessments) ----------
export function quizList(items: Any[]) {
  return items.map((q: Any) => ({
    id: q.id, subject: q.subject, title: q.title,
    questions: q.questionCount ?? q.questions?.length ?? 0, minutes: q.duration,
    status: q.status === 'active' || q.status === 'in-progress' ? 'open' : q.status === 'completed' ? 'closed' : 'upcoming',
  }));
}

// Assessment answers: choices are answered with the option index.
export function quizQuestions(questions: Any[]) {
  return questions.map((q: Any) => {
    const opts: string[] = q.options && q.options.length ? q.options : q.type === 'true-false' ? ['True', 'False'] : [];
    return {
      id: q.id, type: q.type, text: q.text,
      choices: q.type === 'multiple-choice' || q.type === 'true-false' ? opts.map((o, i) => ({ id: String(i), text: o })) : undefined,
    };
  });
}
export function quizAnswers(questions: Any[], answers: Record<string, string>) {
  const out: Record<string, string | number> = {};
  for (const q of questions) {
    const v = answers[q.id];
    if (v == null || v === '') continue;
    out[q.id] = q.type === 'multiple-choice' || q.type === 'true-false' ? Number(v) : v;
  }
  return out;
}

export function quizOutcome(r: Any) {
  return {
    score: r?.score ?? 0, correct: r?.correctCount ?? 0, total: r?.total ?? 0,
    minutes: r?.timeSpentSec ? Math.max(1, Math.round(r.timeSpentSec / 60)) : undefined,
    topics: (r?.weakTopics || []).map((t: Any) => t.topic).filter(Boolean),
    answers: answerList(r?.answers || [], !!r?.answersRevealed),
  };
}

export function answerList(answers: Any[], revealed: boolean) {
  return answers.map((a: Any, i: number) => ({
    n: i + 1, text: a.questionText, yours: a.studentAnswer ?? '',
    correct: revealed && a.isCorrect === false ? a.correctAnswer : undefined,
    right: a.isCorrect === true, why: revealed ? a.explanation : undefined,
  }));
}

// ---------- Results ----------
function topicSplit(answers: Any[]) {
  const by = new Map<string, { right: number; total: number }>();
  for (const a of answers) {
    if (!a.topic || a.isCorrect == null) continue;
    const t = by.get(a.topic) || { right: 0, total: 0 };
    t.total++; if (a.isCorrect) t.right++;
    by.set(a.topic, t);
  }
  return by;
}
export function resultList(items: Any[]) {
  return items.map((r: Any) => {
    const by = [...topicSplit(r.answers || []).entries()].map(([t, v]) => ({ t, s: v.right / v.total }));
    by.sort((a, b) => b.s - a.s);
    return {
      id: r.id, subject: r.subject, title: r.assessmentTitle, date: r.date, score: r.score ?? 0,
      great: by.length && by[0].s >= 0.7 ? by[0].t : undefined,
      next: by.length && by[by.length - 1].s < 0.7 ? by[by.length - 1].t : undefined,
    };
  });
}
export function resultTopics(items: Any[]) {
  const all = topicSplit(items.flatMap((r: Any) => r.answers || []));
  return [...all.entries()].map(([t, v]) => ({ t, s: Math.round((100 * v.right) / v.total) })).sort((a, b) => b.s - a.s);
}
export function resultDetail(r: Any) {
  const total = (r?.answers || []).length;
  return {
    minutes: r?.timeSpentSec ? Math.max(1, Math.round(r.timeSpentSec / 60)) : undefined,
    correct: total && r.answersRevealed ? r.answers.filter((a: Any) => a.isCorrect).length : undefined,
    total,
    answers: r?.answersRevealed ? answerList(r.answers, true).map(a => ({ ...a, text: a.text })) : [],
  };
}

// ---------- Skills (knowledge map) ----------
export function skillList(objectives: Any[], lang: Lang) {
  const byId = new Map(objectives.map((o: Any) => [o.id, o]));
  const title = (o: Any) => (isArabic(lang) && o?.translations?.ar?.title) || o?.title || o?.code || '';
  return objectives.map((o: Any) => {
    const weak = (o.weakPrerequisites || []).map((w: Any) => title(byId.get(w.id)) || w.code).filter(Boolean);
    return {
      id: o.id, courseId: o.courseId, title: title(o), level: levelOf(o.masteryStatus),
      group: o.isGap ? 'help' : o.readyToLearn && levelOf(o.masteryStatus) === 'not_assessed' ? 'next' : 'all',
      needsCheck: !!o.needsVerification, learnFirst: weak[0],
    };
  });
}
export function skillAnswers(mastery: Any, lang: Lang) {
  const T = tr(lang);
  const TYPE: Record<string, [string, string]> = {
    independent_assessment: ['Quiz', 'اختبار'], diagnostic: ['Quick check', 'تحقّق سريع'], retention_review: ['Review', 'مراجعة'],
    guided_practice: ['Practice', 'تدريب'], teacher_verified: ['Your teacher', 'معلّمك'],
  };
  return (mastery?.evidence || []).filter((e: Any) => !e.invalidatedAt && e.result !== 'inconclusive').slice(0, 8).map((e: Any) => ({
    date: e.occurredAt, right: e.result === 'correct', type: T(...(TYPE[e.evidenceType] || ['Answer', 'إجابة'])),
  }));
}
export function practicePlan(interventions: Any[]) {
  return interventions
    .filter((i: Any) => ['assigned', 'in_progress', 'completed'].includes(i.status) && !i.outcome)
    .map((i: Any) => ({
      id: i.id, objectiveId: i.objectiveId, courseId: i.courseId, title: i.objective?.title || i.objective?.code || '',
      from: i.assignedBy === 'teacher' ? 'teacher' : 'you',
      status: i.status === 'completed' ? 'practice_done' : i.status === 'in_progress' ? 'in_progress' : 'not_started',
    }));
}
export function firstRecommendation(recs: Any[], skills: { id: string; title: string; courseId?: string }[], lang: Lang) {
  const T = tr(lang);
  const r = (recs || []).find((x: Any) => x.type !== 'continue_intervention');
  if (!r) return null;
  const s = skills.find(k => k.id === r.objectiveId);
  const action: Record<string, [string, string]> = {
    practise: ['Practise', 'تدرّب'], review_prerequisite: ['Practise', 'تدرّب'], reassess: ['Quick check', 'تحقّق سريع'],
    review_due: ['Review now', 'راجع الآن'], learn_next: ['Go to my lessons', 'إلى دروسي'],
  };
  return { type: r.type, objectiveId: r.objectiveId, courseId: r.courseId || s?.courseId, title: s?.title || r.objectiveCode || '', text: r.explanation, action: T(...(action[r.type] || ['Practise', 'تدرّب'])) };
}

// ---------- Quick check (diagnostic) ----------
export function checkQuestion(view: Any) {
  const q = view?.currentQuestion;
  if (!q) return null;
  const opts: string[] = q.options && q.options.length ? q.options : ['True', 'False'];
  return { id: q.questionId, assessmentId: q.assessmentId, text: q.text, choices: opts.map(o => ({ id: o, text: o })) };
}
export function checkReport(report: Any, lang: Lang) {
  const T = tr(lang);
  const REASON: Record<string, [string, string]> = {
    enough_evidence: ['That was enough to see how you’re doing.', 'هذا يكفي لنعرف مستواك.'],
    max_questions: ['You reached the last question.', 'وصلت إلى آخر سؤال.'],
    max_duration: ['The time for the check ended.', 'انتهى وقت التحقّق.'],
    pool_exhausted: ['There were no more questions.', 'لم تعد هناك أسئلة.'],
    student_ended: ['You stopped the check. That’s OK!', 'أوقفت التحقّق، ولا بأس!'],
  };
  const title = (o: Any) => (isArabic(lang) && o?.translations?.ar?.title) || o?.title || o?.code;
  return {
    answered: report?.questionsAnswered ?? 0,
    reason: T(...(REASON[report?.stopReason] || REASON.enough_evidence)),
    results: (report?.objectives || []).map((o: Any) => ({
      id: o.objective?.id, title: title(o.objective), result: o.diagnostic?.result || 'inconclusive',
      right: o.diagnostic?.correct ?? 0, of: o.diagnostic?.answered ?? 0,
    })),
  };
}

// ---------- My plan (study plan) ----------
const SOURCE: Record<string, string> = { assignment: 'assignment', teacher: 'teacher', result: 'results', recommendation: 'suggested' };
export function planItems(plan: Any) {
  const items = (plan?.items || []).map((x: Any) => ({
    id: x.key, source: SOURCE[x.source] || 'suggested', title: x.title, due: x.dueAt, why: x.rationale,
    minutes: x.effortMinutes || 10, status: x.status, kind: x.kind, assignmentId: x.assignmentId,
  }));
  return { items, done: items.filter((x: Any) => x.status !== 'todo').map((x: Any) => x.id) };
}

// ---------- Tutor ----------
export function chatMessages(messages: Any[]) {
  return (messages || []).map((m: Any) => ({ from: m.role === 'user' || m.role === 'student' ? 'child' : 'tutor', text: m.text || '', ...(Array.isArray(m.meta?.pics) ? { pics: kidsPics(m.meta.pics) } : {}) }));
}
export function chatSessions(sessions: Any[]) {
  return (sessions || []).map((s: Any) => ({ id: s.id, title: s.title || s.lessonTitle || '…', date: s.lastMessageAt || s.timestamp, count: s.messageCount || 0, live: s.mode === 'live' }));
}

/** kidsAudioVisual: only well-formed picture choices from our own picture folder. */
export function kidsPics(pics: Any): { word: string; src: string }[] {
  return (Array.isArray(pics) ? pics : []).filter((c: Any) => c && typeof c.word === 'string' && typeof c.src === 'string' && /^\/kids\/pics\/[a-z0-9-]+\.svg$/.test(c.src)).slice(0, 4);
}
