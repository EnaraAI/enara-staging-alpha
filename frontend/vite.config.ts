import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(() => {
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      // ffmpeg.wasm starts its own worker; pre-bundling breaks the worker URL in dev.
      optimizeDeps: { exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'] },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
