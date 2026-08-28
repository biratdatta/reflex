import { emptySchema, type CapabilityCandidate, type Evidence } from '@reflex/capability-model';
import { resolveAccessibleDescription, resolveAccessibleName, visibleText } from './ariaResolver.js';
import { IGNORE_THRESHOLD, explainConfidence, scoreConfidence } from './confidence.js';
import { isExcludedElement, shouldIgnoreLabel } from './ignoreRules.js';
import { asSentence, normalizeToolName, uniqueToolName } from './naming.js';
import { resolveResultRegion } from './resultRegion.js';
import { classifyRisk } from './riskClassifier.js';
import { buildFingerprint, buildSelector, candidateId } from './selector.js';

const BUTTON_SELECTOR = 'button, [role="button"], input[type="button"], input[type="submit"]';

export interface ButtonScanOptions {
  takenNames?: Set<string>;
  /** Minimum confidence for a button candidate to be surfaced. */
  threshold?: number;
  /** Forms already turned into candidates; their submitters are covered already. */
  claimedForms?: Element[];
}

const isFormSubmitter = (el: Element, claimedForms: Element[]): boolean => {
  const type = (el.getAttribute('type') || (el.tagName.toLowerCase() === 'button' ? 'submit' : '')).toLowerCase();
  const form = el.closest('form, [role="form"], [role="search"]');
  if (!form) return false;
  if (!claimedForms.includes(form)) return false;
  // Only the submitter is redundant; a "Deactivate" button inside a form is its own capability.
  return type === 'submit';
};

export const findButtonElements = (root: ParentNode): Element[] =>
  Array.from(root.querySelectorAll(BUTTON_SELECTOR)).filter((el) => !isExcludedElement(el));

export const scanButton = (el: Element, options: ButtonScanOptions = {}): CapabilityCandidate | null => {
  const taken = options.takenNames ?? new Set<string>();
  const threshold = options.threshold ?? IGNORE_THRESHOLD;
  const claimedForms = options.claimedForms ?? [];

  if (isFormSubmitter(el, claimedForms)) return null;
  if (el instanceof HTMLButtonElement && el.disabled) return null;

  const name = resolveAccessibleName(el);
  if (!name.value) return null;

  // Unlabelled or generic controls are interface mechanics, never capabilities.
  const verdict = shouldIgnoreLabel(name.value);
  if (verdict.ignored) return null;

  const description = resolveAccessibleDescription(el);
  const text = visibleText(el);
  const evidence: Evidence[] = [];

  if (name.from === 'aria-label') evidence.push({ type: 'aria-label', value: name.value });
  else if (name.from === 'aria-labelledby') evidence.push({ type: 'aria-labelledby', value: name.value });
  else if (text) evidence.push({ type: 'button-text', value: text });
  else evidence.push({ type: 'button-text', value: name.value, origin: name.from });

  if (description.from === 'aria-description') {
    evidence.push({ type: 'aria-description', value: description.value });
  } else if (description.from === 'aria-describedby') {
    evidence.push({ type: 'aria-describedby', value: description.value });
  }

  const role = el.getAttribute('role');
  if (role) evidence.push({ type: 'role', value: role });

  const confidenceInput = {
    hasAriaLabel: name.from === 'aria-label' || name.from === 'aria-labelledby',
    hasAriaDescription: description.from === 'aria-description' || description.from === 'aria-describedby',
    allFieldsLabelled: false,
    someFieldsLabelled: false,
    isSemanticElement: el.tagName.toLowerCase() === 'button' || el.tagName.toLowerCase() === 'input',
    allFieldsNamed: false,
    hasExplicitText: Boolean(text),
    hasFieldDescriptions: false,
    fieldCount: 0,
    expectsFields: false,
  };
  const confidence = scoreConfidence(confidenceInput);

  if (confidence < threshold) return null;

  const classification = classifyRisk(name.value, description.value, text);
  const selector = buildSelector(el);
  const fingerprint = buildFingerprint(el);
  const region = resolveResultRegion(el);

  const candidate: CapabilityCandidate = {
    id: candidateId(selector, fingerprint),
    source: 'button',
    elementSelector: selector,
    fingerprint,
    name: uniqueToolName(normalizeToolName(name.value), taken),
    title: name.value,
    // Buttons take no input: their capability is the action itself.
    description: description.value ? asSentence(description.value) : asSentence(`${name.value} on the current page`),
    inputSchema: emptySchema(),
    confidence,
    risk: classification.risk,
    evidence,
    confidenceReasons: explainConfidence(confidenceInput),
  };

  if (region) candidate.resultSelector = region.selector;
  return candidate;
};

export const scanButtons = (root: ParentNode, options: ButtonScanOptions = {}): CapabilityCandidate[] => {
  const taken = options.takenNames ?? new Set<string>();
  return findButtonElements(root)
    .map((el) => scanButton(el, { ...options, takenNames: taken }))
    .filter((candidate): candidate is CapabilityCandidate => candidate !== null);
};
