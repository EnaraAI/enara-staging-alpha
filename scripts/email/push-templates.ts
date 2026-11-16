/** Push repo templates back to Resend and publish them. Usage: npx tsx scripts/email/push-templates.ts --confirm [alias...] */
import fs from 'node:fs';
import path from 'node:path';
import { TEMPLATE_ALIASES, TEMPLATE_REGISTRY, isTemplateAlias } from '../../backend/src/email/templateRegistry';
import { TEMPLATES_DIR, requireApiKey, resendRequest, type TemplateMeta } from './common';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const confirm = args.includes('--confirm');
  const requested = args.filter((a) => !a.startsWith('--'));
  const bad = requested.filter((a) => !isTemplateAlias(a));
  if (bad.length) { console.error(`Unknown alias(es): ${bad.join(', ')}`); process.exit(1); }
  const aliases = requested.length ? requested.filter(isTemplateAlias) : TEMPLATE_ALIASES;

  const plan = aliases.map((alias) => {
    const htmlPath = path.join(TEMPLATES_DIR, `${alias}.html`);
    const jsonPath = path.join(TEMPLATES_DIR, `${alias}.json`);
    if (!fs.existsSync(htmlPath) || !fs.existsSync(jsonPath)) {
      console.error(`[${alias}] missing ${alias}.html/.json — run pull-templates.ts first`);
      process.exit(1);
    }
    const meta = JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as Partial<TemplateMeta>;
    return { alias, id: TEMPLATE_REGISTRY[alias].id, html: fs.readFileSync(htmlPath, 'utf8'), meta };
  });

  if (!confirm) {
    console.log('Dry run. Would PATCH and publish:');
    for (const p of plan) console.log(`  ${p.alias} -> /templates/${p.id} (subject: ${p.meta.subject ?? '-'}, ${p.html.length} bytes html)`);
    console.log('Re-run with --confirm to apply.');
    process.exit(1);
  }

  const key = requireApiKey();
  let failures = 0;
  for (const p of plan) {
    try {
      const body: Record<string, unknown> = { html: p.html };
      if (p.meta.name) body.name = p.meta.name;
      if (p.meta.subject) body.subject = p.meta.subject;
      if (p.meta.from) body.from = p.meta.from;
      if (Array.isArray(p.meta.variables)) {
        body.variables = p.meta.variables.map((v) => ({
          key: v.key, type: v.type,
          ...(v.fallback_value !== null && v.fallback_value !== undefined ? { fallback_value: v.fallback_value } : {}),
        }));
      }
      await resendRequest(key, 'PATCH', `/templates/${p.id}`, body);
      await resendRequest(key, 'POST', `/templates/${p.id}/publish`);
      console.log(`[${p.alias}] updated and published`);
    } catch (err) {
      failures++;
      console.error(`[${p.alias}] ${(err as Error).message}`);
    }
  }
  if (failures) process.exit(1);
}

main().catch((err) => { console.error((err as Error).message); process.exit(1); });
