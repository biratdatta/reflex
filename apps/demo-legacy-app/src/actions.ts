import { formValues } from './dom.js';

type SubmitHandler = (values: Record<string, string>, form: HTMLFormElement) => void;
type ClickHandler = (element: HTMLElement) => void;

/**
 * Handlers are registered by form id / data-action and dispatched from a single
 * delegated listener, so a re-render never needs to re-bind anything.
 */
export const submitHandlers = new Map<string, SubmitHandler>();
export const clickHandlers = new Map<string, ClickHandler>();

document.addEventListener('submit', (event) => {
  const form = event.target as HTMLFormElement;
  const handler = form.id ? submitHandlers.get(form.id) : undefined;
  if (!handler) return;
  event.preventDefault();
  handler(formValues(form), form);
});

document.addEventListener('click', (event) => {
  const trigger = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-action]');
  if (!trigger) return;
  const handler = clickHandlers.get(trigger.dataset.action ?? '');
  if (!handler) return;
  event.preventDefault();
  handler(trigger);
});
