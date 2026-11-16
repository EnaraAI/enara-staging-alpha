/** Pull every registered template from Resend into backend/src/email/templates/. Usage: npx tsx scripts/email/pull-templates.ts */
import fs from 'node:fs';
import path from 'node:path';
import { TEMPLATE_ALIASES, TEMPLATE_REGISTRY } from '../../backend/src/email/templateRegistry';
import { TEMPLATES_DIR, requireApiKey, resendRequest, type TemplateMeta } from './common';

async function main(): Promise<void> {
  const key = requireApiKey();
  fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
  let failures = 0;
  for (const alias of TEMPLATE_ALIASES) {
    const { id, variables: expected } = TEMPLATE_REGISTRY[alias];
    try {
      const t = await resendRequest(key, 'GET', `/templates/${id}`);
      const html = typeof t?.html === 'string' ? t.html : '';
      if (!html) console.warn(`[${alias}] warning: no html in response`);
      const vars: TemplateMeta['variables'] = Array.isArray(t?.variables)
        ? t.variables.map((v: any) => ({ key: String(v?.key), type: v?.type === 'number' ? 'number' : 'string', fallback_value: v?.fallback_value ?? null }))
        : [];
      const missing = expected.filter((k) => !vars.some((v) => v.key === k));
      if (missing.length) console.warn(`[${alias}] warning: Resend template lacks registry variables: ${missing.join(', ')}`);
      const meta: TemplateMeta = { id, name: t?.name ?? null, subject: t?.subject ?? null, from: t?.from ?? null, variables: vars };
      fs.writeFileSync(path.join(TEMPLATES_DIR, `${alias}.html`), html);
      fs.writeFileSync(path.join(TEMPLATES_DIR, `${alias}.json`), JSON.stringify(meta, null, 2) + '\n');
      console.log(`[${alias}] pulled`);
    } catch (err) {
      failures++;
      console.error(`[${alias}] ${(err as Error).message}`);
    }
  }
  if (failures) process.exit(1);
}

main().catch((err) => { console.error((err as Error).message); process.exit(1); });
