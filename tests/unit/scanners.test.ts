import { describe, expect, it } from 'vitest';
import { discoverCapabilities, scanButtons, scanForm, scanForms } from '@reflex/discovery-engine';
import { el, mount } from './helpers.js';

const SEARCH_FORM = `
  <section>
    <form id="employee-search" aria-label="Search employees" aria-description="Find an employee by name or email">
      <label for="employee-query">Employee name or email</label>
      <input id="employee-query" name="query" type="text" required>
      <button type="submit">Search</button>
    </form>
    <div id="search-results" aria-live="polite">No results yet.</div>
  </section>
`;

describe('scanForm', () => {
  it('turns the PRD example form into a candidate', () => {
    mount(SEARCH_FORM);
    const candidate = scanForm(el('form'))!;
    expect(candidate).toMatchObject({
      source: 'form',
      elementSelector: '#employee-search',
      name: 'search_employees',
      title: 'Search employees',
      description: 'Find an employee by name or email.',
      risk: 'read',
    });
    expect(candidate.inputSchema).toEqual({
      type: 'object',
      properties: { query: { type: 'string', description: 'Employee name or email' } },
      required: ['query'],
      additionalProperties: false,
    });
    expect(candidate.confidence).toBeGreaterThanOrEqual(90);
  });

  it('records the evidence that produced the tool', () => {
    mount(SEARCH_FORM);
    const candidate = scanForm(el('form'))!;
    expect(candidate.evidence).toEqual(
      expect.arrayContaining([
        { type: 'aria-label', value: 'Search employees' },
        { type: 'aria-description', value: 'Find an employee by name or email' },
        expect.objectContaining({ type: 'form', value: '<form>', origin: '#employee-search' }),
        expect.objectContaining({ type: 'label', value: 'query: Employee name or email (required)' }),
      ]),
    );
  });

  it('points at the live region that shows the result', () => {
    mount(SEARCH_FORM);
    expect(scanForm(el('form'))!.resultSelector).toBe('#search-results');
  });

  it('prefers an explicit aria-controls target for the result region', () => {
    mount(`
      <form id="f" aria-label="List applications" aria-controls="app-table"><button>Go</button></form>
      <div id="other" aria-live="polite"></div>
      <table id="app-table"></table>
    `);
    expect(scanForm(el('form'))!.resultSelector).toBe('#app-table');
  });

  it('generates a description when the page provides none', () => {
    mount(`
      <form aria-label="Create employee">
        <label for="n">Full name</label><input id="n" name="fullName" required>
        <label for="e">Work email</label><input id="e" name="email" type="email">
        <button>Create</button>
      </form>
    `);
    expect(scanForm(el('form'))!.description).toBe('Create employee using Full name (required), Work email.');
  });

  it('escalates risk and hides the field when a form takes a password', () => {
    mount(`
      <form aria-label="Reset password" aria-description="Issue a new sign-in password">
        <label for="p">New password</label><input id="p" name="newPassword" type="password">
        <button>Reset</button>
      </form>
    `);
    const candidate = scanForm(el('form'))!;
    expect(candidate.risk).toBe('sensitive');
    expect(candidate.inputSchema.properties.newPassword).toBeUndefined();
    expect(candidate.evidence.map((e) => e.value)).toContain(
      'Password field present — excluded from schema, risk escalated to sensitive',
    );
  });

  it('returns null for a form with no resolvable name', () => {
    mount(`<form><input type="text"></form>`);
    expect(scanForm(el('form'))).toBeNull();
  });

  it('keeps tool names unique across forms with the same label', () => {
    mount(`
      <form aria-label="Search employees"><input name="query"><button>Go</button></form>
      <form aria-label="Search employees"><input name="q2"><button>Go</button></form>
    `);
    expect(scanForms(document).map((candidate) => candidate.name)).toEqual([
      'search_employees',
      'search_employees_2',
    ]);
  });
});

describe('scanButtons', () => {
  it('turns an ARIA-labelled button into a candidate', () => {
    mount(`
      <button aria-label="Deactivate employee" aria-describedby="help">Deactivate</button>
      <p id="help">Prevents this employee from signing in.</p>
    `);
    const [candidate] = scanButtons(document);
    expect(candidate).toMatchObject({
      source: 'button',
      name: 'deactivate_employee',
      title: 'Deactivate employee',
      description: 'Prevents this employee from signing in.',
      risk: 'destructive',
    });
    expect(candidate.inputSchema.properties).toEqual({});
  });

  it('ignores generic UI mechanics', () => {
    mount(`
      <button aria-label="Close dialog">×</button>
      <button>Toggle navigation menu</button>
      <button>Next page</button>
      <button aria-label="Reset password">Reset</button>
    `);
    expect(scanButtons(document).map((candidate) => candidate.name)).toEqual(['reset_password']);
  });

  it('skips unlabelled and disabled buttons', () => {
    mount(`<button></button><button aria-label="Archive employee" disabled>Archive</button>`);
    expect(scanButtons(document)).toEqual([]);
  });

  it('skips a submit button already covered by its form candidate', () => {
    mount(SEARCH_FORM);
    const forms = [el('form')];
    expect(scanButtons(document, { claimedForms: forms })).toEqual([]);
  });

  it('keeps a non-submit button inside a claimed form', () => {
    mount(`
      <form id="f" aria-label="Search employees">
        <input name="query">
        <button type="submit">Search</button>
        <button type="button" aria-label="Revoke all access">Revoke all</button>
      </form>
    `);
    const candidates = scanButtons(document, { claimedForms: [el('form')] });
    expect(candidates.map((candidate) => candidate.name)).toEqual(['revoke_all_access']);
  });

  it('drops buttons scoring below the confidence threshold', () => {
    // Visible text alone scores 10 + 15 (semantic) = 25.
    mount(`<button>Frobnicate the widget</button>`);
    expect(scanButtons(document)).toEqual([]);
    expect(scanButtons(document, { threshold: 20 })).toHaveLength(1);
  });

  it('honours data-reflex-ignore opt-out', () => {
    mount(`<div data-reflex-ignore><button aria-label="Deactivate employee">Deactivate</button></div>`);
    expect(scanButtons(document)).toEqual([]);
  });
});

describe('discoverCapabilities', () => {
  it('finds forms and buttons together, sorted by confidence', () => {
    mount(`
      ${SEARCH_FORM}
      <button aria-label="Deactivate employee" aria-description="Prevents this employee from signing in">Deactivate</button>
      <button aria-label="Close panel">×</button>
    `);
    const { candidates } = discoverCapabilities(document);
    expect(candidates.map((candidate) => candidate.name)).toEqual(['search_employees', 'deactivate_employee']);
    expect(candidates[0].confidence).toBeGreaterThanOrEqual(candidates[1].confidence);
  });

  it('produces the same candidate ids on a rescan of an unchanged page', () => {
    mount(SEARCH_FORM);
    const first = discoverCapabilities(document).candidates.map((candidate) => candidate.id);
    const second = discoverCapabilities(document).candidates.map((candidate) => candidate.id);
    expect(second).toEqual(first);
  });

  it('scores agent readiness with a breakdown', () => {
    mount(SEARCH_FORM);
    const { readiness } = discoverCapabilities(document);
    expect(readiness.score).toBeGreaterThan(60);
    expect(readiness.counts).toMatchObject({ candidates: 1, formFields: 1, labelledFormFields: 1 });
    expect(readiness.breakdown.formQuality).toBe(1);
  });

  it('scores a semantically poor page far lower', () => {
    mount(`
      <div onclick="doThing()">Click me</div>
      <div onclick="other()"><span>Go</span></div>
      <form><input type="text"><div onclick="submit()">Submit</div></form>
    `);
    const { candidates, readiness } = discoverCapabilities(document);
    expect(candidates).toEqual([]);
    expect(readiness.score).toBeLessThan(40);
  });
});
