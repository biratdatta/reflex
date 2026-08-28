import type { ExtensionMessage, ExtensionResponse, PageSnapshot } from '@reflex/capability-model';

export type { ExtensionMessage, ExtensionResponse, PageSnapshot };

/** Files injected into the tab, in order. page.js must land in the MAIN world. */
export const CONTENT_SCRIPT_FILE = 'content.js';
export const PAGE_RUNTIME_FILE = 'page.js';

export const sendToTab = async (tabId: number, message: ExtensionMessage): Promise<ExtensionResponse> => {
  try {
    const response = (await chrome.tabs.sendMessage(tabId, message)) as ExtensionResponse | undefined;
    return response ?? { ok: false, error: 'No response from the page' };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
};

/**
 * Inject Reflex into the active tab. Uses activeTab + scripting rather than a
 * declared content script, so Reflex needs no host permissions and only ever
 * reads a page the user explicitly opened it on.
 */
export const ensureInjected = async (tabId: number): Promise<{ ok: true } | { ok: false; error: string }> => {
  // Already attached? Injecting again would create a second runtime, with its
  // own tool registry and its own console.
  try {
    const existing = (await chrome.tabs.sendMessage(tabId, { type: 'REQUEST_SNAPSHOT' })) as
      | ExtensionResponse
      | undefined;
    if (existing?.ok) return { ok: true };
  } catch {
    /* nobody home — inject below */
  }

  try {
    // The page runtime goes in first so it is already listening when the
    // content script introduces itself.
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [PAGE_RUNTIME_FILE],
      world: 'MAIN',
    });
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [CONTENT_SCRIPT_FILE],
      world: 'ISOLATED',
    });
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: message };
  }
};

export const activeTab = async (): Promise<chrome.tabs.Tab | undefined> => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
};

export const isScannableUrl = (url: string | undefined): boolean =>
  Boolean(url && /^https?:|^file:/.test(url));
