import type { Evidence } from '@reflex/capability-model';

/** Heuristic weights from the PRD's confidence engine. */
export const CONFIDENCE_SIGNALS = {
  ariaLabel: 30,
  ariaDescription: 20,
  associatedLabel: 15,
  semanticForm: 15,
  inputNames: 10,
  explicitButtonText: 10,
  fieldDescriptions: 10,
} as const;

export interface ConfidenceInput {
  hasAriaLabel: boolean;
  hasAriaDescription: boolean;
  /** Every exposed field resolved to an authored label. */
  allFieldsLabelled: boolean;
  /** Some, but not all, fields resolved to an authored label. */
  someFieldsLabelled: boolean;
  isSemanticElement: boolean;
  allFieldsNamed: boolean;
  hasExplicitText: boolean;
  hasFieldDescriptions: boolean;
  /** A candidate with no addressable fields is a weaker guess. */
  fieldCount: number;
  expectsFields: boolean;
}

export type ConfidenceBand = 'high' | 'review' | 'low' | 'ignore';

export const IGNORE_THRESHOLD = 50;

export const confidenceBand = (score: number): ConfidenceBand => {
  if (score >= 90) return 'high';
  if (score >= 75) return 'review';
  if (score >= IGNORE_THRESHOLD) return 'low';
  return 'ignore';
};

export const scoreConfidence = (input: ConfidenceInput): number => {
  let score = 0;
  if (input.hasAriaLabel) score += CONFIDENCE_SIGNALS.ariaLabel;
  if (input.hasAriaDescription) score += CONFIDENCE_SIGNALS.ariaDescription;
  if (input.allFieldsLabelled) score += CONFIDENCE_SIGNALS.associatedLabel;
  else if (input.someFieldsLabelled) score += Math.round(CONFIDENCE_SIGNALS.associatedLabel / 2);
  if (input.isSemanticElement) score += CONFIDENCE_SIGNALS.semanticForm;
  if (input.allFieldsNamed) score += CONFIDENCE_SIGNALS.inputNames;
  if (input.hasExplicitText) score += CONFIDENCE_SIGNALS.explicitButtonText;
  if (input.hasFieldDescriptions) score += CONFIDENCE_SIGNALS.fieldDescriptions;

  // A form that declares fields but exposes none is probably not understood correctly.
  if (input.expectsFields && input.fieldCount === 0) score -= 20;

  return Math.max(0, Math.min(100, score));
};

/**
 * Say what a candidate is missing, in the reviewer's terms. A bare "55%" tells
 * someone nothing about whether to trust it; "no ARIA description, no fields"
 * tells them exactly what the page failed to declare.
 */
export const explainConfidence = (input: ConfidenceInput): string[] => {
  const missing: string[] = [];
  if (!input.hasAriaLabel) missing.push('no ARIA label');
  if (!input.hasAriaDescription) missing.push('no ARIA description');
  if (input.expectsFields && !input.allFieldsLabelled) {
    missing.push(input.someFieldsLabelled ? 'some fields unlabelled' : 'no field labels');
  }
  if (!input.isSemanticElement) missing.push('not a semantic element');
  if (input.expectsFields && !input.allFieldsNamed) missing.push('fields without name attributes');
  if (!input.hasExplicitText) missing.push('no visible label text');
  if (input.expectsFields && input.fieldCount === 0) missing.push('declares fields but exposes none');
  if (!input.expectsFields && input.fieldCount === 0) missing.push('takes no arguments');
  return missing;
};

export const confidenceFromEvidence = (evidence: Evidence[]): number =>
  scoreConfidence({
    hasAriaLabel: evidence.some((e) => e.type === 'aria-label'),
    hasAriaDescription: evidence.some((e) => e.type === 'aria-description' || e.type === 'aria-describedby'),
    allFieldsLabelled: evidence.some((e) => e.type === 'label'),
    someFieldsLabelled: evidence.some((e) => e.type === 'label'),
    isSemanticElement: evidence.some((e) => e.type === 'form'),
    allFieldsNamed: evidence.some((e) => e.type === 'input'),
    hasExplicitText: evidence.some((e) => e.type === 'button-text'),
    hasFieldDescriptions: false,
    fieldCount: evidence.filter((e) => e.type === 'input').length,
    expectsFields: false,
  });
