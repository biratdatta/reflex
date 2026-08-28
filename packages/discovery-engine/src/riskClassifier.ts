import type { RiskLevel } from '@reflex/capability-model';

/**
 * Keyword rules. Deterministic and inspectable — no model involved.
 *
 * Sensitive terms name the *act* ("send", "approve"), not the subject matter:
 * "email" as a keyword would flag every search form that mentions an email
 * address, which is a false positive that trains people to ignore the warning.
 */
export const RISK_KEYWORDS: Record<Exclude<RiskLevel, 'write'> | 'write', string[]> = {
  read: ['search', 'find', 'view', 'show', 'list', 'get', 'filter', 'check', 'lookup', 'browse', 'export', 'download'],
  write: ['create', 'add', 'update', 'edit', 'change', 'assign', 'save', 'submit', 'set', 'move', 'transfer', 'rename', 'import', 'upload', 'invite'],
  sensitive: ['password', 'credential', 'secret', 'token', 'permission', 'role', 'payment', 'billing', 'invoice', 'access', 'approve', 'publish', 'send', 'salary', 'compensation', 'ssn'],
  destructive: ['delete', 'remove', 'deactivate', 'disable', 'revoke', 'terminate', 'cancel', 'archive', 'purge', 'wipe', 'destroy', 'offboard', 'suspend'],
};

export interface RiskClassification {
  risk: RiskLevel;
  /** The keyword that decided it, for display in the inspector. */
  matched?: string;
  /** False when nothing matched and the default was applied. */
  classified: boolean;
}

const findKeyword = (haystack: string, keywords: string[]): string | undefined =>
  keywords.find((keyword) => new RegExp(`\\b${keyword}`, 'i').test(haystack));

/**
 * Classify from the tool's own words. Checked most-dangerous first so
 * "Revoke and search access" is treated as destructive, never as read.
 * Unknown defaults to `write`, per the PRD.
 */
export const classifyRisk = (...texts: Array<string | undefined>): RiskClassification => {
  const haystack = texts.filter(Boolean).join(' ').toLowerCase();

  const destructive = findKeyword(haystack, RISK_KEYWORDS.destructive);
  if (destructive) return { risk: 'destructive', matched: destructive, classified: true };

  const sensitive = findKeyword(haystack, RISK_KEYWORDS.sensitive);
  if (sensitive) return { risk: 'sensitive', matched: sensitive, classified: true };

  const write = findKeyword(haystack, RISK_KEYWORDS.write);
  if (write) return { risk: 'write', matched: write, classified: true };

  const read = findKeyword(haystack, RISK_KEYWORDS.read);
  if (read) return { risk: 'read', matched: read, classified: true };

  return { risk: 'write', classified: false };
};

/** A form that only reads cannot be classified read if it also carries a password field. */
export const escalateRisk = (risk: RiskLevel, hasPasswordField: boolean): RiskLevel => {
  if (!hasPasswordField) return risk;
  return risk === 'destructive' ? risk : 'sensitive';
};

export const requiresHumanApproval = (risk: RiskLevel): boolean =>
  risk === 'destructive' || risk === 'sensitive';
