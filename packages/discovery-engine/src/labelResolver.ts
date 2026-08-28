import type { FormControl } from '@reflex/schema-generator';
import { ariaDescribedByText, ariaDescription, ariaLabel, ariaLabelledByText } from './ariaResolver.js';
import { cleanText, humanize } from './naming.js';
import { cssEscape } from './selector.js';

export interface ControlLabel {
  label?: string;
  description?: string;
  from?: 'label-for' | 'label-wrapper' | 'aria-label' | 'aria-labelledby' | 'placeholder' | 'title' | 'name';
}

const labelElementText = (label: HTMLLabelElement | null): string => {
  if (!label) return '';
  const clone = label.cloneNode(true) as HTMLElement;
  // Drop the control itself when the label wraps it, so its value is not read as label text.
  clone.querySelectorAll('input, select, textarea, [aria-hidden="true"]').forEach((node) => node.remove());
  return cleanText(clone.textContent).replace(/[:*]\s*$/, '');
};

/**
 * Resolve the human label for a single form control:
 * <label for> -> wrapping <label> -> aria-label -> aria-labelledby -> placeholder -> title -> name.
 */
export const resolveControlLabel = (control: FormControl): ControlLabel => {
  const doc = control.ownerDocument;

  if (control.id) {
    const escaped = cssEscape(control.id);
    const explicit = doc.querySelector<HTMLLabelElement>(`label[for="${escaped}"]`);
    const text = labelElementText(explicit);
    if (text) return { label: text, description: resolveControlDescription(control), from: 'label-for' };
  }

  const wrapper = control.closest('label');
  const wrapperText = labelElementText(wrapper as HTMLLabelElement | null);
  if (wrapperText) {
    return { label: wrapperText, description: resolveControlDescription(control), from: 'label-wrapper' };
  }

  const aria = ariaLabel(control);
  if (aria) return { label: aria, description: resolveControlDescription(control), from: 'aria-label' };

  const labelledBy = ariaLabelledByText(control);
  if (labelledBy) {
    return { label: labelledBy, description: resolveControlDescription(control), from: 'aria-labelledby' };
  }

  const placeholder = cleanText(control.getAttribute('placeholder'));
  if (placeholder) {
    return { label: placeholder, description: resolveControlDescription(control), from: 'placeholder' };
  }

  const title = cleanText(control.getAttribute('title'));
  if (title) return { label: title, description: resolveControlDescription(control), from: 'title' };

  const name = control.getAttribute('name') || control.id;
  if (name) return { label: humanize(name), description: resolveControlDescription(control), from: 'name' };

  return { description: resolveControlDescription(control) };
};

/** Field-level help text: aria-description -> aria-describedby. */
export const resolveControlDescription = (control: FormControl): string | undefined => {
  const description = ariaDescription(control);
  if (description) return description;
  const describedBy = ariaDescribedByText(control);
  if (describedBy) return describedBy;
  return undefined;
};

/** True when the control has a real, authored label (not one synthesised from its name). */
export const hasAuthoredLabel = (control: FormControl): boolean => {
  const resolved = resolveControlLabel(control);
  return Boolean(resolved.label) && resolved.from !== 'name' && resolved.from !== 'placeholder';
};
