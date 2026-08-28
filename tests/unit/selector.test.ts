import { describe, expect, it } from 'vitest';
import {
  buildFingerprint,
  buildSelector,
  candidateId,
  matchesFingerprint,
  resolveTarget,
} from '@reflex/discovery-engine';
import { el, mount } from './helpers.js';

describe('buildSelector', () => {
  it('prefers a unique id', () => {
    mount(`<form id="employee-search"></form>`);
    expect(buildSelector(el('form'))).toBe('#employee-search');
  });

  it('falls back to data-testid', () => {
    mount(`<button data-testid="deactivate">Deactivate employee</button>`);
    expect(buildSelector(el('button'))).toBe('[data-testid="deactivate"]');
  });

  it('falls back to a name attribute, scoping by form when needed', () => {
    mount(`
      <form id="a"><input name="query"></form>
      <form id="b"><input name="query"></form>
    `);
    const second = document.querySelectorAll('input')[1];
    expect(buildSelector(second)).toBe('#b input[name="query"]');
  });

  it('falls back to aria-label', () => {
    mount(`<div><button aria-label="Deactivate employee">Deactivate</button></div>`);
    expect(buildSelector(el('button'))).toBe('button[aria-label="Deactivate employee"]');
  });

  it('falls back to a structural path anchored on the nearest id', () => {
    mount(`<section id="s"><div><button>Assign application</button><button>Revoke access</button></div></section>`);
    const second = document.querySelectorAll('button')[1];
    expect(buildSelector(second)).toBe('#s > div > button:nth-of-type(2)');
    expect(document.querySelectorAll(buildSelector(second)).length).toBe(1);
  });
});

describe('fingerprints', () => {
  it('captures the semantic identity of a control', () => {
    mount(`<button role="button" aria-label="Deactivate employee" name="deactivate">Deactivate</button>`);
    expect(buildFingerprint(el('button'))).toEqual({
      tag: 'button',
      role: 'button',
      ariaLabel: 'Deactivate employee',
      text: 'Deactivate',
      name: 'deactivate',
    });
  });

  it('records the field names a form is expected to have', () => {
    mount(`<form id="f"><input name="query"><select name="department"></select></form>`);
    expect(buildFingerprint(el('form'), ['query', 'department']).fieldNames).toEqual(['query', 'department']);
  });

  it('matches an unchanged element', () => {
    mount(`<button aria-label="Deactivate employee">Deactivate</button>`);
    const fingerprint = buildFingerprint(el('button'));
    expect(matchesFingerprint(el('button'), fingerprint).matches).toBe(true);
  });

  it('rejects a changed accessible name', () => {
    mount(`<button aria-label="Deactivate employee">Deactivate</button>`);
    const fingerprint = buildFingerprint(el('button'));
    el('button').setAttribute('aria-label', 'Delete employee');
    const verdict = matchesFingerprint(el('button'), fingerprint);
    expect(verdict.matches).toBe(false);
    expect(verdict.reasons[0]).toContain('accessible name changed');
  });

  it('rejects a missing form field', () => {
    mount(`<form id="f"><input name="query"><select name="department"></select></form>`);
    const fingerprint = buildFingerprint(el('form'), ['query', 'department']);
    el('select').remove();
    const verdict = matchesFingerprint(el('form'), fingerprint);
    expect(verdict.matches).toBe(false);
    expect(verdict.reasons[0]).toContain('fields missing: department');
  });

  it('tolerates incidental text drift when an aria-label anchors identity', () => {
    mount(`<button aria-label="Deactivate employee">Deactivate</button>`);
    const fingerprint = buildFingerprint(el('button'));
    el('button').textContent = 'Deactivate now';
    expect(matchesFingerprint(el('button'), fingerprint).matches).toBe(true);
  });
});

describe('resolveTarget', () => {
  it('returns the element when selector and fingerprint agree', () => {
    mount(`<button id="b" aria-label="Deactivate employee">Deactivate</button>`);
    const result = resolveTarget(document, '#b', buildFingerprint(el('button')));
    expect('element' in result).toBe(true);
  });

  it('fails closed when the element is gone', () => {
    mount(`<button id="b" aria-label="Deactivate employee">Deactivate</button>`);
    const fingerprint = buildFingerprint(el('button'));
    el('button').remove();
    const result = resolveTarget(document, '#b', fingerprint);
    expect(result).toEqual({ error: 'Target element no longer present (#b)' });
  });

  it('fails closed when the element changed', () => {
    mount(`<button id="b" aria-label="Deactivate employee">Deactivate</button>`);
    const fingerprint = buildFingerprint(el('button'));
    el('button').setAttribute('aria-label', 'Delete everything');
    const result = resolveTarget(document, '#b', fingerprint);
    expect('error' in result && result.error).toContain('Target element changed');
  });

  it('reports an invalid selector rather than throwing', () => {
    mount(`<button id="b">x</button>`);
    const result = resolveTarget(document, '#$$bad', buildFingerprint(el('button')));
    expect('error' in result && result.error).toContain('Invalid selector');
  });
});

describe('candidateId', () => {
  it('is stable for the same element identity', () => {
    mount(`<form id="employee-search"><input name="query"></form>`);
    const fingerprint = buildFingerprint(el('form'), ['query']);
    expect(candidateId('#employee-search', fingerprint)).toBe(candidateId('#employee-search', fingerprint));
  });

  it('differs when the identity differs', () => {
    mount(`<form id="a"></form><form id="b"></form>`);
    const first = candidateId('#a', buildFingerprint(el('#a')));
    const second = candidateId('#b', buildFingerprint(el('#b')));
    expect(first).not.toBe(second);
  });
});
