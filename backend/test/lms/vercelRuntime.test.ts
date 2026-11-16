import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';

// Regression for the first lms-test.enara.app deploy: Vercel's Node runtime
// cannot require() an ES module, and jose v6 is ESM-only, so a static
// `import ... from 'jose'` (compiled to require) crashed every cold start
// with ERR_REQUIRE_ESM. Node's --no-experimental-require-module flag gives
// the same behaviour locally.

const BACKEND = path.resolve(__dirname, '../..');

describe('runs on Vercel-like Node (no require of ES modules)', () => {
  it('no file imports jose values directly except core/jose.ts', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, f.name);
        if (f.isDirectory()) walk(p);
        else if (p.endsWith('.ts') && !p.endsWith(path.join('core', 'jose.ts'))) {
          const src = fs.readFileSync(p, 'utf8');
          if (/^import\s+(?!type\b)[^;]*from\s+['"]jose['"]/m.test(src) || /require\(['"]jose['"]\)/.test(src)) offenders.push(path.relative(BACKEND, p));
        }
      }
    };
    walk(path.join(BACKEND, 'src'));
    expect(offenders).toEqual([]);
  });

  it('the compiled app loads and jose works with require(esm) disabled', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'enara-dist-'));
    try {
      execFileSync(process.execPath, [path.join(BACKEND, 'node_modules/typescript/bin/tsc'), '-p', BACKEND, '--outDir', path.join(out, 'dist')], { stdio: 'pipe' });
      fs.symlinkSync(path.join(BACKEND, 'node_modules'), path.join(out, 'node_modules'));
      const script = `
        process.env.LMS_KEK = require('crypto').randomBytes(32).toString('base64');
        process.env.MONGODB_URI = 'mongodb://127.0.0.1:1/x';
        process.env.JWT_SECRET = 'x'.repeat(40); process.env.INGEST_HMAC_SECRET = 'y'.repeat(40);
        process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:5173'; process.env.NODE_ENV = 'test';
        require(${JSON.stringify(path.join(out, 'dist/app.js'))});
        require(${JSON.stringify(path.join(out, 'dist/integrations/lms/core/jose.js'))}).loadJose()
          .then((j) => j.generateKeyPair('RS256', { extractable: true }))
          .then(() => console.log('RUNTIME_OK'), (e) => { console.log('RUNTIME_FAIL ' + (e.code || e.message)); });
      `;
      const res = execFileSync(process.execPath, ['--no-experimental-require-module', '-e', script], { cwd: os.tmpdir(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      expect(res).toContain('RUNTIME_OK');
    } finally {
      fs.rmSync(out, { recursive: true, force: true });
    }
  }, 240_000);
});
