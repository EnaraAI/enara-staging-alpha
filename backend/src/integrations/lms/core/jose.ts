import { pathToFileURL } from 'url';

// jose v6 is ESM-only. The backend compiles to CommonJS, and Vercel's Node
// runtime cannot require() an ES module (ERR_REQUIRE_ESM at cold start, which
// takes the whole function down). TypeScript turns `import('jose')` into
// require() under module=commonjs, so this uses a real dynamic import that the
// compiler leaves alone, with an absolute file URL so resolution never depends
// on the working directory. All jose use goes through loadJose() (a test
// enforces it); type-only imports from 'jose' are fine (erased at compile time).
export type Jose = typeof import('jose');

const dynamicImport = new Function('url', 'return import(url)') as (url: string) => Promise<Jose>;
let cached: Promise<Jose> | undefined;

export function loadJose(): Promise<Jose> {
  cached ??= dynamicImport(pathToFileURL(require.resolve('jose')).href).catch((error: { code?: string; message?: string }) => {
    // Inside a VM sandbox (the test runner) a Function body has no import
    // callback; there the bundler's own import() works. Never hit on Vercel.
    if (error?.code === 'ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING' || /dynamic import callback/i.test(String(error?.message))) return import('jose');
    throw error;
  });
  return cached;
}
