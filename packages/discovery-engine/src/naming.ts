/** Tool names are snake_case, per the WebMCP tool naming convention. */
export function normalizeToolName(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** "employeeName" | "employee-name" | "employee_name" -> "Employee name" */
export function humanize(input: string): string {
  const spaced = input
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!spaced) return '';
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

/** Collapse whitespace and strip the decorative characters ARIA labels pick up. */
export function cleanText(input: string | null | undefined): string {
  if (!input) return '';
  return input
    .replace(/\s+/g, ' ')
    .replace(/[\u200b-\u200d\ufeff]/g, '')
    .trim();
}

/**
 * Ensure a tool name is unique within a page scan, since WebMCP tool names
 * must be unique per registration.
 */
export function uniqueToolName(base: string, taken: Set<string>): string {
  const name = base || 'unnamed_capability';
  if (!taken.has(name)) {
    taken.add(name);
    return name;
  }
  let n = 2;
  while (taken.has(`${name}_${n}`)) n += 1;
  const unique = `${name}_${n}`;
  taken.add(unique);
  return unique;
}

/** Sentence-case a description and give it terminal punctuation. */
export function asSentence(input: string): string {
  const text = cleanText(input);
  if (!text) return '';
  const capitalized = text.charAt(0).toUpperCase() + text.slice(1);
  return /[.!?]$/.test(capitalized) ? capitalized : `${capitalized}.`;
}
