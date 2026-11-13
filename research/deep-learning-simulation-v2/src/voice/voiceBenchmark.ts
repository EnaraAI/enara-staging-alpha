// Paid voice-vs-chat benchmark: the same simulated learners, the same lessons, the real ENARA tutor, through (a) the text chat route and
// (b) the live-avatar route (text path; Anam stubbed, ElevenLabs off). Both channels use one shared language engine, so their teaching-quality
// metrics should match; any gap is a defect. Simulated learners only.
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { EnaraRuntime } from '../conditions/enaraRuntime';
import { Ledger, summarizeLedger } from '../ledger/ledger';
import { Provider, installFetchGuard, readKey, type CallCtx } from '../providers/guard';
import { loadBenchmark } from '../orchestrator/run';
import { makeStudent, studentPersona } from '../students/population';
import { wilson } from '../stats/stats';
import { norm } from '../benchmark/scoring';

interface Row { channel: string; outcome: string; student: string; turns: number; words: number; arabic: boolean; firstReplyShowsAnswerForm: boolean; hasLanguageTurn: boolean; guardRemovals: number; markerLeak: boolean; policy: string | null; }

export async function runVoiceBenchmark(opts: { outDir: string; capUsd: number; learners: number; turns: number; outcomeIds: string[] }) {
  mkdirSync(opts.outDir, { recursive: true });
  const key = readKey();
  const ledger = new Ledger(opts.outDir, 'voice-benchmark', opts.capUsd);
  const realFetch = globalThis.fetch;
  let cur: CallCtx = { campaign: 'voice-benchmark', studentId: null, blockId: null, role: 'tutor' };
  const restore = installFetchGuard(ledger, () => cur, null, { push() { /* no scanner here */ } });
  const provider = new Provider(ledger, key, null, realFetch);
  const rt = new EnaraRuntime();
  await rt.start(key, { voice: true });
  const bm = loadBenchmark();
  const rows: Row[] = [];
  try {
    for (const oid of opts.outcomeIds) {
      const o = bm.find((x) => x.id === oid)!;
      for (let i = 0; i < opts.learners; i += 1) {
        for (const channel of ['chat', 'voice'] as const) {
          const st = makeStudent(i, 'voice-benchmark');
          const mis = o.misconceptions[i % o.misconceptions.length];
          const persona = studentPersona(st, { cefr: o.cefr, area: o.area, heldMisconception: mis, knowsAlready: false });
          const blockId = `${channel}-${oid}-${st.id}`;
          cur = { campaign: 'voice-benchmark', studentId: st.id, blockId, role: 'tutor' };
          const cohort = o.cefr === 'A1' ? 'child' : o.cefr === 'A2' ? 'teen' : 'adult';
          const sess = channel === 'chat' ? await rt.openSession(o, cohort) : await rt.openVoiceSession(o, cohort);
          const turns: { learner: string; reply: string; meta: any }[] = [];
          for (let t = 0; t < opts.turns; t += 1) {
            const hist = turns.map((x) => `YOU: ${x.learner}\nTUTOR: ${x.reply}`).join('\n\n');
            const learner = (await provider.chat({ model: 'claude-haiku-5-5', system: persona, user: t === 0 ? 'Start the conversation: ask the tutor to help you practise this point.' : `${hist}\n\nWrite your next message to the tutor.`, maxTokens: 1500, effort: 'low' }, { ...cur, role: 'student_teach' })).text;
            const r = await sess.send(learner);
            turns.push({ learner, reply: r.reply, meta: r.meta });
          }
          const forms = o.lesson.spec.items.flatMap((x) => [...x.acceptedAnswers, ...(x.targetForms ?? [])]).map((x) => norm(x).trim()).filter((x) => x.length > 3);
          const first = norm(turns[0].reply);
          rows.push({
            channel, outcome: oid, student: st.id, turns: turns.length, words: turns.reduce((n, x) => n + x.reply.split(/\s+/).length, 0) / turns.length,
            arabic: turns.some((x) => /[؀-ۿ]/.test(x.reply)), firstReplyShowsAnswerForm: forms.some((f) => first.includes(f)),
            hasLanguageTurn: turns.every((x) => x.meta?.languageTurn), guardRemovals: turns.reduce((n, x) => n + (x.meta?.languageTurn?.preAttemptModelsRemoved ?? 0), 0),
            markerLeak: turns.some((x) => /\[\[assess/i.test(x.reply)), policy: turns[0].meta?.version ?? null,
          });
        }
      }
    }
  } finally { restore(); await rt.stop(); }
  const by = (c: string) => rows.filter((r) => r.channel === c);
  const rate = (rs: Row[], f: (r: Row) => boolean) => { const k = rs.filter(f).length; const w = wilson(k, rs.length); return `${(w.p * 100).toFixed(1)}% [${(w.lo * 100).toFixed(1)}, ${(w.hi * 100).toFixed(1)}] (${k}/${rs.length})`; };
  const mean = (rs: Row[], f: (r: Row) => number) => (rs.reduce((n, r) => n + f(r), 0) / Math.max(1, rs.length)).toFixed(1);
  const led = summarizeLedger(Ledger.read(ledger.file));
  const md = `# Voice vs chat benchmark (simulated learners; real ENARA tutor; Anam stubbed, no audio)

One shared language engine drives both channels. ${opts.learners} learners x ${opts.outcomeIds.length} outcomes x 2 channels, ${opts.turns} turns each. Cost $${led.totalUsd.toFixed(2)}; failed attempts ${led.failedAttempts}; unknown-cost attempts ${led.unknownCostAttempts}.

| Metric | chat | voice |
|---|---|---|
| sessions | ${by('chat').length} | ${by('voice').length} |
| words per reply (mean) | ${mean(by('chat'), (r) => r.words)} | ${mean(by('voice'), (r) => r.words)} |
| Arabic in any reply | ${rate(by('chat'), (r) => r.arabic)} | ${rate(by('voice'), (r) => r.arabic)} |
| first reply shows an answer form | ${rate(by('chat'), (r) => r.firstReplyShowsAnswerForm)} | ${rate(by('voice'), (r) => r.firstReplyShowsAnswerForm)} |
| hidden assessment marker visible | ${rate(by('chat'), (r) => r.markerLeak)} | ${rate(by('voice'), (r) => r.markerLeak)} |
| engine turn state stored on every turn | ${rate(by('chat'), (r) => r.hasLanguageTurn)} | ${rate(by('voice'), (r) => r.hasLanguageTurn)} |
| guard removals per session (mean) | ${mean(by('chat'), (r) => r.guardRemovals)} | ${mean(by('voice'), (r) => r.guardRemovals)} |
| policy version | ${[...new Set(by('chat').map((r) => r.policy))].join(',')} | ${[...new Set(by('voice').map((r) => r.policy))].join(',')} |
`;
  writeFileSync(path.join(opts.outDir, 'voice_vs_chat.md'), md);
  writeFileSync(path.join(opts.outDir, 'rows.json'), JSON.stringify(rows, null, 1));
  return { md, rows, cost: led.totalUsd };
}
