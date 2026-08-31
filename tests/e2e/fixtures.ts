import { test as base, chromium, type BrowserContext, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { ExtensionMessage, ExtensionResponse, PageSnapshot } from '@reflex/capability-model';

const EXTENSION_DIR = resolve(__dirname, '.tmp-extension');

/**
 * Chrome derives an unpacked extension's id from the absolute path it was
 * loaded from: the first 128 bits of SHA-256(path), with each hex digit mapped
 * onto a–p. Computing it here avoids waiting on the MV3 service worker, which
 * is lazy and may never wake during a test.
 */
const unpackedExtensionId = (dir: string): string =>
  createHash('sha256')
    .update(dir)
    .digest('hex')
    .slice(0, 32)
    .replace(/./g, (digit) => String.fromCharCode('a'.charCodeAt(0) + parseInt(digit, 16)));

export interface ReflexHarness {
  /** Inject Reflex into a tab, exactly as opening the popup does. */
  attach: (page: Page) => Promise<void>;
  /** Send a popup message to the content script in a tab. */
  send: (page: Page, message: ExtensionMessage) => Promise<ExtensionResponse>;
  snapshot: (page: Page) => Promise<PageSnapshot>;
  /** Open the real popup UI in a tab, pointed at `page`. */
  openPopup: (page: Page) => Promise<Page>;
  /** Switch the panel design, as the settings screen does. */
  setTheme: (theme: string) => Promise<void>;
  /** Register the dynamic content scripts for an origin, as the settings toggle does. */
  enablePersistence: (origin: string) => Promise<void>;
  disablePersistence: (origin: string) => Promise<void>;
  /** Read Reflex's own storage, as only an extension context can. */
  storedOrigins: () => Promise<Record<string, { approvedTools: string[]; rejectedTools: string[] }>>;
  extensionId: string;
}

interface Fixtures {
  context: BrowserContext;
  reflex: ReflexHarness;
}

const tabIdOf = async (extensionPage: Page, url: string): Promise<number> =>
  extensionPage.evaluate(async (target: string) => {
    const tabs = await chrome.tabs.query({});
    const tab = tabs.find((entry) => entry.url?.startsWith(target));
    if (!tab?.id) throw new Error(`No tab for ${target}. Open tabs: ${tabs.map((t) => t.url).join(', ')}`);
    return tab.id;
  }, url);

export const test = base.extend<Fixtures>({
  context: async ({}, use) => {
    const profile = mkdtempSync(join(tmpdir(), 'reflex-profile-'));
    // Chromium, not Chrome: stable Chrome no longer honours --load-extension,
    // so `npx playwright install chromium` is a prerequisite for these tests.
    // REFLEX_E2E_EXECUTABLE points at a specific Chromium build if you have one.
    const executablePath = process.env.REFLEX_E2E_EXECUTABLE;
    const context = await chromium.launchPersistentContext(profile, {
      ...(executablePath ? { executablePath } : { channel: process.env.REFLEX_E2E_CHANNEL ?? 'chromium' }),
      args: [`--disable-extensions-except=${EXTENSION_DIR}`, `--load-extension=${EXTENSION_DIR}`],
    });
    await use(context);
    await context.close();
    rmSync(profile, { recursive: true, force: true });
  },

  reflex: async ({ context }, use) => {
    const extensionId = unpackedExtensionId(EXTENSION_DIR);

    // An extension page gives us a context with chrome.* APIs to drive from.
    const extensionPage = await context.newPage();
    await extensionPage.goto(`chrome-extension://${extensionId}/src/popup/index.html`);
    await extensionPage.waitForFunction(() => typeof chrome?.scripting?.executeScript === 'function');

    const attach = async (page: Page): Promise<void> => {
      const tabId = await tabIdOf(extensionPage, page.url());
      const result = await extensionPage.evaluate(async (id: number) => {
        await chrome.scripting.executeScript({ target: { tabId: id }, files: ['page.js'], world: 'MAIN' });
        await chrome.scripting.executeScript({ target: { tabId: id }, files: ['content.js'], world: 'ISOLATED' });
        return true;
      }, tabId);
      if (!result) throw new Error('injection failed');
    };

    const send = async (page: Page, message: ExtensionMessage): Promise<ExtensionResponse> => {
      const tabId = await tabIdOf(extensionPage, page.url());
      return extensionPage.evaluate(
        async ({ id, payload }: { id: number; payload: ExtensionMessage }) =>
          (await chrome.tabs.sendMessage(id, payload)) as ExtensionResponse,
        { id: tabId, payload: message },
      );
    };

    const snapshot = async (page: Page): Promise<PageSnapshot> => {
      const response = await send(page, { type: 'REQUEST_SNAPSHOT' });
      if (!response.ok || !response.snapshot) {
        throw new Error(`snapshot failed: ${response.ok ? 'no snapshot' : response.error}`);
      }
      return response.snapshot;
    };

    const storedOrigins = async () =>
      extensionPage.evaluate(async () => {
        const all = await chrome.storage.local.get('reflex.origins');
        return (all['reflex.origins'] ?? {}) as Record<
          string,
          { approvedTools: string[]; rejectedTools: string[] }
        >;
      });

    const openPopup = async (page: Page): Promise<Page> => {
      const tabId = await tabIdOf(extensionPage, page.url());
      const popup = await context.newPage();
      await popup.goto(`chrome-extension://${extensionId}/src/popup/index.html?tabId=${tabId}`);
      await popup.waitForSelector('.brand');
      return popup;
    };

    const setTheme = async (theme: string): Promise<void> => {
      await extensionPage.evaluate(async (value) => {
        const stored = (await chrome.storage.local.get('reflex.settings'))['reflex.settings'] ?? {};
        await chrome.storage.local.set({ 'reflex.settings': { ...stored, panelTheme: value } });
      }, theme);
    };

    /**
     * The settings toggle calls chrome.permissions.request(), which raises a
     * native prompt no test can click. The fixture's extension already holds the
     * origin, so these drive the half that follows the grant.
     */
    const enablePersistence = async (origin: string): Promise<void> => {
      await extensionPage.evaluate(async (target) => {
        const key = target.replace(/[^a-zA-Z0-9]/g, '_');
        // Idempotent, like the real registerScripts: the service worker may have
        // registered this origin already when it reconciled on install.
        const ids = [`reflex_page_${key}`, `reflex_content_${key}`];
        const existing = await chrome.scripting.getRegisteredContentScripts({ ids });
        if (existing.length) await chrome.scripting.unregisterContentScripts({ ids: existing.map((s) => s.id) });
        await chrome.scripting.registerContentScripts([
          {
            id: `reflex_page_${key}`,
            matches: [`${target}/*`],
            js: ['page.js'],
            world: 'MAIN',
            runAt: 'document_idle',
            allFrames: false,
            persistAcrossSessions: true,
          },
          {
            id: `reflex_content_${key}`,
            matches: [`${target}/*`],
            js: ['content.js'],
            world: 'ISOLATED',
            runAt: 'document_idle',
            allFrames: false,
            persistAcrossSessions: true,
          },
        ]);
      }, origin);
    };

    const disablePersistence = async (origin: string): Promise<void> => {
      await extensionPage.evaluate(async (target) => {
        const key = target.replace(/[^a-zA-Z0-9]/g, '_');
        const ids = [`reflex_page_${key}`, `reflex_content_${key}`];
        const existing = await chrome.scripting.getRegisteredContentScripts({ ids });
        if (existing.length) await chrome.scripting.unregisterContentScripts({ ids: existing.map((s) => s.id) });
      }, origin);
    };

    await use({
      attach,
      send,
      snapshot,
      storedOrigins,
      openPopup,
      setTheme,
      enablePersistence,
      disablePersistence,
      extensionId,
    });
    await extensionPage.close();
  },
});

export { expect } from '@playwright/test';
