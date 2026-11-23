// Rules-first grading (docs/tutor/RULES_FIRST_GRADING_PLAN.md §4): what the code rules decide on the frozen bench, offline (no model).
// Per set: the share of criterion scores code decides, the share of answers that need no model call, and how often a code score
// equals the reference ("gold") score, overall and per rule. The bar for a rule: exact agreement >= 0.95 where it decides.
// Thresholds that were tuned on the bench (mechanics by spelling, rules/spelling.ts) were set on the odd-numbered items (the
// calibration half) and are checked on the even-numbered ones: byHalf shows the agreement on each half separately.
import { rubricFor } from '../rubrics/templates';
import { runRules } from '../grading-engine/rules';
import { loadSet, openItemOf, answerTextOf, type BenchDomain, type BenchLang } from './dataset';

export const RULES_SETS: { domain: BenchDomain; lang: BenchLang }[] = (['science', 'humanities', 'listening', 'language'] as const).flatMap((domain) => (['en', 'ar'] as const).map((lang) => ({ domain, lang })));

export interface RulesCoverageRow {
  set: string; answers: number; criteria: number; decided: number; noModel: number; agree: number;
  byRule: Record<string, { decided: number; agree: number }>;
  byHalf: { calibration: { decided: number; agree: number }; check: { decided: number; agree: number } };
  findings: Record<string, number>; // answers with a finding of each rule (spelling, capitalisation, colloquial …)
  misses: { answerId: string; criterion: string; code: number; gold: number; rule: string }[];
}

export function rulesCoverage(sets = RULES_SETS): RulesCoverageRow[] {
  return sets.map(({ domain, lang }) => {
    const set = loadSet(domain, lang);
    const byId = new Map(set.items.map((i) => [i.id, i]));
    const row: RulesCoverageRow = { set: `${domain}/${lang}`, answers: 0, criteria: 0, decided: 0, noModel: 0, agree: 0, byRule: {}, byHalf: { calibration: { decided: 0, agree: 0 }, check: { decided: 0, agree: 0 } }, findings: {}, misses: [] };
    for (const a of set.answers) {
      const it = byId.get(a.itemId)!;
      const crit = rubricFor(it.domain, it.type, it.language, { points: it.points, units: it.units })!.criteria.map((c) => ({ id: c.id, maxPoints: c.maxPoints }));
      const r = runRules(openItemOf(it), answerTextOf(a), crit, it.language);
      row.answers++; row.criteria += crit.length;
      if (r.allDecided) row.noModel++;
      for (const id of new Set(r.findings.map((f) => f.ruleId))) row.findings[id] = (row.findings[id] ?? 0) + 1;
      const half = halfOf(it.id);
      for (const [c, d] of Object.entries(r.decided)) {
        const ok = d.points === a.gold[c];
        row.decided++; if (ok) row.agree++;
        row.byHalf[half].decided++; if (ok) row.byHalf[half].agree++;
        const b = (row.byRule[d.ruleId] ??= { decided: 0, agree: 0 });
        b.decided++; if (ok) b.agree++;
        if (!ok) row.misses.push({ answerId: a.id, criterion: c, code: d.points, gold: a.gold[c], rule: d.ruleId });
      }
    }
    return row;
  });
}

/** Calibration half: items whose number is odd (language-en-01, -03 …); check half: even. */
export const halfOf = (itemId: string): 'calibration' | 'check' => (Number(/(\d+)$/.exec(itemId)?.[1] ?? 0) % 2 ? 'calibration' : 'check');

const r3 = (x: number) => Math.round(x * 1000) / 1000;
export const coverageLine = (r: RulesCoverageRow): string =>
  `${r.set}: code-decided ${r.decided}/${r.criteria} (${r3(r.decided / r.criteria)}), no model call ${r.noModel}/${r.answers} (${r3(r.noModel / r.answers)}), ` +
  `agreement ${r.decided ? r3(r.agree / r.decided) : '-'} [${Object.entries(r.byRule).map(([k, v]) => `${k} ${v.agree}/${v.decided}`).join(', ')}]` +
  ` halves: calibration ${r.byHalf.calibration.agree}/${r.byHalf.calibration.decided}, check ${r.byHalf.check.agree}/${r.byHalf.check.decided}` +
  (Object.keys(r.findings).length ? `; answers with findings: ${Object.entries(r.findings).map(([k, v]) => `${k} ${v}`).join(', ')}` : '');
