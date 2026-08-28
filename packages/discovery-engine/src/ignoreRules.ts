import { cleanText } from './naming.js';

/**
 * Generic interface mechanics. These are UI implementation details rather than
 * business capabilities, so they never become tools — an agent should invoke
 * "revoke_application_access", not "close_modal".
 */
const IGNORED_PHRASES = new Set([
  'close',
  'cancel',
  'dismiss',
  'ok',
  'okay',
  'done',
  'back',
  'next',
  'previous',
  'prev',
  'continue',
  'skip',
  'menu',
  'open menu',
  'close menu',
  'toggle menu',
  'toggle navigation',
  'toggle navigation menu',
  'main menu',
  'navigation',
  'expand',
  'collapse',
  'expand all',
  'collapse all',
  'show more',
  'show less',
  'read more',
  'more',
  'less',
  'next slide',
  'previous slide',
  'next page',
  'previous page',
  'first page',
  'last page',
  'scroll',
  'scroll to top',
  'back to top',
  'tooltip',
  'help',
  'info',
  'settings',
  'toggle dark mode',
  'toggle theme',
  'print',
  'copy',
  'copy link',
  'select all',
  'clear',
  'reset',
  'refresh',
  'reload',
  'sort',
  'edit',
  'save',
  'submit',
  'search',
  'go',
  'apply',
  'select',
  'choose',
  'view',
  'details',
  'sign in',
  'log in',
  'sign out',
  'log out',
]);

/** Verbs that, applied to a UI noun, describe interface mechanics only. */
const UI_VERB =
  /^(close|open|toggle|expand|collapse|dismiss|hide|show|focus|scroll|switch|move|pin|unpin|dock|undock|minimise|minimize|maximise|maximize|resize|drag)\b/;

const UI_NOUN =
  /\b(?:menu|modal|dialog|drawer|panel|popover|popup|tooltip|accordion|sidebar|side bar|navigation|nav|tab|section|row|column|dropdown|overlay|banner|notification|toast|alert|snackbar|carousel|slide|lightbox|sheet|flyout|hamburger|theme|appearance|layout|toolbar|widget|window|preview|dark mode|light mode|font size|text size|table of contents|toc|breadcrumb|pagination|filter panel)s?\b/;

export interface IgnoreVerdict {
  ignored: boolean;
  reason?: string;
}

/**
 * Decide whether an accessible name describes generic UI machinery.
 * Deliberately conservative: a phrase must be generic on its own
 * ("Close"), or pair a UI verb with a UI noun ("Toggle sidebar").
 * Domain phrases such as "Open employee record" survive.
 */
export const shouldIgnoreLabel = (rawLabel: string): IgnoreVerdict => {
  const label = cleanText(rawLabel).toLowerCase().replace(/[.…]+$/, '');
  if (!label) return { ignored: true, reason: 'No accessible name' };

  if (IGNORED_PHRASES.has(label)) {
    return { ignored: true, reason: `Generic UI action ("${label}")` };
  }

  if (UI_VERB.test(label) && UI_NOUN.test(label)) {
    return { ignored: true, reason: `Interface mechanic ("${label}")` };
  }

  // A single word that is only a verb carries no object, so it names nothing specific.
  if (!label.includes(' ') && IGNORED_PHRASES.has(label.replace(/s$/, ''))) {
    return { ignored: true, reason: `Generic UI action ("${label}")` };
  }

  return { ignored: false };
};

/** Controls that opt out explicitly, or that are decorative/inert. */
export const isExcludedElement = (el: Element): boolean => {
  if (el.closest('[data-reflex-ignore]')) return true;
  if (el.getAttribute('aria-hidden') === 'true' || el.closest('[aria-hidden="true"]')) return true;
  if (el.closest('[inert]')) return true;
  if (el instanceof HTMLElement && el.hidden) return true;
  return false;
};
