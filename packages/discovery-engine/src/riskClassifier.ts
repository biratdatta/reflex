import type { RiskLevel } from '@reflex/capability-model';

/**
 * Keyword rules. Deterministic and inspectable — no model involved.
 *
 * Sensitive terms are split in two, because whether a capability is dangerous
 * depends on what it *does*, not what it is about:
 *
 *   "Authorise payment"  → sensitive: the action moves money
 *   "Search payments"    → read:      the action only looks
 *   "Update bank details"→ sensitive: a write against a sensitive subject
 *
 * Lumping them together would flag every search form that mentions money or
 * access, and warnings people learn to ignore protect nobody.
 */
export const RISK_KEYWORDS = {
  read: [
    'search', 'find', 'view', 'show', 'list', 'get', 'filter', 'check', 'lookup', 'look up',
    'browse', 'display', 'track', 'trace', 'download', 'export', 'print', 'preview', 'calculate',
    'estimate',
  ],
  write: [
    'create', 'add', 'update', 'edit', 'change', 'assign', 'save', 'submit', 'set', 'move',
    'rename', 'import', 'upload', 'invite', 'file', 'lodge', 'register', 'request', 'renew',
    'record', 'book', 'schedule', 'amend', 'attach', 'start', 'apply', 'link', 'draft',
  ],
  /** The act itself is consequential: money, credentials, outbound messages. */
  sensitiveActions: [
    'approve', 'authorise', 'authorize', 'publish', 'send', 'reset', 'grant', 'transfer', 'pay',
    'disburse', 'refund', 'sign', 'certify', 'escalate', 'verify identity',
  ],
  /** The subject matter is sensitive; risk then depends on the verb. */
  sensitiveSubjects: [
    'password', 'passcode', 'pin', 'credential', 'secret', 'token', 'permission', 'role',
    'payment', 'payout', 'billing', 'invoice', 'bank', 'iban', 'sort code', 'card details',
    'access', 'salary', 'compensation', 'ssn', 'tax id', 'national insurance number',
  ],
  destructive: [
    'delete', 'remove', 'deactivate', 'disable', 'revoke', 'terminate', 'cancel', 'archive',
    'purge', 'wipe', 'destroy', 'offboard', 'suspend', 'withdraw', 'void', 'rescind', 'close account',
  ],
} as const;

export interface RiskClassification {
  risk: RiskLevel;
  /** The keyword that decided it, for display in the inspector. */
  matched?: string;
  /** How the decision was reached, so a surprising result can be understood. */
  reason?: string;
  /** False when nothing matched and the default was applied. */
  classified: boolean;
}

/**
 * Keywords match as prefixes, so "revoke" also catches "revoked" and "cancel"
 * catches "cancelled". Short verbs cannot afford that: prefix-matching "pay"
 * hits "payments", and "set" hits "settlement". Those match whole words only,
 * with common inflections.
 */
const WHOLE_WORD_ONLY = new Set([
  'pay', 'set', 'add', 'file', 'link', 'start', 'apply', 'record', 'move', 'get', 'print',
  'sign', 'draft', 'access', 'pin', 'save', 'edit', 'view', 'show', 'list', 'track', 'trace',
]);

const keywordPattern = (keyword: string): RegExp =>
  new RegExp(WHOLE_WORD_ONLY.has(keyword) ? `\\b${keyword}(?:s|d|es|ed|ing)?\\b` : `\\b${keyword}`, 'i');

const findKeyword = (haystack: string, keywords: readonly string[]): string | undefined =>
  keywords.find((keyword) => keywordPattern(keyword).test(haystack));

/**
 * The earliest matching keyword, with its position.
 *
 * Position matters because these labels are imperative phrases, so the leading
 * verb is the action: "View claim record" is a read even though "record" is
 * also a write verb, and "List documents recorded against this claim" is a read
 * even though its description contains "recorded".
 */
const firstKeyword = (
  haystack: string,
  keywords: readonly string[],
): { index: number; matched?: string } => {
  let index = -1;
  let matched: string | undefined;
  for (const keyword of keywords) {
    const found = keywordPattern(keyword).exec(haystack);
    if (found && (index === -1 || found.index < index)) {
      index = found.index;
      matched = keyword;
    }
  }
  return { index, matched };
};

/**
 * Classify from the capability's own words, most-dangerous-first, so
 * "Search and revoke access" is treated as destructive and never as read.
 * Unknown wording defaults to `write`, per the PRD.
 */
export const classifyRisk = (...texts: Array<string | undefined>): RiskClassification => {
  const haystack = texts.filter(Boolean).join(' ').toLowerCase();

  const destructive = findKeyword(haystack, RISK_KEYWORDS.destructive);
  if (destructive) {
    return { risk: 'destructive', matched: destructive, reason: 'destructive verb', classified: true };
  }

  const sensitiveAction = findKeyword(haystack, RISK_KEYWORDS.sensitiveActions);
  if (sensitiveAction) {
    return { risk: 'sensitive', matched: sensitiveAction, reason: 'consequential action', classified: true };
  }

  const write = firstKeyword(haystack, RISK_KEYWORDS.write);
  const read = firstKeyword(haystack, RISK_KEYWORDS.read);
  const subject = findKeyword(haystack, RISK_KEYWORDS.sensitiveSubjects);

  // Whichever verb leads the phrase is the action being described.
  const writeLeads = write.index !== -1 && (read.index === -1 || write.index < read.index);
  const readLeads = read.index !== -1 && (write.index === -1 || read.index < write.index);

  // A write against a sensitive subject is sensitive; merely reading one is not.
  if (subject && writeLeads) {
    return { risk: 'sensitive', matched: subject, reason: `writes to "${subject}"`, classified: true };
  }
  if (writeLeads) return { risk: 'write', matched: write.matched, reason: 'write verb', classified: true };
  if (readLeads) return { risk: 'read', matched: read.matched, reason: 'read verb', classified: true };
  if (subject) {
    return { risk: 'sensitive', matched: subject, reason: `mentions "${subject}"`, classified: true };
  }

  return { risk: 'write', reason: 'no keyword matched — defaulting to write', classified: false };
};

/** A form cannot be classified read-only if it also carries a password field. */
export const escalateRisk = (risk: RiskLevel, hasPasswordField: boolean): RiskLevel => {
  if (!hasPasswordField) return risk;
  return risk === 'destructive' ? risk : 'sensitive';
};

export const requiresHumanApproval = (risk: RiskLevel): boolean =>
  risk === 'destructive' || risk === 'sensitive';
