import { defineConfig } from 'vite';

export default defineConfig({
  root: __dirname,
  // Bound to all interfaces so the app is reachable as both localhost:3000 and
  // 127.0.0.1:3000 — two origins, which is how the origin-scoping tests prove
  // that approvals do not leak between sites.
  server: { port: 3000, strictPort: true, host: true },
  preview: { port: 3000, strictPort: true, host: true },
  build: { outDir: 'dist', emptyOutDir: true },
});
