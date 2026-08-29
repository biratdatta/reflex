import { chromium } from '@playwright/test';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';

const OUT = process.env.VID_DIR;
const W = 1280, H = 800;
const LINES = JSON.parse(readFileSync(join(OUT, 'vo/lines.json'), 'utf8'));
const line = (name) => LINES.find((l) => l.name === name);
const PAUSE = 0.7; // breathing room after each narration line

const stage = realpathSync(mkdtempSync(join(tmpdir(), 'reflex-vid-')));
const dir = join(stage, 'ext');
mkdirSync(dir, { recursive: true });
cpSync(resolve('apps/extension/dist'), dir, { recursive: true });
const mf = join(dir, 'manifest.json');
const m = JSON.parse(readFileSync(mf, 'utf8'));
m.host_permissions = ['http://localhost:3000/*'];
writeFileSync(mf, JSON.stringify(m, null, 2));
const id = createHash('sha256').update(dir).digest('hex').slice(0, 32)
  .replace(/./g, (d) => String.fromCharCode(97 + parseInt(d, 16)));

const ctx = await chromium.launchPersistentContext(realpathSync(mkdtempSync(join(tmpdir(), 'rfx-'))), {
  executablePath: process.env.REFLEX_E2E_EXECUTABLE,
  args: [`--disable-extensions-except=${dir}`, `--load-extension=${dir}`],
  viewport: { width: W, height: H },
  recordVideo: { dir: join(OUT, 'raw'), size: { width: W, height: H } },
});

const ext = await ctx.newPage();
await ext.goto(`chrome-extension://${id}/src/popup/index.html`);
await ext.waitForFunction(() => typeof chrome?.scripting?.executeScript === 'function');

const page = await ctx.newPage();
const t0 = Date.now();                       // video recording starts about here
const at = () => (Date.now() - t0) / 1000;
const cues = [];

const caption = async (text) => {
  await page.evaluate((t) => {
    let bar = document.getElementById('reflex-caption');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'reflex-caption';
      bar.style.cssText = [
        'position:fixed', 'left:0', 'right:0', 'bottom:0', 'z-index:2147483646',
        'background:rgba(8,10,12,.94)', 'color:#f2f4f5', 'padding:15px 26px',
        'font:600 18px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
        'letter-spacing:-0.01em', 'border-top:3px solid #2ea36a',
      ].join(';');
      document.documentElement.append(bar);
    }
    bar.textContent = t;
  }, text);
};

/** Speak a line over an action, holding the shot until the voice has finished. */
const beat = async (name, caption_, action) => {
  const start = at();
  cues.push({ name, at: Number(start.toFixed(2)) });
  await caption(caption_);
  if (action) await action();
  const need = line(name).seconds + PAUSE;
  const spent = at() - start;
  if (spent < need) await page.waitForTimeout((need - spent) * 1000);
};

const tabId = async () => ext.evaluate(async () => (await chrome.tabs.query({})).find((t) => t.url?.includes('/claims'))?.id);
const attach = async () => {
  const i = await tabId();
  await ext.evaluate(async (id_) => {
    await chrome.scripting.executeScript({ target: { tabId: id_ }, files: ['page.js'], world: 'MAIN' });
    await chrome.scripting.executeScript({ target: { tabId: id_ }, files: ['content.js'], world: 'ISOLATED' });
  }, i);
  await page.waitForTimeout(1400);
};
const rescan = async () => ext.evaluate(async (i) => await chrome.tabs.sendMessage(i, { type: 'RESCAN' }), await tabId());
const approve = async (cid) =>
  ext.evaluate(async ({ i, c }) => await chrome.tabs.sendMessage(i, { type: 'APPROVE_CANDIDATE', candidateId: c }),
    { i: await tabId(), c: cid });

await page.goto('http://localhost:3000/claims');
await page.waitForTimeout(1000);

await beat('intro', 'A government claims service — no WebMCP, no agent hooks.');
await beat('reads', 'Reflex reads the page and proposes tools.', attach);

let snap = await rescan();
await beat('approved', 'A human approves two read-only capabilities.', async () => {
  for (const name of ['search_claims', 'view_claim_record']) {
    await approve(snap.snapshot.candidates.find((c) => c.name === name).id);
    await page.waitForTimeout(600);
  }
});

await beat('call', 'search_claims("Okonkwo") — the site’s own form is driven.', async () => {
  await page.evaluate(() => {
    const sr = document.getElementById('reflex-agent-console').shadowRoot;
    const tool = [...sr.querySelectorAll('.tool')].find((t) => t.textContent.includes('search_claims'));
    tool.querySelector('button.name').click();
  });
  await page.waitForTimeout(700);
  await page.evaluate(() => {
    const sr = document.getElementById('reflex-agent-console').shadowRoot;
    const tool = [...sr.querySelectorAll('.tool')].find((t) => t.textContent.includes('search_claims'));
    const ta = tool.querySelector('textarea');
    ta.value = '{"query": "Okonkwo"}';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(600);
});

await beat('result', 'The service searched, and the tool returned what it showed.', async () => {
  await page.evaluate(() => {
    const sr = document.getElementById('reflex-agent-console').shadowRoot;
    const tool = [...sr.querySelectorAll('.tool')].find((t) => t.textContent.includes('search_claims'));
    tool.querySelector('button.run').click();
  });
  await page.waitForTimeout(1800);
});

await page.goto('http://localhost:3000/claims/CLM-2026-0481');
await page.waitForTimeout(1200);
await attach();
const snap2 = await rescan();

await beat('destroy', 'Destructive tools ask a human, in the page, every call.', async () => {
  await approve(snap2.snapshot.candidates.find((c) => c.name === 'withdraw_claim').id);
  await page.waitForTimeout(700);
  page.once('dialog', async (d) => { await page.waitForTimeout(2400); await d.dismiss(); });
  await page.evaluate(async () => {
    try { await navigator.modelContext.callTool('withdraw_claim', {}); } catch { /* dismissed */ }
  });
  await page.waitForTimeout(600);
});

await beat('dismiss', 'Dismissed — the claim is untouched.');
await page.evaluate(() => document.getElementById('reflex-caption')?.remove());
await page.waitForTimeout(700);
cues.push({ name: 'end', at: Number(at().toFixed(2)) });
await page.close();
await ctx.close();

writeFileSync(join(OUT, 'vo/cues.json'), JSON.stringify(cues, null, 2));
console.log(cues.map((c) => `${c.name}@${c.at}s`).join('  '));
