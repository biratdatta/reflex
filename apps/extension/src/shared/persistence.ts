import { CONTENT_SCRIPT_FILE, PAGE_RUNTIME_FILE } from './messaging.js';

/**
 * Staying attached across a reload.
 *
 * By default Reflex holds no host permissions and attaches through `activeTab`,
 * which Chrome grants when you click the toolbar button and revokes the moment
 * the page navigates. That is the right default — Reflex reads a page only when
 * you ask it to — but it means a refresh takes the registered tools with it and
 * you have to open the panel again.
 *
 * Approvals were never lost: they live in chrome.storage.local, scoped by
 * origin. Only the runtime went away. So the fix is to let a user grant one
 * site, and one site only, permission to attach on its own — a dynamic content
 * script registered for that origin, which survives reloads and browser
 * restarts. Everywhere else behaves exactly as before.
 */

export const originPattern = (origin: string): string => `${origin}/*`;

const idsFor = (origin: string) => {
  const key = origin.replace(/[^a-zA-Z0-9]/g, '_');
  return { page: `reflex_page_${key}`, content: `reflex_content_${key}` };
};

/** Has the user granted this origin? */
export const isPersistent = async (origin: string): Promise<boolean> => {
  try {
    return await chrome.permissions.contains({ origins: [originPattern(origin)] });
  } catch {
    return false;
  }
};

const registerScripts = async (origin: string): Promise<void> => {
  const ids = idsFor(origin);
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [ids.page, ids.content] });
  if (existing.length === 2) return;
  if (existing.length) await chrome.scripting.unregisterContentScripts({ ids: existing.map((s) => s.id) });

  await chrome.scripting.registerContentScripts([
    // The page runtime is registered first for the same reason the popup injects
    // it first: it should be listening before the content script says hello.
    {
      id: ids.page,
      matches: [originPattern(origin)],
      js: [PAGE_RUNTIME_FILE],
      world: 'MAIN',
      runAt: 'document_idle',
      allFrames: false,
      persistAcrossSessions: true,
    },
    {
      id: ids.content,
      matches: [originPattern(origin)],
      js: [CONTENT_SCRIPT_FILE],
      world: 'ISOLATED',
      runAt: 'document_idle',
      allFrames: false,
      persistAcrossSessions: true,
    },
  ]);
};

const unregisterScripts = async (origin: string): Promise<void> => {
  const ids = idsFor(origin);
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [ids.page, ids.content] });
  if (existing.length) await chrome.scripting.unregisterContentScripts({ ids: existing.map((s) => s.id) });
};

/**
 * Ask for the origin and start attaching automatically.
 * Must be called from a user gesture — Chrome shows its own permission prompt.
 */
export const enablePersistence = async (origin: string): Promise<boolean> => {
  const granted = await chrome.permissions.request({ origins: [originPattern(origin)] });
  if (!granted) return false;
  await registerScripts(origin);
  return true;
};

/** Stop attaching automatically, and hand the permission back. */
export const disablePersistence = async (origin: string): Promise<void> => {
  await unregisterScripts(origin);
  try {
    await chrome.permissions.remove({ origins: [originPattern(origin)] });
  } catch {
    /* already gone */
  }
};

const originFromPattern = (pattern: string): string | null => {
  const match = /^(https?:\/\/[^/]+)\/\*$/.exec(pattern);
  return match ? match[1] : null;
};

/**
 * Reconcile registrations with granted permissions. Runs on install and on
 * browser start, so a permission granted last week still attaches today, and a
 * permission revoked in Chrome's own settings stops attaching.
 */
export const reconcilePersistence = async (): Promise<void> => {
  const granted = await chrome.permissions.getAll();
  const origins = (granted.origins ?? [])
    .map(originFromPattern)
    .filter((origin): origin is string => Boolean(origin));

  for (const origin of origins) await registerScripts(origin);

  const registered = await chrome.scripting.getRegisteredContentScripts();
  const wanted = new Set(origins.flatMap((origin) => Object.values(idsFor(origin))));
  const stale = registered.filter((script) => script.id.startsWith('reflex_') && !wanted.has(script.id));
  if (stale.length) await chrome.scripting.unregisterContentScripts({ ids: stale.map((s) => s.id) });
};

/** Every origin Reflex is currently set to attach to on its own. */
export const persistentOrigins = async (): Promise<string[]> => {
  const granted = await chrome.permissions.getAll();
  return (granted.origins ?? [])
    .map(originFromPattern)
    .filter((origin): origin is string => Boolean(origin));
};
