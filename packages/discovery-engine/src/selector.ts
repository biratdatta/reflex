import type { ElementFingerprint } from '@reflex/capability-model';
import { ariaLabel, explicitRole, visibleText } from './ariaResolver.js';
import { cleanText } from './naming.js';

/** CSS.escape is missing in some environments (jsdom, older embedded views). */
export const cssEscape = (value: string): string =>
  typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(value)
    : value.replace(/["\\]/g, '\\$&');

const escape = cssEscape;

const isUnique = (doc: Document, selector: string): boolean => {
  try {
    return doc.querySelectorAll(selector).length === 1;
  } catch {
    return false;
  }
};

const structuralPath = (el: Element): string => {
  const parts: string[] = [];
  let current: Element | null = el;
  while (current && current !== current.ownerDocument.documentElement) {
    const parent: Element | null = current.parentElement;
    if (!parent) break;
    if (current.id) {
      parts.unshift(`#${escape(current.id)}`);
      break;
    }
    const tag = current.tagName.toLowerCase();
    const siblings = Array.from(parent.children).filter((child) => child.tagName === current!.tagName);
    const index = siblings.indexOf(current) + 1;
    parts.unshift(siblings.length > 1 ? `${tag}:nth-of-type(${index})` : tag);
    current = parent;
  }
  return parts.join(' > ');
};

/**
 * Build the most stable selector available, in the PRD's priority order:
 * id -> data-testid -> name -> aria-label -> structural path.
 * Scoped by the nearest identified form when that makes a weak selector unique.
 */
export const buildSelector = (el: Element): string => {
  const doc = el.ownerDocument;
  const tag = el.tagName.toLowerCase();

  if (el.id && isUnique(doc, `#${escape(el.id)}`)) return `#${escape(el.id)}`;

  const testId = el.getAttribute('data-testid');
  if (testId) {
    const selector = `[data-testid="${escape(testId)}"]`;
    if (isUnique(doc, selector)) return selector;
  }

  const name = el.getAttribute('name');
  if (name) {
    const selector = `${tag}[name="${escape(name)}"]`;
    if (isUnique(doc, selector)) return selector;
    const form = el.closest('form');
    if (form?.id) {
      const scoped = `#${escape(form.id)} ${selector}`;
      if (isUnique(doc, scoped)) return scoped;
    }
  }

  const label = el.getAttribute('aria-label');
  if (label) {
    const selector = `${tag}[aria-label="${escape(label)}"]`;
    if (isUnique(doc, selector)) return selector;
  }

  return structuralPath(el);
};

export const buildFingerprint = (el: Element, fieldNames?: string[]): ElementFingerprint => {
  const fingerprint: ElementFingerprint = { tag: el.tagName.toLowerCase() };
  const role = explicitRole(el);
  if (role) fingerprint.role = role;
  const label = ariaLabel(el);
  if (label) fingerprint.ariaLabel = label;
  const text = visibleText(el);
  // Element text is truncated: long text is content, not identity.
  if (text) fingerprint.text = text.slice(0, 120);
  const name = cleanText(el.getAttribute('name'));
  if (name) fingerprint.name = name;
  if (fieldNames?.length) fingerprint.fieldNames = fieldNames;
  return fingerprint;
};

export interface FingerprintMismatch {
  matches: boolean;
  reasons: string[];
}

/**
 * Verify a located element is still the thing that was approved.
 * Identity signals (tag, role, accessible name, field set) must hold;
 * incidental text drift does not block execution on its own.
 */
export const matchesFingerprint = (el: Element, fingerprint: ElementFingerprint): FingerprintMismatch => {
  const reasons: string[] = [];
  const current = buildFingerprint(el, fingerprint.fieldNames ? currentFieldNames(el) : undefined);

  if (current.tag !== fingerprint.tag) reasons.push(`element is now <${current.tag}>, expected <${fingerprint.tag}>`);
  if ((current.role || '') !== (fingerprint.role || '')) {
    reasons.push(`role changed from "${fingerprint.role || 'none'}" to "${current.role || 'none'}"`);
  }
  if (fingerprint.ariaLabel && current.ariaLabel !== fingerprint.ariaLabel) {
    reasons.push(`accessible name changed from "${fingerprint.ariaLabel}" to "${current.ariaLabel || 'none'}"`);
  }
  if (!fingerprint.ariaLabel && fingerprint.text && current.text !== fingerprint.text) {
    reasons.push(`label text changed from "${fingerprint.text}" to "${current.text || 'none'}"`);
  }
  if (fingerprint.fieldNames?.length) {
    const present = new Set(currentFieldNames(el));
    const missing = fingerprint.fieldNames.filter((field) => !present.has(field));
    if (missing.length) reasons.push(`fields missing: ${missing.join(', ')}`);
  }

  return { matches: reasons.length === 0, reasons };
};

export const currentFieldNames = (el: Element): string[] =>
  Array.from(el.querySelectorAll('input, select, textarea'))
    .map((control) => control.getAttribute('name') || control.id)
    .filter((name): name is string => Boolean(name));

/** Locate an approved candidate's element, or explain why it cannot be trusted. */
export const resolveTarget = (
  doc: Document,
  selector: string,
  fingerprint: ElementFingerprint,
): { element: Element } | { error: string } => {
  let element: Element | null = null;
  try {
    element = doc.querySelector(selector);
  } catch {
    return { error: `Invalid selector "${selector}"` };
  }
  if (!element) return { error: `Target element no longer present (${selector})` };
  const verdict = matchesFingerprint(element, fingerprint);
  if (!verdict.matches) {
    return { error: `Target element changed: ${verdict.reasons.join('; ')}` };
  }
  return { element };
};

/** Short, stable id for a candidate: same page, same element, same id across rescans. */
export const candidateId = (selector: string, fingerprint: ElementFingerprint): string => {
  const input = `${selector}|${fingerprint.tag}|${fingerprint.role || ''}|${fingerprint.ariaLabel || fingerprint.text || ''}|${(fingerprint.fieldNames || []).join(',')}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `rfx_${hash.toString(36)}`;
};
