// Code questions (owner's choice 23 Nov 2026): graded by the teacher's tests in the sandbox (sandbox.ts), never by a model. One point per
// passed test (the question's rubric has one 0-1 criterion per test). Feedback names the tests that failed and why, in the learner's
// screen language; it never shows the test calls or expected values (they are the answer key).
import { runTests, type CodeTest, type TestResult } from './sandbox';

export interface CodeGrade {
  points: number; maxPoints: number; criterionScores: { criterionId: string; levelId: string; points: number }[];
  criteria: { code: string; points: number; max: number; reasonCode: string }[]; results: TestResult[]; feedback: string; scoreExplanation: string;
  flagged: boolean; flagReasons: string[]; errorCodes: string[];
}

export async function gradeCode(p: { code: string; tests: CodeTest[]; uiLanguage: 'ar' | 'en' }): Promise<CodeGrade> {
  const results = await runTests(p.code, p.tests);
  const ar = p.uiLanguage === 'ar';
  const passed = results.filter((r) => r.passed).length;
  const sandboxError = results.some((r) => r.error?.startsWith('sandbox error'));
  const failed = results.map((r, i) => ({ r, i })).filter(({ r }) => !r.passed);
  const why = (r: TestResult) => (r.error ? (ar ? `خطأ: ${r.error}` : `error: ${r.error}`) : ar ? 'النتيجة غير صحيحة' : 'wrong result');
  const feedback = !failed.length
    ? ar ? `ممتاز: نجحت كل الاختبارات (${passed} من ${results.length}).` : `Well done: all ${results.length} tests pass.`
    : (ar ? `نجح ${passed} من ${results.length} اختبارات. راجع: ` : `${passed} of ${results.length} tests pass. Check: `) + failed.map(({ r, i }) => `${ar ? 'اختبار' : 'test'} ${i + 1} (${why(r)})`).join('; ') + '.';
  return {
    points: passed, maxPoints: results.length,
    criterionScores: results.map((r, i) => ({ criterionId: `test_${i + 1}`, levelId: r.passed ? 'p1' : 'p0', points: r.passed ? 1 : 0 })),
    criteria: results.map((r, i) => ({ code: `test_${i + 1}`, points: r.passed ? 1 : 0, max: 1, reasonCode: r.passed ? 'correct' : r.error ? (r.error.includes('time limit') ? 'timeout' : 'runtime_error') : 'wrong' })),
    results, feedback, scoreExplanation: feedback,
    // An internal sandbox failure (not the learner's code) goes to the teacher; nothing is invented.
    flagged: sandboxError, flagReasons: sandboxError ? ['model_error'] : [],
    errorCodes: failed.length ? ['tests_failed'] : [],
  };
}
