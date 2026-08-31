/**
 * The service worker does very little on purpose: Reflex keeps discovery, state
 * and execution in the tab. Here we only paint the badge (how many tools are
 * live on the active tab) and clear it as tabs change.
 */

import { reconcilePersistence } from '../shared/persistence.js';

const BADGE_BACKGROUND = '#1f6f4f';

const paint = async (tabId: number, count: number): Promise<void> => {
  await chrome.action.setBadgeText({ tabId, text: count > 0 ? String(count) : '' });
  await chrome.action.setBadgeBackgroundColor({ tabId, color: BADGE_BACKGROUND });
  await chrome.action.setTitle({
    tabId,
    title:
      count > 0
        ? `Reflex — ${count} WebMCP tool${count === 1 ? '' : 's'} active on this page`
        : 'Reflex — discover WebMCP tools on this page',
  });
};

chrome.runtime.onMessage.addListener((message: { type?: string; count?: number }, sender, sendResponse) => {
  if (message?.type !== 'SET_BADGE') return undefined;
  const tabId = sender.tab?.id;
  if (typeof tabId === 'number') void paint(tabId, message.count ?? 0);
  sendResponse({ ok: true });
  return true;
});

// A navigation drops every registered tool, so the badge must not linger. Where
// the user has granted the site, the content script re-attaches on its own and
// repaints the badge a moment later.
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') void paint(tabId, 0);
});

// Keep the automatic attachments in step with the permissions actually held —
// including ones revoked from Chrome's own settings page.
chrome.runtime.onInstalled.addListener(() => void reconcilePersistence());
chrome.runtime.onStartup.addListener(() => void reconcilePersistence());
chrome.permissions.onRemoved.addListener(() => void reconcilePersistence());
chrome.permissions.onAdded.addListener(() => void reconcilePersistence());
