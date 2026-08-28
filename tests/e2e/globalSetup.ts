import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Playwright loads config files as CommonJS, so __dirname is the portable choice here.
const here = __dirname;
const root = resolve(here, '../..');

export const EXTENSION_DIR = resolve(here, '.tmp-extension');

/**
 * Build the extension, then stage a copy for the tests with one change:
 * host permission for the demo origin.
 *
 * Reflex ships with `activeTab` only, which Chrome grants when the user clicks
 * the toolbar button. A test cannot click that button, so the fixture grants
 * the equivalent access up front. Nothing else about the extension differs.
 */
export default function globalSetup(): void {
  const build = spawnSync('npm', ['run', 'build:extension'], { cwd: root, stdio: 'inherit', shell: false });
  if (build.status !== 0) throw new Error('extension build failed');

  rmSync(EXTENSION_DIR, { recursive: true, force: true });
  mkdirSync(EXTENSION_DIR, { recursive: true });
  cpSync(resolve(root, 'apps/extension/dist'), EXTENSION_DIR, { recursive: true });

  const manifestPath = resolve(EXTENSION_DIR, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
  // Two origins on the same server, so the tests can prove approvals do not leak across them.
  manifest.host_permissions = ['http://localhost:3000/*', 'http://127.0.0.1:3000/*'];
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}
