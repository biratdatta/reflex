import { spawnSync } from 'node:child_process';

/**
 * Chrome extensions need one self-contained file per execution context, so the
 * popup, content script, page runtime and service worker are built separately.
 * The popup goes first: it clears dist/ and copies the manifest from public/.
 */
const steps = [
  { name: 'popup', args: ['build', '--config', 'vite.config.ts'], env: {} },
  {
    name: 'content script',
    args: ['build', '--config', 'vite.bundle.config.ts'],
    env: { REFLEX_ENTRY: 'src/content/contentScript.ts', REFLEX_OUT: 'content.js' },
  },
  {
    name: 'page runtime',
    args: ['build', '--config', 'vite.bundle.config.ts'],
    env: { REFLEX_ENTRY: 'src/page/reflexRuntime.ts', REFLEX_OUT: 'page.js' },
  },
  {
    name: 'service worker',
    args: ['build', '--config', 'vite.bundle.config.ts'],
    env: { REFLEX_ENTRY: 'src/background/serviceWorker.ts', REFLEX_OUT: 'background.js' },
  },
];

const watch = process.argv.includes('--watch');

for (const step of steps) {
  const args = watch ? [...step.args, '--watch'] : step.args;
  process.stdout.write(`\n▸ building ${step.name}\n`);
  const result = spawnSync('npx', ['vite', ...args], {
    stdio: 'inherit',
    env: { ...process.env, ...step.env },
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
  if (watch) break; // vite --watch blocks; watch the popup only.
}

process.stdout.write('\n✓ extension built to apps/extension/dist\n');
