import type { CapabilityCandidate, TriageCounts } from '@reflex/capability-model';

/**
 * Triage exists because discovery is not the hard part — *review* is.
 *
 * A scan of one YouTube watch page yields 57 candidates, every one scoring
 * exactly 55%, named `1_reply`, `150_replies`, `166_replies`: the "N replies"
 * button on every comment. Nobody reviews that list, so a wall of candidates is
 * the same as no candidates.
 *
 * A flat confidence floor is the wrong instrument. Real, working capabilities on
 * well-built government forms also score 50–60% — Companies House's
 * `search_the_register` and the NHS pharmacy finder both do — because those
 * pages never wrote an `aria-description`. Raising the floor to 70 would hide
 * them alongside the noise.
 *
 * What separates the two is the *source*, not the score:
 *
 *   a form candidate arrives with a typed schema — labelled, named fields that
 *   are evidence in themselves, and something a reviewer can actually judge;
 *
 *   a button candidate is an unparameterised action inferred from two words of
 *   label, so it needs corroboration (a description) before it earns a row.
 *
 * Hence two floors, and a few structural rules besides.
 */

export interface TriageOptions {
  /** Minimum confidence for a form candidate. Forms carry a schema. */
  formFloor?: number;
  /** Minimum confidence for a button candidate. Buttons must earn their row. */
  buttonFloor?: number;
  /** Skip every floor and rule, and return the raw scan. */
  showEverything?: boolean;
}

export type { TriageCounts };

export interface TriageResult {
  candidates: CapabilityCandidate[];
  /** Held back, each carrying `suppressedReason`. Available behind "show all". */
  suppressed: CapabilityCandidate[];
  counts: TriageCounts;
}

export const DEFAULT_FORM_FLOOR = 50;
export const DEFAULT_BUTTON_FLOOR = 70;

/** Trailing digits are how uniqueToolName disambiguates: show_cards_3 -> show_cards. */
export const nameStem = (name: string): string => name.replace(/_\d+$/, '');

/**
 * A label that begins with a number was a count, not a capability: "1 reply",
 * "166 replies", "349 languages". No agent can use those, and no reviewer
 * should have to read 40 of them.
 */
const startsWithCount = (candidate: CapabilityCandidate): boolean => /^\d/.test(candidate.name);

/** Candidates the page gives no way to tell apart. */
const duplicateKey = (candidate: CapabilityCandidate): string =>
  [
    nameStem(candidate.name),
    candidate.risk,
    candidate.source,
    Object.keys(candidate.inputSchema.properties).sort().join(','),
  ].join('|');

export const triageCandidates = (
  candidates: CapabilityCandidate[],
  options: TriageOptions = {},
): TriageResult => {
  const formFloor = options.formFloor ?? DEFAULT_FORM_FLOOR;
  const buttonFloor = options.buttonFloor ?? DEFAULT_BUTTON_FLOOR;

  if (options.showEverything) {
    return {
      candidates,
      suppressed: [],
      counts: {
        total: candidates.length,
        shown: candidates.length,
        hiddenWeak: 0,
        hiddenDuplicate: 0,
        hiddenUnnameable: 0,
      },
    };
  }

  const kept: CapabilityCandidate[] = [];
  const suppressed: CapabilityCandidate[] = [];
  const counts: TriageCounts = {
    total: candidates.length,
    shown: 0,
    hiddenWeak: 0,
    hiddenDuplicate: 0,
    hiddenUnnameable: 0,
  };

  /** duplicateKey -> index in `kept` of the instance that represents the group. */
  const primaryOf = new Map<string, number>();

  for (const candidate of candidates) {
    const floor = candidate.source === 'form' ? formFloor : buttonFloor;

    if (startsWithCount(candidate)) {
      counts.hiddenUnnameable += 1;
      suppressed.push({
        ...candidate,
        suppressed: true,
        suppressedReason: 'Its label is a count, not a capability',
      });
      continue;
    }

    if (candidate.confidence < floor) {
      counts.hiddenWeak += 1;
      suppressed.push({
        ...candidate,
        suppressed: true,
        suppressedReason:
          candidate.source === 'form'
            ? `Scored ${candidate.confidence}%, below the ${floor}% floor for forms`
            : `Scored ${candidate.confidence}%, below the ${floor}% floor for buttons — an action with no arguments needs a description to be worth registering`,
      });
      continue;
    }

    const key = duplicateKey(candidate);
    const primaryIndex = primaryOf.get(key);
    if (primaryIndex !== undefined) {
      const primary = kept[primaryIndex];
      kept[primaryIndex] = { ...primary, duplicateCount: (primary.duplicateCount ?? 1) + 1 };
      counts.hiddenDuplicate += 1;
      suppressed.push({
        ...candidate,
        suppressed: true,
        suppressedReason: `The page has ${(kept[primaryIndex].duplicateCount ?? 2)} controls it does not distinguish; this is one of them`,
      });
      continue;
    }

    primaryOf.set(key, kept.length);
    kept.push(candidate);
  }

  counts.shown = kept.length;
  return { candidates: kept, suppressed, counts };
};
