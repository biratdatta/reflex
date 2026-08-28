import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { workspaceAlias } from './vite.shared.js';

/**
 * Popup build. Runs first: it empties dist/ and copies public/ (the manifest
 * and icons) into place.
 */
export default defineConfig({
  root: __dirname,
  plugins: [react()],
  resolve: { alias: workspaceAlias },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: { popup: 'src/popup/index.html' },
      output: {
        entryFileNames: 'popup.js',
        chunkFileNames: 'chunks/[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
});
