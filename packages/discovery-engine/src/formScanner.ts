import type { CapabilityCandidate, Evidence } from '@reflex/capability-model';
import { buildFormSchema, type FormSchemaResult } from '@reflex/schema-generator';
import { resolveAccessibleDescription, resolveAccessibleName } from './ariaResolver.js';
import { scoreConfidence } from './confidence.js';
import { isExcludedElement, shouldIgnoreLabel } from './ignoreRules.js';
import { hasAuthoredLabel, resolveControlLabel } from './labelResolver.js';
import { asSentence, humanize, normalizeToolName, uniqueToolName } from './naming.js';
import { resolveResultRegion } from './resultRegion.js';
import { buildFingerprint, buildSelector, candidateId } from './selector.js';
import { classifyRisk, escalateRisk } from './riskClassifier.js';

/** Forms, plus containers that act as forms via ARIA. */
export const findFormLikeElements = (root: ParentNode): Element[] => {
  const forms = Array.from(root.querySelectorAll('form, [role="form"], [role="search"]'));
  return forms.filter((form) => !isExcludedElement(form));
};

const describeFields = (result: FormSchemaResult): { text: string; labelled: number; described: number } => {
  const labelled = result.fields.filter((field) => field.labelled).length;
  const described = result.fields.filter((field) => field.description).length;
  const text = result.fields
    .map((field) => `${field.label ?? field.key}${field.required ? ' (required)' : ''}`)
    .join(', ');
  return { text, labelled, described };
};

const generatedDescription = (title: string, result: FormSchemaResult): string => {
  const { text } = describeFields(result);
  if (!text) return asSentence(`Submit the "${title}" form`);
  return asSentence(`${title} using ${text}`);
};

export interface ScanOptions {
  /** Names already taken in this scan, so tool names stay unique per page. */
  takenNames?: Set<string>;
}

export const scanForm = (form: Element, options: ScanOptions = {}): CapabilityCandidate | null => {
  const taken = options.takenNames ?? new Set<string>();
  const evidence: Evidence[] = [];

  const name = resolveAccessibleName(form, { useText: false });
  const description = resolveAccessibleDescription(form);

  // A form with neither a name nor addressable fields describes no capability.
  if (!name.value) return null;

  // Ignore rules apply only to weakly-sourced names; an authored aria-label is intentional.
  if (name.from === 'name' || name.from === 'id') {
    const verdict = shouldIgnoreLabel(name.value);
    if (verdict.ignored) return null;
  }

  const schemaResult = buildFormSchema(form, (control) => {
    const resolved = resolveControlLabel(control);
    return {
      // `labelled` must mean "the author wrote a label", not "we invented one from the name".
      label: hasAuthoredLabel(control) ? resolved.label : undefined,
      description: resolved.description,
      fallbackLabel: resolved.label,
    };
  });

  const title = name.value;
  const fieldNames = schemaResult.fields.map((field) => field.key);

  if (name.from === 'aria-label') evidence.push({ type: 'aria-label', value: name.value });
  else if (name.from === 'aria-labelledby') evidence.push({ type: 'aria-labelledby', value: name.value });
  else if (name.from === 'heading') evidence.push({ type: 'heading', value: name.value });
  else evidence.push({ type: 'form', value: name.value, origin: name.from });

  if (description.from === 'aria-description') {
    evidence.push({ type: 'aria-description', value: description.value });
  } else if (description.from === 'aria-describedby') {
    evidence.push({ type: 'aria-describedby', value: description.value });
  }

  evidence.push({
    type: 'form',
    value: form.tagName.toLowerCase() === 'form' ? '<form>' : `role="${form.getAttribute('role')}"`,
    origin: form.id ? `#${form.id}` : undefined,
  });

  for (const field of schemaResult.fields) {
    evidence.push({
      type: field.labelled ? 'label' : 'input',
      value: `${field.key}: ${field.label ?? humanize(field.key)}${field.required ? ' (required)' : ''}`,
      origin: field.type,
    });
  }

  const { labelled, described } = describeFields(schemaResult);
  const confidence = scoreConfidence({
    hasAriaLabel: name.from === 'aria-label' || name.from === 'aria-labelledby',
    hasAriaDescription: description.from === 'aria-description' || description.from === 'aria-describedby',
    allFieldsLabelled: schemaResult.fields.length > 0 && labelled === schemaResult.fields.length,
    someFieldsLabelled: labelled > 0,
    isSemanticElement: form.tagName.toLowerCase() === 'form',
    allFieldsNamed: schemaResult.fields.length > 0 && fieldNames.every(Boolean),
    hasExplicitText: Boolean(form.querySelector('button, input[type="submit"]')),
    hasFieldDescriptions: described > 0,
    fieldCount: schemaResult.fields.length,
    expectsFields: form.querySelectorAll('input, select, textarea').length > 0,
  });

  const classification = classifyRisk(name.value, description.value);
  const risk = escalateRisk(classification.risk, schemaResult.hasPasswordField);

  const selector = buildSelector(form);
  const fingerprint = buildFingerprint(form, fieldNames);
  const region = resolveResultRegion(form);

  const candidate: CapabilityCandidate = {
    id: candidateId(selector, fingerprint),
    source: 'form',
    elementSelector: selector,
    fingerprint,
    name: uniqueToolName(normalizeToolName(name.value), taken),
    title,
    description: description.value ? asSentence(description.value) : generatedDescription(title, schemaResult),
    inputSchema: schemaResult.schema,
    confidence,
    risk,
    evidence,
  };

  if (region) candidate.resultSelector = region.selector;
  if (schemaResult.hasPasswordField) {
    candidate.evidence.push({
      type: 'input',
      value: 'Password field present — excluded from schema, risk escalated to sensitive',
    });
  }

  return candidate;
};

export const scanForms = (root: ParentNode, options: ScanOptions = {}): CapabilityCandidate[] => {
  const taken = options.takenNames ?? new Set<string>();
  return findFormLikeElements(root)
    .map((form) => scanForm(form, { takenNames: taken }))
    .filter((candidate): candidate is CapabilityCandidate => candidate !== null);
};
