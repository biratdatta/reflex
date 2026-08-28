import type { CapabilityCandidate, ExecutionResult } from '@reflex/capability-model';
import { cssEscape, resolveTarget } from '@reflex/discovery-engine';
import { isFormControl, type FormControl } from '@reflex/schema-generator';
import type { MCPToolResponse } from './types.js';

export interface ExecutionOptions {
  /** How long to wait for the page to react before reading the result region. */
  settleMs?: number;
  /** Called before a destructive action actuates; false aborts. */
  confirm?: (candidate: CapabilityCandidate) => boolean | Promise<boolean>;
  /** Max characters of result-region text returned to the agent. */
  maxResultChars?: number;
}

const DEFAULT_SETTLE_MS = 350;
const DEFAULT_MAX_RESULT_CHARS = 4000;

/**
 * Watch for the page leaving, from before the action is taken.
 *
 * On a classic multi-page application, submitting a form unloads the document —
 * sometimes synchronously with the submit call. Waiting out the full settle
 * delay would leave the caller's reply pending when its execution context
 * disappears, so the agent sees a hang instead of "submitted, page is loading".
 * The watch therefore starts before the control is touched.
 */
const watchForNavigation = (doc: Document) => {
  const view = doc.defaultView;
  let left = false;
  let notify: (() => void) | null = null;

  const onLeave = () => {
    left = true;
    notify?.();
  };

  view?.addEventListener('pagehide', onLeave, true);
  view?.addEventListener('beforeunload', onLeave, true);

  const dispose = () => {
    view?.removeEventListener('pagehide', onLeave, true);
    view?.removeEventListener('beforeunload', onLeave, true);
  };

  return {
    /** Resolve when the page settles, or immediately once it starts navigating. */
    settle: (ms: number): Promise<'settled' | 'navigating'> =>
      new Promise((resolve) => {
        if (left) {
          dispose();
          resolve('navigating');
          return;
        }
        let finished = false;
        const finish = (outcome: 'settled' | 'navigating') => {
          if (finished) return;
          finished = true;
          clearTimeout(timer);
          notify = null;
          dispose();
          resolve(outcome);
        };
        notify = () => finish('navigating');
        const timer = setTimeout(() => finish('settled'), ms);
      }),
    dispose,
  };
};

/**
 * Set a control's value the way a user would, as far as the page can tell.
 * Frameworks track their own value state, so the native setter is used and
 * input/change are dispatched — assigning `.value` alone can go unnoticed.
 */
const setControlValue = (control: FormControl, value: unknown): void => {
  const prototype =
    control instanceof HTMLInputElement
      ? HTMLInputElement.prototype
      : control instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLSelectElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
  const next = value === null || value === undefined ? '' : String(value);
  if (descriptor?.set) descriptor.set.call(control, next);
  else control.value = next;
};

const setCheckedValue = (control: HTMLInputElement, checked: boolean): void => {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked');
  if (descriptor?.set) descriptor.set.call(control, checked);
  else control.checked = checked;
};

const fireInputEvents = (control: Element): void => {
  control.dispatchEvent(new Event('input', { bubbles: true }));
  control.dispatchEvent(new Event('change', { bubbles: true }));
};

const controlsNamed = (form: Element, key: string): FormControl[] => {
  const byName = Array.from(form.querySelectorAll(`[name="${cssEscape(key)}"]`)).filter(isFormControl);
  if (byName.length) return byName;
  const byId = form.querySelector(`#${cssEscape(key)}`);
  return byId && isFormControl(byId) ? [byId] : [];
};

export interface FieldOutcome {
  key: string;
  applied: boolean;
  reason?: string;
}

/** Populate one logical field, handling radio groups, checkboxes and multi-selects. */
export const applyField = (form: Element, key: string, value: unknown): FieldOutcome => {
  const controls = controlsNamed(form, key);
  if (!controls.length) return { key, applied: false, reason: 'no matching field' };

  const first = controls[0];
  const type = first instanceof HTMLInputElement ? (first.type || 'text').toLowerCase() : first.tagName.toLowerCase();

  if (type === 'radio') {
    const wanted = String(value);
    const match = controls.find((control) => control instanceof HTMLInputElement && control.value === wanted);
    if (!match) return { key, applied: false, reason: `no option "${wanted}"` };
    setCheckedValue(match as HTMLInputElement, true);
    fireInputEvents(match);
    return { key, applied: true };
  }

  if (type === 'checkbox') {
    if (controls.length > 1) {
      const wanted = new Set((Array.isArray(value) ? value : [value]).map(String));
      for (const control of controls) {
        if (!(control instanceof HTMLInputElement)) continue;
        setCheckedValue(control, wanted.has(control.value));
        fireInputEvents(control);
      }
      return { key, applied: true };
    }
    const checked = value === true || value === 'true' || value === 'on' || value === 1;
    setCheckedValue(first as HTMLInputElement, checked);
    fireInputEvents(first);
    return { key, applied: true };
  }

  if (first instanceof HTMLSelectElement) {
    const wanted = (Array.isArray(value) ? value : [value]).map(String);
    const available = Array.from(first.options).map((option) => option.value);
    const missing = wanted.filter((candidate) => !available.includes(candidate));
    if (missing.length) {
      return { key, applied: false, reason: `not an option: ${missing.join(', ')} (allowed: ${available.filter(Boolean).join(', ')})` };
    }
    if (first.multiple) {
      for (const option of Array.from(first.options)) option.selected = wanted.includes(option.value);
    } else {
      setControlValue(first, wanted[0]);
    }
    fireInputEvents(first);
    return { key, applied: true };
  }

  setControlValue(first, value);
  fireInputEvents(first);
  return { key, applied: true };
};

const readRegion = (doc: Document, selector: string | undefined, max: number): string | undefined => {
  if (!selector) return undefined;
  let region: Element | null = null;
  try {
    region = doc.querySelector(selector);
  } catch {
    return undefined;
  }
  if (!region) return undefined;
  const text = (region.textContent || '').replace(/\s+/g, ' ').trim();
  if (!text) return undefined;
  return text.length > max ? `${text.slice(0, max)}… (truncated)` : text;
};

const submitForm = (form: HTMLFormElement): string => {
  if (typeof form.requestSubmit === 'function') {
    const submitter = form.querySelector<HTMLElement>(
      'button[type="submit"], button:not([type]), input[type="submit"]',
    );
    // requestSubmit runs validation and fires submit, unlike form.submit().
    form.requestSubmit(submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement ? submitter : undefined);
    return 'requestSubmit';
  }
  const submitter = form.querySelector<HTMLElement>('button[type="submit"], input[type="submit"]');
  if (submitter) {
    submitter.click();
    return 'submitter-click';
  }
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  return 'submit-event';
};

/** Run an approved candidate against the live DOM. */
export const executeCandidate = async (
  doc: Document,
  candidate: CapabilityCandidate,
  input: Record<string, unknown> = {},
  options: ExecutionOptions = {},
): Promise<ExecutionResult> => {
  const settleMs = options.settleMs ?? DEFAULT_SETTLE_MS;
  const maxChars = options.maxResultChars ?? DEFAULT_MAX_RESULT_CHARS;

  // Fail closed: verify identity before actuating anything.
  const target = resolveTarget(doc, candidate.elementSelector, candidate.fingerprint);
  if ('error' in target) {
    return { success: false, action: candidate.name, error: target.error };
  }

  if (candidate.risk === 'destructive' && options.confirm) {
    const approved = await options.confirm(candidate);
    if (!approved) {
      return { success: false, action: candidate.name, error: 'Human approval declined' };
    }
  }

  const element = target.element;

  if (candidate.source === 'button') {
    if (element instanceof HTMLButtonElement && element.disabled) {
      return { success: false, action: candidate.name, error: 'Control is disabled' };
    }
    const watch = watchForNavigation(doc);
    (element as HTMLElement).click();
    const outcome = await watch.settle(settleMs);
    if (outcome === 'navigating') {
      return {
        success: true,
        action: candidate.name,
        detail: `Activated "${candidate.title}"; the page is navigating`,
        observed: { navigating: true, from: doc.location?.href },
      };
    }
    const observedText = readRegion(doc, candidate.resultSelector, maxChars);
    return {
      success: true,
      action: candidate.name,
      detail: `Activated "${candidate.title}"`,
      observed: observedText ? { region: observedText } : undefined,
    };
  }

  const allowed = new Set(Object.keys(candidate.inputSchema.properties));
  const unknownKeys = Object.keys(input).filter((key) => !allowed.has(key));
  const outcomes: FieldOutcome[] = [];

  for (const [key, value] of Object.entries(input)) {
    if (!allowed.has(key)) continue;
    outcomes.push(applyField(element, key, value));
  }

  const failures = outcomes.filter((outcome) => !outcome.applied);
  if (failures.length) {
    return {
      success: false,
      action: candidate.name,
      error: `Could not populate ${failures.map((f) => `"${f.key}" (${f.reason})`).join('; ')}`,
    };
  }

  const missingRequired = (candidate.inputSchema.required ?? []).filter(
    (key) => input[key] === undefined || input[key] === '',
  );
  if (missingRequired.length) {
    return {
      success: false,
      action: candidate.name,
      error: `Missing required argument(s): ${missingRequired.join(', ')}`,
    };
  }

  const watch = watchForNavigation(doc);
  const method = element instanceof HTMLFormElement ? submitForm(element) : 'click-submitter';
  if (!(element instanceof HTMLFormElement)) {
    // role="form"/role="search" containers have no submit; drive their button.
    const submitter = element.querySelector<HTMLElement>('button, input[type="submit"]');
    submitter?.click();
  }

  const settle = await watch.settle(settleMs);
  const observedText = settle === 'navigating' ? undefined : readRegion(doc, candidate.resultSelector, maxChars);

  return {
    success: true,
    action: candidate.name,
    detail:
      settle === 'navigating'
        ? `Submitted "${candidate.title}" via ${method}; the page is navigating`
        : `Submitted "${candidate.title}" via ${method}`,
    observed: {
      applied: outcomes.map((outcome) => outcome.key),
      ...(unknownKeys.length ? { ignoredArguments: unknownKeys } : {}),
      ...(settle === 'navigating' ? { navigating: true, from: doc.location?.href } : {}),
      ...(observedText ? { region: observedText } : {}),
    },
  };
};

/** Wrap an ExecutionResult in the content shape MCP hosts expect. */
export const toToolResponse = (result: ExecutionResult): MCPToolResponse => ({
  content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
  isError: !result.success,
  structuredContent: result as unknown as Record<string, unknown>,
});
