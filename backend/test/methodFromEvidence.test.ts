import { afterEach, describe, expect, it } from 'vitest';
import { bestMethod, methodFromEvidenceOn } from '../src/services/learnerMemory';
import { planWithTrace, type PlanInput } from '../src/services/pedagogyPolicy';

// methodFromEvidence (owner go 21 Nov 2026, ARCH_ADOPTION_PLAN G): the planner may prefer the method this learner clearly succeeded after.
afterEach(() => { delete process.env.ENARA_ENGINE_V2; });
const stat = (method: string, sessions: number, ok: number) => ({ method, sessions, withIndependentSuccess: ok, rate: ok / sessions });
const base: PlanInput = { objectiveId: 'o1', masteryStatus: 'developing', evidenceStrength: 'moderate', weakPrerequisiteIds: [], misconceptions: [], supportingEvidenceIds: [], recentResults: [], triedWithoutImprovement: [] };

describe('methodFromEvidence', () => {
  it('named-only switch, off by default', () => {
    expect(methodFromEvidenceOn()).toBe(false);
    process.env.ENARA_ENGINE_V2 = 'all';
    expect(methodFromEvidenceOn()).toBe(false);
  });

  it('best method: at least 3 sessions and 15 points above the learner overall rate; thin or flat evidence gives none', () => {
    expect(bestMethod([stat('worked_example', 4, 3), stat('scaffolding', 6, 1)])).toBe('worked_example');
    expect(bestMethod([stat('worked_example', 2, 2), stat('scaffolding', 6, 1)])).toBeUndefined();
    expect(bestMethod([stat('worked_example', 4, 2), stat('scaffolding', 4, 2)])).toBeUndefined();
    expect(bestMethod([])).toBeUndefined();
  });

  it('the planner uses it only with the switch on, and never over a teacher choice, a prerequisite gap or a diagnosed error', () => {
    const ev = { ...base, evidenceMethod: 'worked_example' };
    expect(planWithTrace(ev).plan.primary).toBe('scaffolding'); // off: by mastery
    process.env.ENARA_ENGINE_V2 = 'methodFromEvidence';
    const t = planWithTrace(ev);
    expect(t.plan.primary).toBe('worked_example');
    expect(t.plan.reasonCodes).toContain('WHAT_WORKED_FOR_LEARNER');
    expect(planWithTrace({ ...ev, weakPrerequisiteIds: ['p1'] }).plan.primary).toBe('prerequisite_remediation');
    expect(planWithTrace({ ...ev, misconceptions: [{ id: 'm', category: 'misinterpretation' }] }).plan.primary).toBe('error_analysis');
    expect(planWithTrace({ ...ev, triedWithoutImprovement: ['worked_example'] }).plan.primary).not.toBe('worked_example');
  });
});
