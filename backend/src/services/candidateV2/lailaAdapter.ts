import { readFileSync } from 'fs';
import { join } from 'path';
import type { Rubric } from './contract';
import type { RubricText } from './nativeGrader';

// LAILA -> Candidate V2 evaluation adapter. Builds the declared rubric and its wording
// bundle per prompt from the official rubric files. Reads no scores.
export const LAILA_TRAITS = ['relevance', 'organization', 'vocabulary', 'style', 'development', 'mechanics', 'grammar'] as const;
const TITLES: Record<string, string> = { relevance: 'الصلة بالموضوع', organization: 'التنظيم', vocabulary: 'المفردات', style: 'الأسلوب', development: 'تطوير الأفكار', mechanics: 'علامات الترقيم والإملاء', grammar: 'القواعد النحوية' };

export function parseLevels(text: string): { levelId: string; description: string }[] {
  const out: { levelId: string; description: string }[] = [];
  for (const raw of text.replace(/^﻿/, '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = /^الدرجة\s*(\d)\s*:\s*(.*)$/.exec(line);
    if (m) out.push({ levelId: m[1], description: m[2].trim() });
    else if (out.length) out[out.length - 1].description += ` ${line}`;
    else throw new Error('rubric text before first level');
  }
  return out;
}

export function lailaRubric(rubricDir: string, promptId: string): { rubric: Rubric; text: RubricText } {
  const id = `laila-prompt${promptId}`;
  const criteria = LAILA_TRAITS.map((t) => {
    const levels = parseLevels(readFileSync(join(rubricDir, t, `${t}_rubric_prompt${promptId}.txt`), 'utf8'));
    const max = t === 'relevance' ? 2 : 5;
    const ids = levels.map((l) => Number(l.levelId)).sort((a, b) => a - b).join(',');
    if (ids !== Array.from({ length: max + 1 }, (_, i) => i).join(',')) throw new Error(`${t} prompt ${promptId}: unexpected levels ${ids}`);
    return { t, max, levels };
  });
  return {
    rubric: { id, version: 1, criteria: criteria.map((c) => ({ id: c.t, maxPoints: c.max, levels: c.levels.map((l) => ({ id: l.levelId, points: Number(l.levelId) })) })) },
    text: { rubricId: id, rubricVersion: 1, criteria: criteria.map((c) => ({ criterionId: c.t, title: TITLES[c.t], description: `${TITLES[c.t]} (${c.t})`, levels: c.levels })) },
  };
}
