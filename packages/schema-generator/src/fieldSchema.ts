import type { JSONSchemaProperty } from '@reflex/capability-model';

export type FormControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

/** Input types that carry no agent-settable value, or that we refuse to expose. */
const NON_DATA_INPUT_TYPES = new Set(['submit', 'reset', 'button', 'image', 'hidden', 'file']);

/**
 * Password fields are excluded from generated schemas on purpose: a generated
 * tool should never invite an agent to type a credential. The presence of one
 * still escalates the candidate's risk (see riskClassifier).
 */
const EXCLUDED_INPUT_TYPES = new Set(['password']);

export const isFormControl = (el: Element): el is FormControl =>
  el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement;

export const inputType = (el: FormControl): string =>
  el instanceof HTMLInputElement ? (el.getAttribute('type') || 'text').toLowerCase() : el.tagName.toLowerCase();

export const isExposableControl = (el: FormControl): boolean => {
  if (el.disabled) return false;
  if (el instanceof HTMLInputElement) {
    const type = inputType(el);
    if (NON_DATA_INPUT_TYPES.has(type)) return false;
    if (EXCLUDED_INPUT_TYPES.has(type)) return false;
  }
  return true;
};

export const containsPasswordField = (root: ParentNode): boolean =>
  root.querySelector('input[type="password" i]') !== null;

/** The property key an agent will use, and the key execution looks up in the DOM. */
export const fieldKey = (el: FormControl): string => el.getAttribute('name') || el.id || '';

const numberAttr = (el: Element, attr: string): number | undefined => {
  const raw = el.getAttribute(attr);
  if (raw === null || raw.trim() === '') return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
};

const optionValues = (select: HTMLSelectElement) => {
  const options = Array.from(select.options).filter(
    // A blank first option is a placeholder ("Any department"), not a real value.
    (option) => option.value !== '',
  );
  return {
    values: options.map((option) => option.value),
    labels: options.map((option) => (option.textContent || option.value).trim()),
  };
};

const withStringConstraints = (el: FormControl, property: JSONSchemaProperty): JSONSchemaProperty => {
  const minLength = numberAttr(el, 'minlength');
  const maxLength = numberAttr(el, 'maxlength');
  const pattern = el.getAttribute('pattern');
  if (minLength !== undefined) property.minLength = minLength;
  if (maxLength !== undefined) property.maxLength = maxLength;
  // Only carry patterns that are valid standalone regexes; HTML anchors implicitly.
  if (pattern) {
    try {
      new RegExp(pattern);
      property.pattern = pattern;
    } catch {
      /* unusable pattern — omit rather than emit an invalid schema */
    }
  }
  return property;
};

const withNumberConstraints = (el: FormControl, property: JSONSchemaProperty): JSONSchemaProperty => {
  const min = numberAttr(el, 'min');
  const max = numberAttr(el, 'max');
  if (min !== undefined) property.minimum = min;
  if (max !== undefined) property.maximum = max;
  const step = el.getAttribute('step');
  if (step && step !== 'any' && Number.isInteger(Number(step))) property.type = 'integer';
  return property;
};

/**
 * Map one control to a JSON Schema property. `radioGroup` carries the sibling
 * radios sharing this control's name, since a group maps to a single enum.
 */
export const controlToProperty = (
  el: FormControl,
  options: { description?: string; radioGroup?: HTMLInputElement[]; groupLabels?: string[] } = {},
): JSONSchemaProperty | null => {
  if (!isExposableControl(el)) return null;
  const description = options.description?.trim() || undefined;
  const base = (property: JSONSchemaProperty): JSONSchemaProperty =>
    description ? { ...property, description } : property;

  if (el instanceof HTMLSelectElement) {
    const { values, labels } = optionValues(el);
    const property: JSONSchemaProperty = el.multiple
      ? { type: 'array', items: { type: 'string', enum: values } }
      : { type: 'string', enum: values };
    if (labels.some((label, i) => label !== values[i])) {
      property['x-reflex-enumLabels'] = labels;
    }
    return base(property);
  }

  if (el instanceof HTMLTextAreaElement) {
    return base(withStringConstraints(el, { type: 'string' }));
  }

  const type = inputType(el);

  switch (type) {
    case 'checkbox': {
      const group = options.radioGroup ?? [];
      if (group.length > 1) {
        const values = group.map((box) => box.value || 'on');
        return base({ type: 'array', items: { type: 'string', enum: values } });
      }
      return base({ type: 'boolean', default: el.checked || undefined });
    }
    case 'radio': {
      const group = options.radioGroup ?? [el];
      const values = group.map((radio) => radio.value).filter((value) => value !== '');
      const labels = (options.groupLabels ?? values).map((label) => label.trim());
      const property: JSONSchemaProperty = { type: 'string', enum: values };
      if (labels.some((label, i) => label !== values[i])) property['x-reflex-enumLabels'] = labels;
      return base(property);
    }
    case 'number':
    case 'range':
      return base(withNumberConstraints(el, { type: 'number' }));
    case 'email':
      return base(withStringConstraints(el, { type: 'string', format: 'email' }));
    case 'url':
      return base(withStringConstraints(el, { type: 'string', format: 'uri' }));
    case 'date':
      return base({ type: 'string', format: 'date' });
    case 'datetime-local':
      return base({ type: 'string' });
    case 'time':
      return base({ type: 'string', format: 'time' });
    case 'month':
    case 'week':
      return base({ type: 'string' });
    default:
      return base(withStringConstraints(el, { type: 'string' }));
  }
};
