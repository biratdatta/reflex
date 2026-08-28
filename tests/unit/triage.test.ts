import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BUTTON_FLOOR,
  DEFAULT_FORM_FLOOR,
  discoverCapabilities,
  nameStem,
  triageCandidates,
} from '@reflex/discovery-engine';
import type { CapabilityCandidate } from '@reflex/capability-model';
import { mount } from './helpers.js';

const candidate = (over: Partial<CapabilityCandidate> = {}): CapabilityCandidate => ({
  id: over.id ?? Math.random().toString(36).slice(2),
  source: 'button',
  elementSelector: '#x',
  fingerprint: { tag: 'button' },
  name: 'do_thing',
  title: 'Do thing',
  description: 'Does the thing.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  confidence: 80,
  risk: 'write',
  evidence: [],
  ...over,
});

describe('the two floors', () => {
  it('judges a form by a lower bar than a button, because a form brings a schema', () => {
    expect(DEFAULT_FORM_FLOOR).toBe(50);
    expect(DEFAULT_BUTTON_FLOOR).toBe(70);
  });

  it('keeps a 50% form — real government search forms score exactly this', () => {
    const form = candidate({
      source: 'form',
      name: 'search_the_register',
      confidence: 50,
      inputSchema: { type: 'object', properties: { q: { type: 'string' } }, additionalProperties: false },
    });
    const { candidates, counts } = triageCandidates([form]);
    expect(candidates.map((entry) => entry.name)).toEqual(['search_the_register']);
    expect(counts).toMatchObject({ total: 1, shown: 1, hiddenWeak: 0 });
  });

  it('holds back a 55% button, and explains what it would have needed', () => {
    const button = candidate({ source: 'button', name: 'show_cards', confidence: 55 });
    const { candidates, suppressed, counts } = triageCandidates([button]);

    expect(candidates).toEqual([]);
    expect(counts.hiddenWeak).toBe(1);
    expect(suppressed[0].suppressed).toBe(true);
    expect(suppressed[0].suppressedReason).toContain('below the 70% floor for buttons');
    expect(suppressed[0].suppressedReason).toContain('needs a description');
  });

  it('keeps a button that carries a description, which is what lifts it to 75%', () => {
    const button = candidate({ source: 'button', name: 'withdraw_claim', confidence: 75 });
    expect(triageCandidates([button]).candidates).toHaveLength(1);
  });

  it('respects custom floors', () => {
    const button = candidate({ source: 'button', confidence: 55 });
    expect(triageCandidates([button], { buttonFloor: 50 }).candidates).toHaveLength(1);
  });
});

describe('labels that are counts', () => {
  it('holds back "1 reply", "166 replies", "349 languages"', () => {
    const noise = ['1_reply', '166_replies', '349_languages'].map((name) =>
      candidate({ name, confidence: 90, source: 'button' }),
    );
    const { candidates, suppressed, counts } = triageCandidates(noise);

    expect(candidates).toEqual([]);
    expect(counts.hiddenUnnameable).toBe(3);
    expect(suppressed[0].suppressedReason).toBe('Its label is a count, not a capability');
  });

  it('does not mistake a name that merely contains a digit', () => {
    const fine = candidate({ name: 'search_form_2', confidence: 90, source: 'form' });
    expect(triageCandidates([fine]).candidates).toHaveLength(1);
  });
});

describe('duplicates the page does not distinguish', () => {
  const trio = () => [
    candidate({ id: 'a', name: 'show_cards', confidence: 90 }),
    candidate({ id: 'b', name: 'show_cards_2', confidence: 90 }),
    candidate({ id: 'c', name: 'show_cards_3', confidence: 90 }),
  ];

  it('collapses them to one row carrying a count', () => {
    const { candidates, counts } = triageCandidates(trio());
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ id: 'a', name: 'show_cards', duplicateCount: 3 });
    expect(counts).toMatchObject({ total: 3, shown: 1, hiddenDuplicate: 2 });
  });

  it('explains the collapse on the ones held back', () => {
    const { suppressed } = triageCandidates(trio());
    expect(suppressed).toHaveLength(2);
    expect(suppressed[0].suppressedReason).toContain('does not distinguish');
  });

  it('keeps candidates apart when their schemas differ', () => {
    const { candidates } = triageCandidates([
      candidate({ id: 'a', name: 'search', confidence: 90, source: 'form' }),
      candidate({
        id: 'b',
        name: 'search_2',
        confidence: 90,
        source: 'form',
        inputSchema: { type: 'object', properties: { q: { type: 'string' } }, additionalProperties: false },
      }),
    ]);
    expect(candidates).toHaveLength(2);
  });

  it('keeps candidates apart when their risk differs', () => {
    const { candidates } = triageCandidates([
      candidate({ id: 'a', name: 'remove_item', confidence: 90, risk: 'destructive' }),
      candidate({ id: 'b', name: 'remove_item_2', confidence: 90, risk: 'write' }),
    ]);
    expect(candidates).toHaveLength(2);
  });

  it('strips the disambiguating suffix to find the stem', () => {
    expect(nameStem('show_cards_3')).toBe('show_cards');
    expect(nameStem('show_cards')).toBe('show_cards');
    expect(nameStem('search_form_2')).toBe('search_form');
  });
});

describe('showEverything', () => {
  it('returns the raw scan, for the "show all" view', () => {
    const noise = [
      candidate({ name: '1_reply', confidence: 55 }),
      candidate({ name: 'show_cards', confidence: 55 }),
    ];
    const { candidates, suppressed, counts } = triageCandidates(noise, { showEverything: true });
    expect(candidates).toHaveLength(2);
    expect(suppressed).toEqual([]);
    expect(counts).toMatchObject({ total: 2, shown: 2 });
  });
});

describe('discoverCapabilities reports what it held back', () => {
  it('returns counts alongside the survivors', () => {
    mount(`
      <form id="f" aria-label="Search claims" aria-description="Find a claim by reference">
        <label for="q">Reference</label><input id="q" name="query" required>
        <button type="submit">Search</button>
      </form>
      <button aria-label="Show cards">Show cards</button>
      <button aria-label="Show cards">Show cards</button>
      <button aria-label="166 replies">166 replies</button>
    `);

    const result = discoverCapabilities(document);
    expect(result.candidates.map((entry) => entry.name)).toEqual(['search_claims']);
    expect(result.counts).toMatchObject({ total: 4, shown: 1, hiddenUnnameable: 1 });
    expect(result.counts.hiddenWeak + result.counts.hiddenDuplicate).toBe(2);
    expect(result.suppressed).toHaveLength(3);
  });

  it('scores readiness from the whole page, not just the survivors', () => {
    mount(`
      <form id="f" aria-label="Search claims" aria-description="Find a claim">
        <label for="q">Reference</label><input id="q" name="query">
        <button type="submit">Search</button>
      </form>
      ${'<button aria-label="Show cards">Show cards</button>'.repeat(20)}
    `);
    const result = discoverCapabilities(document);
    // Readiness still reflects 21 well-named controls, even though 20 were hidden.
    expect(result.readiness.breakdown.ariaCoverage).toBe(1);
    expect(result.candidates).toHaveLength(1);
  });
});

describe('a candidate explains its own score', () => {
  it('names what the page failed to declare', () => {
    mount(`
      <form id="f" aria-label="Filter results">
        <input name="q">
        <button type="submit">Go</button>
      </form>
    `);
    const [candidate] = discoverCapabilities(document, { formFloor: 0 }).candidates;
    expect(candidate.confidenceReasons).toContain('no ARIA description');
    expect(candidate.confidenceReasons).toContain('no field labels');
  });

  it('says a button takes no arguments, which is why it scores lower', () => {
    mount(`<button aria-label="Withdraw claim" aria-description="Closes the claim">Withdraw</button>`);
    const [candidate] = discoverCapabilities(document).candidates;
    expect(candidate.confidenceReasons).toContain('takes no arguments');
  });
});
