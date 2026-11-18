import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sendMock = vi.fn();
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({ emails: { send: sendMock } })),
}));

import fs from 'fs';
import path from 'path';
import { logger } from '../src/utils/logging';
import { resetEmailClientForTests, HOSTED_LOGO_URL, HOSTED_LOGO_WHITE_URL } from '../src/email/sendTemplate';
import { LMS_TEMPLATES_BUNDLE } from '../src/email/lms/lmsTemplatesBundle';
import { PARENT_TEMPLATES_BUNDLE } from '../src/email/parents/parentTemplatesBundle';
import { renderCodeTemplate, type CodeTemplate } from '../src/email/sendBundledTemplate';
import { sendLmsTemplate } from '../src/email/sendLmsTemplate';
import { sendParentTemplate } from '../src/email/sendParentTemplate';
import { TEMPLATE_REGISTRY } from '../src/email/templateRegistry';
import { buildLmsBundleSource, buildParentBundleSource, LMS_BUNDLE_PATH, PARENT_BUNDLE_PATH } from '../../scripts/email/bundle-lms-templates';

// The code-sent (not Resend-hosted) templates: email/lms and email/parents, one
// <alias>-<lang>.html + .json per language. Resend is mocked: nothing is sent.

const EMAIL_DIR = path.join(__dirname, '../src/email');
const LMS_DIR = path.join(EMAIL_DIR, 'lms');
const PARENTS_DIR = path.join(EMAIL_DIR, 'parents');
const TO = 'jane.doe@qa.enara.app'; // not a reserved domain

// Approved by the owner on 2026-11-18 (promoted from drafts/).
const LMS_PROMOTED = [
  'lms-activity-may-be-deleted', 'lms-adoption-weekly', 'lms-connection-active', 'lms-connection-check-failed',
  'lms-connection-pending', 'lms-connection-rejected', 'lms-connection-switched-off', 'lms-data-export-ready',
  'lms-deletion-completed', 'lms-deletion-received', 'lms-grade-changed-in-lms', 'lms-grade-sync-digest',
  'lms-invite-expired', 'lms-invite-expiring', 'lms-key-problem', 'lms-newer-attempt-waiting',
  'lms-roster-removals-skipped', 'lms-roster-sync-failed', 'lms-seats-hard-cap', 'lms-seats-over-limit',
  'lms-seats-warning', 'lms-students-not-started', 'lms-teacher-welcome',
];
const LMS_OPS = [
  'lms-ops-approval-needed', 'lms-ops-billing-flag', 'lms-ops-daily-digest', 'lms-ops-error-spike',
  'lms-ops-key-rotation-due', 'lms-ops-school-connected',
];
const PARENT_PROMOTED = ['parent-invite', 'parent-link-confirmed', 'parent-link-ended', 'parent-new-results', 'parent-weekly-summary'];

interface TemplateJson {
  subject: string;
  status?: string;
  approvedOn?: string;
  alias: string;
  language: 'en' | 'ar';
  group: string;
  variables: { key: string; fallback_value: string | null; sample: string }[];
  preview_variants?: { id: string; samples: Record<string, string> }[];
}

interface Entry { set: 'lms' | 'parents'; file: string; json: TemplateJson; bundled: CodeTemplate }

function entries(): Entry[] {
  const out: Entry[] = [];
  for (const [set, dir, bundle] of [['lms', LMS_DIR, LMS_TEMPLATES_BUNDLE], ['parents', PARENTS_DIR, PARENT_TEMPLATES_BUNDLE]] as const) {
    for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.html')).sort()) {
      const file = f.replace(/\.html$/, '');
      const json = JSON.parse(fs.readFileSync(path.join(dir, `${file}.json`), 'utf8')) as TemplateJson;
      out.push({ set, file, json, bundled: (bundle as Record<string, CodeTemplate>)[file] });
    }
  }
  return out;
}

/** Every sample set for a template: the main samples plus each preview variant. */
function sampleSets(json: TemplateJson): [string, Record<string, string>][] {
  const base = Object.fromEntries(json.variables.map((v) => [v.key, v.sample]));
  return [['samples', base], ...(json.preview_variants ?? []).map((p) => [p.id, { ...base, ...p.samples }] as [string, Record<string, string>])];
}

const ALL = entries();
const STUDENT_NAME_VARS = /CHILD_NAME|STUDENT_NAME|LEARNER/;
const ENR_CODE = /ENR[\s\-_.+]*[A-Z0-9]{4}[\s\-_.+]*[A-Z0-9]{4}/i;
const SECRET_PARAM = /[?&#;](?:[a-z_]*token|[a-z_]*code|[a-z_]*key|secret)=/i;

describe('code-sent email templates (email/lms, email/parents)', () => {
  it('each bundle matches its files byte-for-byte (re-run scripts/email/bundle-lms-templates.ts)', () => {
    expect(fs.readFileSync(LMS_BUNDLE_PATH, 'utf8')).toBe(buildLmsBundleSource());
    expect(fs.readFileSync(PARENT_BUNDLE_PATH, 'utf8')).toBe(buildParentBundleSource());
    for (const e of ALL) {
      const dir = e.set === 'lms' ? LMS_DIR : PARENTS_DIR;
      expect(e.bundled, e.file).toBeDefined();
      expect(e.bundled.html === fs.readFileSync(path.join(dir, `${e.file}.html`), 'utf8'), e.file).toBe(true);
      expect(e.bundled.subject, e.file).toBe(e.json.subject);
      expect([...e.bundled.variables], e.file).toEqual(e.json.variables.map((v) => v.key));
    }
    expect(Object.keys(LMS_TEMPLATES_BUNDLE).length + Object.keys(PARENT_TEMPLATES_BUNDLE).length).toBe(ALL.length);
  });

  it('every promoted template is live in each of its languages; ops templates are English only; all are approved', () => {
    const files = new Set(ALL.map((e) => `${e.set}/${e.file}`));
    for (const a of ['lms-invite-connect', ...LMS_PROMOTED]) for (const l of ['en', 'ar']) expect(files.has(`lms/${a}-${l}`), `${a}-${l}`).toBe(true);
    for (const a of PARENT_PROMOTED) for (const l of ['en', 'ar']) expect(files.has(`parents/${a}-${l}`), `${a}-${l}`).toBe(true);
    for (const a of LMS_OPS) {
      expect(files.has(`lms/${a}-en`), a).toBe(true);
      expect(fs.readdirSync(LMS_DIR).filter((f) => f.startsWith(`${a}-`) && !f.startsWith(`${a}-en.`)), a).toEqual([]);
    }
    expect(ALL.filter((e) => e.file.startsWith('lms-ops-') && e.json.language !== 'en')).toEqual([]);
    expect(ALL.length).toBe(2 + LMS_PROMOTED.length * 2 + LMS_OPS.length + PARENT_PROMOTED.length * 2);
    const promoted = new Set([...LMS_PROMOTED, ...LMS_OPS, ...PARENT_PROMOTED]);
    for (const e of ALL) {
      expect(`${e.json.alias}-${e.json.language}`, e.file).toBe(e.file);
      expect(e.json.status, e.file).toBe('approved');
      if (promoted.has(e.json.alias)) expect(e.json.approvedOn, e.file).toBe('2026-11-18');
    }
    // No drafts left behind, and none of these are Resend-hosted templates.
    expect(fs.existsSync(path.join(EMAIL_DIR, 'drafts'))).toBe(false);
    const hosted = fs.readdirSync(path.join(EMAIL_DIR, 'templates'));
    for (const e of ALL) {
      expect(Object.keys(TEMPLATE_REGISTRY)).not.toContain(e.file);
      expect(Object.keys(TEMPLATE_REGISTRY)).not.toContain(e.json.alias);
      expect(hosted.some((f) => f.startsWith(e.json.alias)), e.file).toBe(false);
    }
  });

  it('every declared variable is used and every placeholder is declared; both hosted logos are referenced', () => {
    for (const e of ALL) {
      const used = new Set([...`${e.bundled.html}${e.bundled.subject}`.matchAll(/\{\{\{?\s*([A-Za-z0-9_]+)\s*\}?\}\}/g)].map((m) => m[1]));
      expect([...used].sort(), e.file).toEqual([...e.bundled.variables].sort());
      expect(e.bundled.html, e.file).toContain(HOSTED_LOGO_URL);
      expect(e.bundled.html, e.file).toContain(HOSTED_LOGO_WHITE_URL);
    }
  });

  it('rendering with the sample values leaves no placeholder, and swaps the logos for inline cid images', () => {
    for (const e of ALL) {
      for (const [label, values] of sampleSets(e.json)) {
        const { subject, html } = renderCodeTemplate(e.bundled, values);
        expect(html.includes('{{'), `${e.file} ${label} html`).toBe(false);
        expect(subject.includes('{{'), `${e.file} ${label} subject`).toBe(false);
        expect(subject.trim().length, e.file).toBeGreaterThan(0);
        expect(html, e.file).toContain('cid:enara-logo');
        expect(html, e.file).not.toContain('https://assets.enara.app/');
      }
    }
  });

  it('Arabic files are <html lang="ar" dir="rtl">, English files are <html lang="en">', () => {
    for (const e of ALL) {
      if (e.json.language === 'ar') expect(e.bundled.html, e.file).toContain('<html lang="ar" dir="rtl">');
      else expect(e.bundled.html, e.file).toContain('<html lang="en">');
    }
  });

  it('LMS (non-parent) templates carry no student-name variable', () => {
    for (const e of ALL.filter((x) => x.set === 'lms')) {
      expect(STUDENT_NAME_VARS.test(e.bundled.html), e.file).toBe(false);
      expect(STUDENT_NAME_VARS.test(e.bundled.subject), e.file).toBe(false);
      expect(e.bundled.variables.filter((k) => STUDENT_NAME_VARS.test(k)), e.file).toEqual([]);
    }
  });

  it('no link carries a token / code / key query param or an ENR-XXXX-XXXX parent link code', () => {
    for (const e of ALL) {
      const hrefs = (html: string) => [...html.matchAll(/\b(?:href|src|action)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)].map((m) => m[1] ?? m[2] ?? '');
      // The source (before filling) and every rendered sample.
      const rendered = sampleSets(e.json).map(([, v]) => renderCodeTemplate(e.bundled, v).html);
      for (const html of [e.bundled.html, ...rendered]) {
        for (const href of hrefs(html)) {
          expect(SECRET_PARAM.test(href), `${e.file}: ${href}`).toBe(false);
          expect(ENR_CODE.test(href), `${e.file}: ${href}`).toBe(false);
        }
      }
    }
  });
});

describe('sendParentTemplate / sendLmsTemplate', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    sendMock.mockReset();
    sendMock.mockResolvedValue({ data: { id: 'em_1' }, error: null });
    resetEmailClientForTests();
    process.env.RESEND_API_KEY = 're_test_dummy';
    process.env.PARENT_EMAILS_ENABLED = 'true';
    errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    delete process.env.RESEND_API_KEY;
    delete process.env.PARENT_EMAILS_ENABLED;
    resetEmailClientForTests();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  const samples = (dir: string, file: string) =>
    Object.fromEntries((JSON.parse(fs.readFileSync(path.join(dir, `${file}.json`), 'utf8')) as TemplateJson).variables.map((v) => [v.key, v.sample]));

  it('sends a parent template as rendered html with both logos attached inline; the code is in the body only', async () => {
    const vars = samples(PARENTS_DIR, 'parent-invite-ar');
    const r = await sendParentTemplate('parent-invite-ar', TO, vars);
    expect(r).toEqual({ ok: true, id: 'em_1' });
    const sent = sendMock.mock.calls[0][0] as { to: string; subject: string; html: string; attachments: { contentId: string }[] };
    expect(sent.to).toBe(TO);
    expect(sent.subject).toContain(vars.CHILD_NAME);
    expect(sent.html).toContain(vars.LINK_CODE);
    expect(sent.html).toContain('cid:enara-logo');
    expect(sent.html).not.toMatch(/\{\{/);
    expect(sent.attachments.map((a) => a.contentId).sort()).toEqual(['enara-logo', 'enara-logo-white']);
  });

  it('parent emails are off unless PARENT_EMAILS_ENABLED=true (nothing sent)', async () => {
    for (const v of [undefined, '', 'false', 'no']) {
      if (v === undefined) delete process.env.PARENT_EMAILS_ENABLED;
      else process.env.PARENT_EMAILS_ENABLED = v;
      expect(await sendParentTemplate('parent-invite-en', TO, samples(PARENTS_DIR, 'parent-invite-en'))).toMatchObject({ ok: false, code: 'parent_emails_off' });
    }
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('sends a newly promoted LMS template', async () => {
    const r = await sendLmsTemplate('lms-teacher-welcome-en', TO, samples(LMS_DIR, 'lms-teacher-welcome-en'));
    expect(r.ok).toBe(true);
    expect((sendMock.mock.calls[0][0] as { subject: string }).subject).toBe('Your Moodle course is ready in Enara');
  });

  it('refuses reserved recipients, variable mismatches, a code in a link, and works without sending when the key is missing', async () => {
    const vars = samples(PARENTS_DIR, 'parent-invite-en');
    expect(await sendParentTemplate('parent-invite-en', 'parent@school.example', vars)).toMatchObject({ ok: false, code: 'reserved_recipient' });
    expect(await sendParentTemplate('parent-invite-en', TO, { ...vars, EXTRA: 'x' })).toMatchObject({ ok: false, code: 'invalid_variables' });
    const { LINK_CODE: _code, ...noCode } = vars;
    expect(await sendParentTemplate('parent-invite-en', TO, noCode)).toMatchObject({ ok: false, code: 'invalid_variables' });
    expect(await sendParentTemplate('parent-invite-en', TO, { ...vars, LINK_CODE: '' })).toMatchObject({ ok: false, code: 'unfilled_placeholder' });
    expect(await sendParentTemplate('parent-invite-en', TO, { ...vars, ACTION_URL: `https://enara.app/parents/link?c=${vars.LINK_CODE}` })).toMatchObject({ ok: false, code: 'code_in_url' });
    expect(await sendLmsTemplate('lms-teacher-welcome-en', TO, { ...samples(LMS_DIR, 'lms-teacher-welcome-en'), COURSE_NAME: '' })).toMatchObject({ ok: false, code: 'unfilled_placeholder' });
    expect(await sendParentTemplate('nope' as never, TO, vars)).toMatchObject({ ok: false, code: 'unknown_template' });
    delete process.env.RESEND_API_KEY;
    resetEmailClientForTests();
    expect(await sendParentTemplate('parent-invite-en', TO, vars)).toMatchObject({ ok: false, code: 'missing_api_key' });
    expect(sendMock).not.toHaveBeenCalled();
    // Logs carry the alias and code only, never the address.
    expect(JSON.stringify([...errorSpy.mock.calls, ...warnSpy.mock.calls])).not.toContain('@');
  });
});
