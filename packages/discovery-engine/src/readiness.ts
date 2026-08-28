import { READINESS_WEIGHTS, type CapabilityCandidate, type ReadinessScore } from '@reflex/capability-model';
import { isFormControl, isExposableControl } from '@reflex/schema-generator';
import { resolveAccessibleName } from './ariaResolver.js';
import { hasAuthoredLabel } from './labelResolver.js';
import { classifyRisk } from './riskClassifier.js';

const INTERACTIVE = 'button, a[href], input, select, textarea, [role="button"], [role="link"], [role="checkbox"], [role="switch"], [onclick]';
const SEMANTIC_TAGS = new Set(['button', 'a', 'input', 'select', 'textarea', 'form', 'label', 'summary']);

const ratio = (numerator: number, denominator: number): number =>
  denominator === 0 ? 0 : numerator / denominator;

/**
 * A product signal, not an industry standard: how much of this page's
 * interactive surface carries enough semantics for Reflex to work with.
 */
export const scoreReadiness = (root: ParentNode, candidates: CapabilityCandidate[]): ReadinessScore => {
  const interactive = Array.from(root.querySelectorAll(INTERACTIVE));
  const semantic = interactive.filter((el) => SEMANTIC_TAGS.has(el.tagName.toLowerCase()));
  const named = interactive.filter((el) => resolveAccessibleName(el).value !== '');

  const formFields = Array.from(root.querySelectorAll('form input, form select, form textarea'))
    .filter(isFormControl)
    .filter(isExposableControl);
  const goodFields = formFields.filter((control) => hasAuthoredLabel(control) && Boolean(control.getAttribute('name')));

  const meanConfidence = candidates.length
    ? candidates.reduce((sum, candidate) => sum + candidate.confidence, 0) / candidates.length / 100
    : 0;

  const classifiable = candidates.filter(
    (candidate) => classifyRisk(candidate.title, candidate.description).classified,
  );

  const breakdown = {
    semanticControls: ratio(semantic.length, interactive.length),
    ariaCoverage: ratio(named.length, interactive.length),
    formQuality: ratio(goodFields.length, formFields.length),
    capabilityConfidence: meanConfidence,
    safetyClassification: ratio(classifiable.length, candidates.length),
  };

  const score = Math.round(
    Object.entries(breakdown).reduce(
      (sum, [key, value]) => sum + value * READINESS_WEIGHTS[key as keyof typeof breakdown] * 100,
      0,
    ),
  );

  return {
    score: Math.max(0, Math.min(100, score)),
    breakdown,
    counts: {
      interactiveControls: interactive.length,
      semanticControls: semantic.length,
      namedControls: named.length,
      formFields: formFields.length,
      labelledFormFields: goodFields.length,
      candidates: candidates.length,
    },
  };
};
