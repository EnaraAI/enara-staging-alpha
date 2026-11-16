import { Rng, sha256 } from '../util/rng';
import { AREAS, type Area } from '../benchmark/schema';
/** Seeded, stratified hold-out draw (Experiment 4). `excluded` outcomes (those whose transcripts were read while designing the improvements) can never be hold-out. */
export function drawHoldout(opts: { seed: string; outcomesByArea: Record<Area, string[]>; excluded: string[]; perArea: Record<Area, number> }) {
  const holdout: string[] = []; const development: string[] = [];
  for (const a of AREAS) {
    const eligible = opts.outcomesByArea[a].filter((o) => !opts.excluded.includes(o)).sort();
    const pick = Rng.of(opts.seed, 'holdout', a).shuffle(eligible).slice(0, opts.perArea[a]).sort();
    holdout.push(...pick); development.push(...opts.outcomesByArea[a].filter((o) => !pick.includes(o)));
  }
  holdout.sort(); development.sort();
  return { seed: opts.seed, excluded: opts.excluded, holdout, development, sha256: sha256(JSON.stringify({ holdout, development })) };
}
