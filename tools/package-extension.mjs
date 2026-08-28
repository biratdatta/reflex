#!/usr/bin/env node
/**
 * Package the built extension into a zip a user can unzip and load unpacked.
 * The zip contains a single `reflex-extension/` folder, so unzipping produces a
 * clean directory to point Chrome at.
 *
 *   npm run package
 */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'apps/extension/dist');
const outDir = join(root, 'release');

const manifest = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8'));
const zipName = `reflex-extension-${manifest.version}.zip`;
const zipPath = join(outDir, zipName);

const stage = mkdtempSync(join(tmpdir(), 'reflex-pkg-'));
const folder = join(stage, 'reflex-extension');
mkdirSync(folder, { recursive: true });
cpSync(dist, folder, { recursive: true });

mkdirSync(outDir, { recursive: true });
rmSync(zipPath, { force: true });
execFileSync('zip', ['-qr', '-X', zipPath, 'reflex-extension', '-x', '*.DS_Store'], { cwd: stage });
rmSync(stage, { recursive: true, force: true });

const { size } = await import('node:fs').then((fs) => fs.statSync(zipPath));
console.log(`packaged ${zipName} (${Math.round(size / 1024)} KB) → release/${zipName}`);
