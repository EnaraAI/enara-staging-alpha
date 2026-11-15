import { readFileSync, readdirSync } from 'fs';
import { taskInvitation } from '../../../../../../home/user/enara-staging-alpha/backend/src/services/languageTeachingContext';
const dir = '/home/user/enara-staging-alpha/research/deep-learning-simulation-v2/reports/exp4/agent_sim_esl1/sessions/';
const ASK = /[^.?!\n]*\b(tell me the rule in your own words|in your own words|write one new example of your own)[^.?!\n]*[.?!]?/gi;
const out: Record<string, { flagged: number; realTwo: number }> = {};
for (const f of readdirSync(dir)) { const s = JSON.parse(readFileSync(dir + f, 'utf8')); for (const t of s.turns) if (t.twoAsks) { const o = (out[s.arm] ??= { flagged: 0, realTwo: 0 }); o.flagged++; if (taskInvitation(String(t.tutor).replace(ASK, ' '))) o.realTwo++; } }
console.log(JSON.stringify(out));
