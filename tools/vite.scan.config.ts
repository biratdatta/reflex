import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { workspaceAlias } from '../apps/extension/vite.shared.js';

/** One self-contained script, so it can be injected into any page. */
export default defineConfig({
  resolve: { alias: workspaceAlias },
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    target: 'chrome111',
    lib: {
      entry: resolve(__dirname, 'scanHarness.ts'),
      formats: ['iife'],
      name: 'ReflexScan',
      fileName: () => 'reflex-scan.js',
    },
  },
});
