// Assessment engine P4 pipeline (docs/tutor/ASSESSMENT_ENGINE_PLAN.md §6): generator → code checks → judge → one regeneration with the
// reasons → the item bank ('judged', waiting for a teacher) or refused. Bounded for one request (≤5 items, regeneration only while time
// remains). Shared by the teacher's "Generate" button and the generation bench.
import { randomUUID } from 'crypto';
import { BankItem } from '../../models/BankItem';
import { checkGenerated, type GenItem } from './checks';
import { generateItems, type GenRequest } from './generator';
import { judgeItem, type JudgeReport } from './judge';

export interface GenOutcome { item: GenItem; problems: string[]; judge: JudgeReport | null; regenerated: boolean; stored?: { id: string; version: number } }

async function recentStems(schoolId: string | null, objective: string): Promise<string[]> {
  const since = new Date(Date.now() - 90 * 86_400_000);
  const rows = await BankItem.find({ objective_code: objective, created_at: { $gte: since }, $or: [{ school_id: schoolId }, { school_id: null }] }).select('stem').limit(300).lean();
  return rows.map((r) => r.stem);
}

async function checkAndJudge(item: GenItem, recent: string[], ctx: { institutionId?: string; objectiveTitle?: string; kids?: boolean }) {
  const problems = checkGenerated(item, { recentStems: recent, kids: ctx.kids });
  if (problems.length) return { problems, judge: null };
  const judge = await judgeItem(item, ctx).catch(() => null);
  return { problems: judge ? (judge.pass ? [] : [`judge: ${judge.feedback || 'below the bar'}`]) : ['judge: not available'], judge };
}

export async function runGeneration(req: GenRequest, ctx: { institutionId?: string; teacherId: string; schoolId: string | null; store?: boolean; deadlineMs?: number }): Promise<GenOutcome[]> {
  const t0 = Date.now();
  const deadline = ctx.deadlineMs ?? 40_000;
  const recent = ctx.store === false ? [] : await recentStems(ctx.schoolId, req.objective_code);
  const items = await generateItems(req, { institutionId: ctx.institutionId });
  const seen = [...recent];
  const outcomes = await Promise.all(items.map(async (item): Promise<GenOutcome> => {
    let r = await checkAndJudge(item, seen, { institutionId: ctx.institutionId, objectiveTitle: req.objective_title, kids: req.kids });
    let current = item; let regenerated = false;
    if (r.problems.length && Date.now() - t0 < deadline * 0.5) {
      // One regeneration of this item with the reasons (code checks or the judge's feedback).
      const again = await generateItems({ ...req, types: [item.type], count: 1, feedback: r.problems.join('; ') }, { institutionId: ctx.institutionId }).catch(() => []);
      if (again[0]) { current = again[0]; regenerated = true; r = await checkAndJudge(current, seen, { institutionId: ctx.institutionId, objectiveTitle: req.objective_title, kids: req.kids }); }
    }
    return { item: current, problems: r.problems, judge: r.judge, regenerated };
  }));
  if (ctx.store === false) return outcomes;
  for (const o of outcomes) {
    if (o.problems.length) continue;
    if (seen.some((s) => s === o.item.stem)) { o.problems.push('it nearly repeats another item in this batch'); continue; }
    seen.push(o.item.stem);
    const id = `bi-${randomUUID()}`;
    await BankItem.create({
      id, version: 1, subject: req.domain, language: req.language, curriculum: 'custom', level: req.level, objective_code: req.objective_code,
      type: o.item.type, difficulty: o.item.difficulty, stem: o.item.stem, options: o.item.options ?? null, answer_key: o.item.answer_key,
      flags: { ...(o.item.flags ?? {}), ...(req.kids ? { kids: true } : {}) }, source: 'generated', review_status: 'judged', judge_report: o.judge,
      created_by: ctx.teacherId, school_id: ctx.schoolId, passage: o.item.source ?? null,
    });
    o.stored = { id, version: 1 };
  }
  return outcomes;
}
