import { defineConfig } from 'vite';
import { workspaceAlias } from './vite.shared.js';

/**
 * Single-file bundles for the content script, the page runtime and the service
 * worker. Extension scripts cannot code-split, so each is built on its own with
 * dynamic imports inlined.
 *
 * REFLEX_ENTRY / REFLEX_OUT select which one to build.
 */
const entry = process.env.REFLEX_ENTRY;
const out = process.env.REFLEX_OUT;
if (!entry || !out) throw new Error('REFLEX_ENTRY and REFLEX_OUT must be set');

export default defineConfig({
  root: __dirname,
  resolve: { alias: workspaceAlias },
  publicDir: false,
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    target: 'chrome111',
    // Content scripts and the MAIN-world runtime must be classic single files.
    lib: { entry, formats: [out === 'background.js' ? 'es' : 'iife'], name: 'Reflex', fileName: () => out },
    rollupOptions: { output: { inlineDynamicImports: true, extend: true } },
  },
});
