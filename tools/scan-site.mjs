#!/usr/bin/env node
/**
 * Point Reflex's discovery engine at live pages, without installing the
 * extension: loads each URL in Chromium, injects the bundled engine, and prints
 * what it found.
 *
 *   node tools/scan-site.mjs https://example.com [more urls…]
 *   node tools/scan-site.mjs --threshold 40 --json https://example.com
 *
 * Read-only: it never calls a tool, only discovers candidates.
 */
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const HARNESS = resolve(here, 'dist/reflex-scan.js');

const args = process.argv.slice(2);
const urls = args.filter((arg) => !arg.startsWith('--') && !/^\d+$/.test(arg));
const asJson = args.includes('--json');
const thresholdFlag = args.indexOf('--threshold');
const threshold = thresholdFlag === -1 ? 50 : Number(args[thresholdFlag + 1]);

if (!urls.length) {
  console.error('usage: node tools/scan-site.mjs [--threshold N] [--json] <url> [url…]');
  process.exit(1);
}

let harness;
try {
  harness = readFileSync(HARNESS, 'utf8');
} catch {
  console.error('Build the harness first: npx vite build --config tools/vite.scan.config.ts');
  process.exit(1);
}

const RISK_MARK = { read: '·', write: '+', sensitive: '!', destructive: 'x' };

const browser = await chromium.launch({
  executablePath: process.env.REFLEX_E2E_EXECUTABLE || undefined,
  channel: process.env.REFLEX_E2E_EXECUTABLE ? undefined : (process.env.REFLEX_SCAN_CHANNEL ?? 'chromium'),
});

const results = [];

for (const url of urls) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  try {
    // Injected before any page script: addScriptTag would be refused outright by
    // a strict Content-Security-Policy, whereas this path (like the extension's
    // MAIN-world injection) is not subject to page CSP.
    await page.addInitScript({ content: harness });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    // Give client-rendered pages a moment to paint their controls.
    await page.waitForTimeout(2500);
    const scan = await page.evaluate((limit) => window.__reflexScan(limit), threshold);
    results.push({ url, ...scan });

    if (!asJson) {
      const { readiness, candidates } = scan;
      console.log(`\n${'─'.repeat(78)}\n${url}`);
      console.log(
        `readiness ${String(readiness.score).padStart(3)}%   ` +
          `semantic ${Math.round(readiness.breakdown.semanticControls * 100)}% · ` +
          `named ${Math.round(readiness.breakdown.ariaCoverage * 100)}% · ` +
          `forms ${Math.round(readiness.breakdown.formQuality * 100)}%   ` +
          `(${readiness.counts.interactiveControls} controls, ${candidates.length} capabilities)`,
      );
      for (const candidate of candidates) {
        const params = candidate.parameters.length ? `(${candidate.parameters.join(', ')})` : '()';
        console.log(
          `  ${RISK_MARK[candidate.risk]} ${String(candidate.confidence).padStart(3)}%  ` +
            `${candidate.name}${params}`,
        );
      }
      if (!candidates.length) console.log('  — nothing above the confidence threshold');
    }
  } catch (error) {
    results.push({ url, error: error instanceof Error ? error.message : String(error) });
    if (!asJson) console.log(`\n${'─'.repeat(78)}\n${url}\n  failed: ${error.message?.split('\n')[0]}`);
  } finally {
    await context.close();
  }
}

await browser.close();
if (asJson) console.log(JSON.stringify(results, null, 2));
