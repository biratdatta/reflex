/** Tiny helpers. The demo app deliberately uses plain DOM and plain HTML. */
export const html = (strings: TemplateStringsArray, ...values: unknown[]): string =>
  strings.reduce((out, part, i) => out + part + (values[i] === undefined ? '' : String(values[i])), '');

export const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] as string,
  );

export const on = <K extends keyof HTMLElementEventMap>(
  selector: string,
  event: K,
  handler: (event: HTMLElementEventMap[K], element: HTMLElement) => void,
): void => {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) return;
  element.addEventListener(event, (raw) => handler(raw as HTMLElementEventMap[K], element));
};

export const formValues = (form: HTMLFormElement): Record<string, string> => {
  const values: Record<string, string> = {};
  for (const [key, value] of new FormData(form).entries()) values[key] = String(value);
  return values;
};

/**
 * Announce an outcome in the service's live region, the way a real service
 * would. Reflex reads this region back to the agent after a tool runs.
 */
export const announce = (message: string): void => {
  const region = document.getElementById('service-status');
  if (!region) return;
  region.innerHTML = message
    ? `<div class="inner"><div class="head">Service update</div><div class="body">${escapeHtml(message)}</div></div>`
    : '';
};
