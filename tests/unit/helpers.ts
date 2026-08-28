/** Mount HTML into the jsdom document and hand back the document. */
export const mount = (html: string): Document => {
  document.body.innerHTML = html;
  return document;
};

export const el = <T extends Element>(selector: string): T => {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`No element for selector ${selector}`);
  return found;
};
