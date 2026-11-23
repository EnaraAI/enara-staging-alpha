// Assessment engine code grader (docs/tutor/ASSESSMENT_ENGINE_PLAN.md §3 "Code"; owner's choice 23 Nov 2026: a sandbox inside lms-test).
// The learner's JavaScript runs in QuickJS compiled to WebAssembly, inside our own server:
//   - no host access: no require, process, files, network, timers (the WASM build exposes none of them to the learner's code);
//   - limits: 16 MB heap, 256 KB stack, 500 ms per test and 2 s per answer (interrupt handler), code ≤ 20 000 characters;
//   - a fresh WASM module per answer: a crash (e.g. a stack overflow that leaves the engine unsafe to free) breaks only that module,
//     which is then dropped, never reused; the server process is untouched.
// Each test is an expression called after the learner's code (e.g. "add(2, 3)"); its JSON value is compared with the expected value.
export interface CodeTest { name: string; call: string; expected: unknown }
export interface TestResult { name: string; passed: boolean; got?: string; error?: string }

export const LIMITS = { maxCodeChars: 20_000, msPerTest: 500, msPerAnswer: 2_000, heapBytes: 16 * 1024 * 1024, stackBytes: 256 * 1024 } as const;

/** Canonical JSON (object keys sorted), so {a:1,b:2} equals {b:2,a:1}. */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(v) ?? 'undefined';
}

export async function runTests(code: string, tests: CodeTest[]): Promise<TestResult[]> {
  if (code.length > LIMITS.maxCodeChars) return tests.map((t) => ({ name: t.name, passed: false, error: 'the code is too long' }));
  const { newQuickJSWASMModuleFromVariant } = await import('quickjs-emscripten-core');
  const variant = (await import('@jitl/quickjs-singlefile-cjs-release-sync')).default;
  const out: TestResult[] = [];
  let broken = false;
  try {
    const QJS = await newQuickJSWASMModuleFromVariant(variant as never);
    const rt = QJS.newRuntime();
    rt.setMemoryLimit(LIMITS.heapBytes);
    rt.setMaxStackSize(LIMITS.stackBytes);
    const answerDeadline = Date.now() + LIMITS.msPerAnswer;
    let testDeadline = Date.now() + LIMITS.msPerTest;
    rt.setInterruptHandler(() => Date.now() > Math.min(testDeadline, answerDeadline));
    const vm = rt.newContext();
    const msg = (h: unknown) => { const d = vm.dump(h as never) as { message?: string } | string; return String(typeof d === 'object' && d ? d.message ?? 'error' : d).slice(0, 200); };
    const def = vm.evalCode(code, 'answer.js');
    if (def.error) {
      const m = msg(def.error);
      broken = true;
      return tests.map((t) => ({ name: t.name, passed: false, error: m === 'interrupted' ? 'the code took too long to load' : `the code does not run: ${m}` }));
    }
    def.value.dispose();
    for (const t of tests) {
      testDeadline = Date.now() + LIMITS.msPerTest;
      const r = vm.evalCode(`JSON.stringify((${t.call}))`, 'test.js');
      if (r.error) { const m = msg(r.error); broken = true; out.push({ name: t.name, passed: false, error: m === 'interrupted' ? 'too slow (time limit)' : m }); continue; }
      const got = vm.getString(r.value); r.value.dispose();
      let passed = false;
      try { passed = canonical(got === undefined ? undefined : JSON.parse(got)) === canonical(t.expected); } catch { passed = false; }
      out.push({ name: t.name, passed, got: String(got).slice(0, 200) });
    }
    // Free only a clean runtime; after an error the whole module is dropped instead (QuickJS may assert while freeing it).
    if (!broken) { vm.dispose(); rt.dispose(); }
  } catch (e) {
    return tests.map((t, i) => out[i] ?? { name: t.name, passed: false, error: `sandbox error: ${String((e as Error).message).slice(0, 80)}` });
  }
  return out;
}
