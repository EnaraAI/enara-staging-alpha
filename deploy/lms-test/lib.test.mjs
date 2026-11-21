// node --test deploy/lms-test/lib.test.mjs deploy/lms-test/cli.test.mjs  (no dependencies, no network)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  COMMENT_FOOTER, PROJECT_ID, PROJECT_NAME, TEAM_ID, assertSiteUrl, cleanReason, commentBody, deploymentProblems, healthFailure,
  manifestFlags, planFlags, projectProblems, resultLine,
} from './lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const manifest = () => JSON.parse(readFileSync(join(HERE, '..', 'lms-test.flags.json'), 'utf8'));
const project = { id: PROJECT_ID, name: PROJECT_NAME, accountId: TEAM_ID };

test('site calls: only https://lms-test.enara.app; test.enara.app is refused', () => {
  assert.equal(assertSiteUrl('https://lms-test.enara.app/ready'), 'https://lms-test.enara.app/ready');
  for (const bad of ['https://test.enara.app/ready', 'https://www.test.enara.app/', 'http://lms-test.enara.app/ready', 'https://lms-test.enara.app.evil.com/', 'https://enara.app/']) {
    assert.throws(() => assertSiteUrl(bad), /refusing/);
  }
});

test('project guard: exactly enara-lms-test with lms-test.enara.app; any sign of test.enara.app stops everything', () => {
  assert.deepEqual(projectProblems(project, ['lms-test.enara.app', 'enara-lms-test.vercel.app']), []);
  assert.match(projectProblems(project, ['lms-test.enara.app', 'test.enara.app']).join(), /frozen domain test\.enara\.app/);
  assert.match(projectProblems({ ...project, name: 'enara-staging' }, ['lms-test.enara.app']).join(), /expected enara-lms-test/);
  assert.match(projectProblems({ ...project, id: 'prj_other' }, ['lms-test.enara.app']).join(), /project id/);
  assert.match(projectProblems(project, ['enara-lms-test.vercel.app']).join(), /does not have the domain lms-test\.enara\.app/);
  assert.match(projectProblems(project, ['lms-test.enara.app', 'app.enara.app']).join(), /unexpected domains: app\.enara\.app/);
  assert.match(projectProblems({ ...project, accountId: 'team_other' }, ['lms-test.enara.app']).join(), /another team/);
  assert.notEqual(projectProblems(null, []).length, 0);
});

test('deployment guard: this project, production, never aliased to test.enara.app', () => {
  const dep = { projectId: PROJECT_ID, target: 'production', url: 'enara-lms-test-abc.vercel.app', alias: ['lms-test.enara.app'] };
  assert.deepEqual(deploymentProblems(dep), []);
  assert.match(deploymentProblems({ ...dep, projectId: 'prj_x' }).join(), /another project/);
  assert.match(deploymentProblems({ ...dep, target: null }).join(), /expected production/);
  assert.match(deploymentProblems({ ...dep, alias: ['lms-test.enara.app', 'test.enara.app'] }).join(), /frozen/);
});

test('the flags manifest accepts PARENT_* switches (Parents P1) and still refuses secret-looking names', () => {
  const m = manifest();
  const flags = manifestFlags({ ...m, features: [{ name: 'p', flags: { PARENT_SETTINGS_ENABLED: 'true', PARENT_CODE_SIGNUP_ENABLED: 'true' } }] });
  assert.deepEqual(flags, { PARENT_SETTINGS_ENABLED: 'true', PARENT_CODE_SIGNUP_ENABLED: 'true' });
  for (const bad of ['PARENT_TOKEN_SECRET', 'PARENT_GOOGLE_CLIENT_SECRET', 'PARENT_API_KEY', 'PARENT_PASSWORD', 'PARENT_INVITE_URL', 'PARENT_', 'PARENTS_ENABLED', 'parent_settings_enabled']) {
    assert.throws(() => manifestFlags({ ...m, features: [{ name: 'x', flags: { [bad]: 'true' } }] }), /not a feature switch/, bad);
  }
  assert.throws(() => manifestFlags({ ...m, features: [{ name: 'x', flags: { PARENT_SETTINGS_ENABLED: 'a@b.c' } }] }), /short plain string/);
  // The real manifest: the Parents switches are on for lms-test (parent emails since P4, through the safety path).
  const real = manifestFlags(m);
  assert.equal(real.PARENT_SETTINGS_ENABLED, 'true');
  assert.equal(real.PARENT_CODE_SIGNUP_ENABLED, 'true');
  assert.equal(real.PARENT_EMAILS_ENABLED, 'true');
});

test('ENARA_ENGINE_V2 may be a longer comma list of switch names, but nothing else', () => {
  const m = (v) => ({ project: { name: 'enara-lms-test', id: 'prj_tuRpwEJLz1dEQOj6RSEk2xUpqtIn', target: 'production' }, features: [{ name: 'x', flags: { ENARA_ENGINE_V2: v } }] });
  assert.equal(manifestFlags(m('a'.repeat(30) + ',b'.repeat(30))).ENARA_ENGINE_V2.length, 90);
  assert.ok(manifestFlags(m(Array.from({ length: 30 }, (_, i) => `switchName${i}`).join(','))).ENARA_ENGINE_V2.length > 200);
  assert.throws(() => manifestFlags(m('a, b')), /short plain string/);
  assert.throws(() => manifestFlags(m('a:b')), /short plain string/);
  assert.ok(manifestFlags(m('x'.repeat(401))).ENARA_ENGINE_V2.length === 401); // raised to 1000 (21 Nov: the tutor switch list passed 400)
  assert.throws(() => manifestFlags(m('x'.repeat(1001))), /short plain string/);
  assert.throws(() => manifestFlags({ ...m('a'), features: [{ name: 'y', flags: { LMS_X_ENABLED: 'a'.repeat(201) } }] }), /short plain string/);
});

test('the flags manifest accepts exactly ENARA_ENGINE_V2 (tutor engine, comma list) and no other ENARA_* name', () => {
  const m = manifest();
  const list = 'wrongAnswer,closing,selfCheck,clarity,hints,strandLog,levelExplicit,esl5,graderV2,planner2';
  assert.deepEqual(manifestFlags({ ...m, features: [{ name: 't', flags: { ENARA_ENGINE_V2: list } }] }), { ENARA_ENGINE_V2: list });
  for (const bad of ['ENARA_SECRET', 'ENARA_API_KEY', 'ENARA_ENGINE_V2_TOKEN', 'ENARA_ENGINE_V3', 'ENARA_EC_CHECK', 'ENARA_JWT_SECRET', 'ENARA_DB_URI', 'enara_engine_v2', 'ENARA_']) {
    assert.throws(() => manifestFlags({ ...m, features: [{ name: 'x', flags: { [bad]: 'true' } }] }), /not a feature switch/, bad);
  }
  assert.throws(() => manifestFlags({ ...m, features: [{ name: 'x', flags: { ENARA_ENGINE_V2: 'planner2; rm -rf /' } }] }), /short plain string/);
  assert.throws(() => manifestFlags({ ...m, features: [{ name: 'x', flags: { ENARA_ENGINE_V2: 'a b' } }] }), /short plain string/);
  // The real manifest: ESL5 setting + planner2c on lms-test; the kids pack stays off.
  // Owner decision (20 Nov): without graderV2, so LMS assignment auto-grading on lms-test stays as it is; learner memory phases 1-4 (workOn, sessionMemory, learnerProfile, whatWorks) on lms-test only.
  // Owner "You build it" (20 Nov): errors from Moodle quizzes (moodleQuiz); a school must still save a read-only token and switch it on.
  const real = manifestFlags(m).ENARA_ENGINE_V2;
  // Owner "go" for LIT_REVIEW_GAP_PLAN (20 Nov): workOnTrusted,oneTaskMethod on after its PR passed E2E.
  // Owner "go" for LIT_REVIEW_GAP_PLAN (20 Nov): spacedReview on after its PR passed E2E.
  // Owner "go" for LIT_REVIEW_GAP_PLAN (20 Nov): ruleOnWrong on after its PR passed E2E.
  // Owner "go" for LIT_REVIEW_GAP_PLAN (20 Nov): switchMove,spellingPattern,l1Lexical,childShort,reviewFirst,childRule,adaptiveSpacing,mixedReview,realChat,kidsAudioVisual,avatarSpeaking,kidsSpeaking,modelFallback,gradeAllSubjects,ragRewrite,ragReuse,groundedRefusal,topicMemory,methodFromEvidence,repairOnce,injectionCheck on after its PR passed E2E.
  assert.equal(real, 'wrongAnswer,closing,selfCheck,clarity,hints,strandLog,levelExplicit,esl5,planner2,workOn,sessionMemory,learnerProfile,whatWorks,moodleQuiz,workOnTrusted,oneTaskMethod,spacedReview,ruleOnWrong,switchMove,spellingPattern,l1Lexical,childShort,reviewFirst,childRule,adaptiveSpacing,mixedReview,realChat,kidsAudioVisual,avatarSpeaking,kidsSpeaking,modelFallback,gradeAllSubjects,ragRewrite,ragReuse,groundedRefusal,topicMemory,methodFromEvidence,repairOnce,injectionCheck');
  for (const off of ['kidsPack', 'all', 'graderV2']) assert.ok(!real.split(',').includes(off), off);
});

test('the flags manifest: the current lms-test set, switches only', () => {
  const flags = manifestFlags(manifest());
  for (const k of ['LMS_LTI_ENABLED', 'LMS_GRADE_PASSBACK_ENABLED', 'LMS_ROSTER_SYNC_ENABLED', 'LMS_DEEP_LINKING_ENABLED', 'GRADE_LEDGER_ENABLED', 'MAINTENANCE_ENDPOINTS_ENABLED']) assert.equal(flags[k], 'true', k);
  // Every switch is 'true' except the tutor engine's comma list (ENARA_ENGINE_V2).
  assert.ok(Object.entries(flags).every(([k, v]) => k === 'ENARA_ENGINE_V2' || k.startsWith('TUTOR_LLM_') || v === 'true'));
  const m = manifest();
  for (const bad of ['LMS_KEK', 'MAINTENANCE_TOKEN', 'MAINTENANCE_CI_TOKEN', 'LMS_TOOL_BASE_URL', 'MONGODB_URI', 'JWT_SECRET', 'VERCEL_TOKEN', 'MOODLE_TEST_WS_TOKEN', 'lms_lti_enabled']) {
    assert.throws(() => manifestFlags({ ...m, features: [{ name: 'x', flags: { [bad]: 'true' } }] }), /not a feature switch/, bad);
  }
  assert.throws(() => manifestFlags({ ...m, features: [{ name: 'x', flags: { LMS_X_ENABLED: 'true; rm -rf /' } }] }), /short plain string/);
  assert.throws(() => manifestFlags({ ...m, features: [{ name: 'a', flags: { LMS_X_ENABLED: 'true' } }, { name: 'b', flags: { LMS_X_ENABLED: 'false' } }] }), /"a" wants true, "b" wants false/);
  assert.throws(() => manifestFlags({ ...m, project: { ...m.project, id: 'prj_other' } }), /not for enara-lms-test/);
  assert.throws(() => manifestFlags({ ...m, project: { ...m.project, target: 'preview' } }), /production/);
});

test('flag plan: Production only; creates, updates, leaves equal ones; never touches Sensitive; never removes', () => {
  const flags = { LMS_A_ENABLED: 'true', LMS_B_ENABLED: 'true', LMS_C_ENABLED: 'true', LMS_D_ENABLED: 'true', LMS_E_ENABLED: 'true' };
  const envs = [
    { id: 'e1', key: 'LMS_A_ENABLED', type: 'plain', target: ['production'], value: 'true' },
    { id: 'e2', key: 'LMS_B_ENABLED', type: 'plain', target: ['production', 'preview'], value: 'false' },
    { id: 'e3', key: 'LMS_C_ENABLED', type: 'sensitive', target: ['production'] },
    { id: 'e4', key: 'LMS_D_ENABLED', type: 'plain', target: ['preview'], value: 'true' },
    { id: 'e5', key: 'OTHER_VAR', type: 'plain', target: ['production'], value: 'x' },
    { id: 'e6', key: 'LMS_E_ENABLED', type: 'encrypted', target: ['production'] },
  ];
  const plan = Object.fromEntries(planFlags(flags, envs).map((p) => [p.key, p]));
  assert.equal(plan.LMS_A_ENABLED.action, 'unchanged');
  assert.deepEqual([plan.LMS_B_ENABLED.action, plan.LMS_B_ENABLED.envId, plan.LMS_B_ENABLED.sharedWith], ['update', 'e2', ['preview']]);
  assert.equal(plan.LMS_C_ENABLED.action, 'skip_sensitive');
  assert.equal(plan.LMS_D_ENABLED.action, 'create'); // a preview-only entry is not Production
  assert.equal(plan.LMS_E_ENABLED.action, 'skip_unreadable');
  assert.equal(Object.keys(plan).length, 5); // nothing about OTHER_VAR: never removed, never touched
});

test('result line and PR comment', () => {
  assert.equal(resultLine({ title: 'LMS phase 5: rubrics', outcome: 'passed' }), 'LMS phase 5: rubrics: deployed to lms-test — passed');
  assert.equal(resultLine({ title: 'X', outcome: 'rolled_back', reason: 'health check failed at grade_received (no_score_at_mock)' }), 'X: deployed to lms-test — rolled back (health check failed at grade_received (no_score_at_mock))');
  assert.match(resultLine({ title: 'X', outcome: 'not_deployed', reason: 'merge failed' }), /^X: not deployed to lms-test \(merge failed\)$/);
  assert.match(resultLine({ title: 'X', outcome: 'rollback_failed', reason: 'r' }), /automatic rollback failed/);
  assert.doesNotMatch(resultLine({ title: 'a\nb', outcome: 'passed' }), /\n/);
  assert.equal(cleanReason(`Bearer ${'t'.repeat(40)} and ${'a1'.repeat(20)}`), 'Bearer *** and ***');
  const body = commentBody({ line: 'L', details: ['d1'] });
  assert.ok(body.endsWith('\n\n---\n_Generated by [Claude Code](https://claude.ai/code)_'));
  assert.ok(body.endsWith(COMMENT_FOOTER));
  assert.equal(healthFailure({ ok: false, steps: [{ name: 'ready', ok: true }, { name: 'lti_launch', ok: false, code: 'http_401_invalid_signature' }] }), 'health check failed at lti_launch (http_401_invalid_signature)');
  assert.equal(healthFailure({ ok: true, steps: [] }), null);
  assert.equal(healthFailure(null), 'health check gave no answer');
});

test('tutor provider switch: exact names and values only; the API key can never be set from the manifest', () => {
  const m = (flags) => ({ project: { name: 'enara-lms-test', id: 'prj_tuRpwEJLz1dEQOj6RSEk2xUpqtIn', target: 'production' }, features: [{ name: 'x', flags }] });
  const ok = { TUTOR_LLM_PROVIDER: 'deepseek', TUTOR_LLM_MODEL: 'deepseek-ai/DeepSeek-V4.1-Flash', TUTOR_LLM_ENDPOINT: 'https://enaraai--ep-deepseek-v4-1-flash-1017-server.us-west.modal.direct/v1', TUTOR_LLM_PRICE_IN: '0.07', TUTOR_LLM_PRICE_OUT: '0.28' };
  assert.deepEqual(manifestFlags(m(ok)), ok);
  assert.throws(() => manifestFlags(m({ TUTOR_LLM_PROVIDER: 'openai' })), /short plain string/);
  assert.throws(() => manifestFlags(m({ TUTOR_LLM_ENDPOINT: 'https://evil.example.com/v1' })), /short plain string/);
  assert.throws(() => manifestFlags(m({ TUTOR_LLM_API_KEY: 'x' })), /not a feature switch/);
});
