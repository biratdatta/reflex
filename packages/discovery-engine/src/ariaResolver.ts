import { cleanText } from './naming.js';

const idRefText = (el: Element, attribute: string): string => {
  const refs = el.getAttribute(attribute);
  if (!refs) return '';
  const doc = el.ownerDocument;
  return cleanText(
    refs
      .split(/\s+/)
      .filter(Boolean)
      .map((id) => doc.getElementById(id)?.textContent ?? '')
      .join(' '),
  );
};

export const ariaLabel = (el: Element): string => cleanText(el.getAttribute('aria-label'));

export const ariaLabelledByText = (el: Element): string => idRefText(el, 'aria-labelledby');

/**
 * `aria-description` is the newer sibling of `aria-describedby`; Reflex reads
 * both because a page may carry either.
 */
export const ariaDescription = (el: Element): string => cleanText(el.getAttribute('aria-description'));

export const ariaDescribedByText = (el: Element): string => idRefText(el, 'aria-describedby');

export const explicitRole = (el: Element): string => cleanText(el.getAttribute('role')).toLowerCase();

/** Visible text of a control, ignoring the text of nested icons marked aria-hidden. */
export const visibleText = (el: Element): string => {
  const clone = el.cloneNode(true) as Element;
  clone.querySelectorAll('[aria-hidden="true"], svg, script, style').forEach((node) => node.remove());
  return cleanText(clone.textContent);
};

/** Heading or legend that introduces a region, used as a fallback name for forms. */
export const regionHeading = (el: Element): string => {
  const legend = el.querySelector(':scope > fieldset > legend, :scope > legend');
  if (legend) return cleanText(legend.textContent);
  const heading = el.querySelector(':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > header h1, :scope > header h2, :scope > header h3');
  if (heading) return cleanText(heading.textContent);
  // A heading immediately preceding the element also reads as its name.
  const previous = el.previousElementSibling;
  if (previous && /^H[1-6]$/.test(previous.tagName)) return cleanText(previous.textContent);
  return '';
};

export interface NameResolution {
  value: string;
  /** Which signal produced the name — recorded as evidence. */
  from: 'aria-label' | 'aria-labelledby' | 'heading' | 'button-text' | 'name' | 'id' | 'none';
}

/**
 * Accessible-name resolution, in the priority the PRD specifies:
 * aria-label -> aria-labelledby -> heading/legend -> visible text -> name -> id.
 */
export const resolveAccessibleName = (el: Element, options: { useText?: boolean } = {}): NameResolution => {
  const label = ariaLabel(el);
  if (label) return { value: label, from: 'aria-label' };

  const labelledBy = ariaLabelledByText(el);
  if (labelledBy) return { value: labelledBy, from: 'aria-labelledby' };

  const heading = regionHeading(el);
  if (heading) return { value: heading, from: 'heading' };

  if (options.useText !== false) {
    const text = visibleText(el);
    if (text) return { value: text, from: 'button-text' };
    const value = cleanText(el.getAttribute('value'));
    if (value) return { value, from: 'button-text' };
    const title = cleanText(el.getAttribute('title'));
    if (title) return { value: title, from: 'button-text' };
  }

  const name = cleanText(el.getAttribute('name'));
  if (name) return { value: name, from: 'name' };

  const id = cleanText(el.getAttribute('id'));
  if (id) return { value: id, from: 'id' };

  return { value: '', from: 'none' };
};

export interface DescriptionResolution {
  value: string;
  from: 'aria-description' | 'aria-describedby' | 'help-text' | 'title' | 'none';
}

/**
 * Accessible-description resolution:
 * aria-description -> aria-describedby -> adjacent help text -> title.
 */
export const resolveAccessibleDescription = (el: Element): DescriptionResolution => {
  const description = ariaDescription(el);
  if (description) return { value: description, from: 'aria-description' };

  const describedBy = ariaDescribedByText(el);
  if (describedBy) return { value: describedBy, from: 'aria-describedby' };

  const help = el.querySelector(':scope > .hint, :scope > .help, :scope > [data-help], :scope > p');
  const helpText = help ? cleanText(help.textContent) : '';
  if (helpText) return { value: helpText, from: 'help-text' };

  const title = cleanText(el.getAttribute('title'));
  if (title) return { value: title, from: 'title' };

  return { value: '', from: 'none' };
};
