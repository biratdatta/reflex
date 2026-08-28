import { buildSelector } from './selector.js';

export interface ResultRegion {
  selector: string;
  from: 'aria-controls' | 'data-reflex-result' | 'live-region' | 'sibling-table';
}

/**
 * Find the region a control updates, so an executed tool can return what the
 * page actually showed instead of a bare "success".
 */
export const resolveResultRegion = (el: Element): ResultRegion | undefined => {
  const doc = el.ownerDocument;

  const controls = el.getAttribute('aria-controls');
  if (controls) {
    const target = controls
      .split(/\s+/)
      .map((id) => doc.getElementById(id))
      .find(Boolean);
    if (target) return { selector: buildSelector(target), from: 'aria-controls' };
  }

  const scope = el.closest('section, main, article, [role="region"], body') ?? doc.body;

  const marked = scope.querySelector('[data-reflex-result]');
  if (marked) return { selector: buildSelector(marked), from: 'data-reflex-result' };

  const live = scope.querySelector('[aria-live], [role="status"], output');
  if (live) return { selector: buildSelector(live), from: 'live-region' };

  const table = scope.querySelector('table, ul[role="list"], ol[role="list"]');
  if (table) return { selector: buildSelector(table), from: 'sibling-table' };

  return undefined;
};
