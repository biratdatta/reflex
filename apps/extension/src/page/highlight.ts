const STYLE_ID = 'reflex-highlight-style';
const CLASS = 'reflex-highlighted-element';

const ensureStyle = (doc: Document): void => {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .${CLASS} {
      outline: 3px solid #6ee7b7 !important;
      outline-offset: 2px !important;
      box-shadow: 0 0 0 6px rgba(110, 231, 183, .25) !important;
      transition: outline-color .2s ease;
    }
  `;
  doc.head.append(style);
};

/** Flash the element a candidate came from, so a reviewer can see what they are approving. */
export const highlight = (doc: Document, selector: string): boolean => {
  let element: Element | null = null;
  try {
    element = doc.querySelector(selector);
  } catch {
    return false;
  }
  if (!element) return false;

  ensureStyle(doc);
  element.classList.add(CLASS);
  element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  window.setTimeout(() => element?.classList.remove(CLASS), 2200);
  return true;
};
