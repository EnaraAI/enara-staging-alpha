import { defineConfig, loadEnv, type Plugin } from 'vite';
import type { AtRule, Plugin as PostcssPlugin, Rule } from 'postcss';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

const LMS = fileURLToPath(new URL('./src/lms/', import.meta.url));

// The copied lms-test kids app (src/lms) keeps its imports unchanged; these resolve them as lms-test does.
function lmsKids(): Plugin {
  const FFMPEG = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm/';
  return {
    name: 'lms-kids',
    enforce: 'pre',
    async resolveId(source, importer) {
      if (!importer || !importer.startsWith(LMS)) return null;
      // lms-test uses lucide-react 0.574.0 (the design app uses 1.x): the same icons, from an alias at that version.
      if (source === 'lucide-react') return this.resolve('lucide-react-lms', importer, { skipSelf: true });
      // services/videoCompression.ts (teacher chapter-video upload; never reached from the kids app) asks for ffmpeg.wasm
      // as a URL. The 32 MB file is over the static host's 25 MB file limit, so it is not copied into the build.
      if (source === '@ffmpeg/core?url') return '\0lms-ffmpeg-core';
      if (source === '@ffmpeg/core/wasm?url') return '\0lms-ffmpeg-wasm';
      return null;
    },
    load(id) {
      if (id === '\0lms-ffmpeg-core') return `export default ${JSON.stringify(FFMPEG + 'ffmpeg-core.js')};`;
      if (id === '\0lms-ffmpeg-wasm') return `export default ${JSON.stringify(FFMPEG + 'ffmpeg-core.wasm')};`;
      return null;
    },
  };
}

// src/kids-lms/kids-lms.css (lms-test's Tailwind for the copied files) applies inside .lms-scope only: every top-level
// selector gets a :where(.lms-scope) prefix, which adds no specificity, so the copied files cascade as on lms-test while the
// design app's own screens (which use the same class names with their own tokens) are never touched. Selectors that
// already name the scope, or the page (html), are left as they are; its theme variables (:root) go on the scope instead.
const lmsScope: PostcssPlugin = {
  postcssPlugin: 'lms-scope',
  Once(root) {
    if (!root.source?.input.file?.replace(/\\/g, '/').endsWith('/src/kids-lms/kids-lms.css')) return;
    root.walkRules((rule: Rule) => {
      for (let p = rule.parent; p && p.type !== 'root'; p = p.parent) {
        if (p.type === 'rule' || (p.type === 'atrule' && /keyframes$/i.test((p as AtRule).name))) return;
      }
      const out = rule.selectors.map((sel) => (/^\s*(:root|:host)\s*$/.test(sel) ? ':where(.lms-scope)' // theme variables: on the scope, not the page
        : /lms-scope|^\s*html\b/.test(sel) ? sel : `:where(.lms-scope) ${sel}`));
      rule.selectors = [...new Set(out)];
    });
  },
};

// Static preview only: relative base so the build opens from any folder; no source maps.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const base = (process.env.VITE_API_BASE || env.VITE_API_BASE || 'https://lms-test.enara.app').replace(/\/+$/, '');
  if (/(^|\/\/)test\.enara\.app/.test(base)) throw new Error('design app must never call test.enara.app');
  return {
    base: './',
    plugins: [lmsKids(), react(), tailwindcss()],
    css: { postcss: { plugins: [lmsScope] } },
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    // The copied apiService calls `${VITE_API_URL}/<path without /api>`: lms-test's /api, the same API as the design app.
    define: { 'import.meta.env.VITE_API_URL': JSON.stringify(`${base}/api`) },
    // As in frontend/vite.config.ts: ffmpeg.wasm starts its own worker; pre-bundling breaks the worker URL in dev.
    optimizeDeps: { exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'] },
    build: { sourcemap: false },
  };
});
