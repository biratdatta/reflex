import { describe, expect, it } from 'vitest';
import {
  resolveAccessibleDescription,
  resolveAccessibleName,
  visibleText,
} from '@reflex/discovery-engine';
import { el, mount } from './helpers.js';

describe('resolveAccessibleName', () => {
  it('prefers aria-label', () => {
    mount(`<button aria-label="Deactivate employee">Deactivate</button>`);
    const resolved = resolveAccessibleName(el('button'));
    expect(resolved).toEqual({ value: 'Deactivate employee', from: 'aria-label' });
  });

  it('falls back to aria-labelledby, joining referenced nodes', () => {
    mount(`
      <h2 id="t">Change</h2><span id="u">department</span>
      <form aria-labelledby="t u"></form>
    `);
    const resolved = resolveAccessibleName(el('form'), { useText: false });
    expect(resolved).toEqual({ value: 'Change department', from: 'aria-labelledby' });
  });

  it('falls back to a legend for a form', () => {
    mount(`<form><fieldset><legend>Create employee</legend></fieldset></form>`);
    expect(resolveAccessibleName(el('form'), { useText: false })).toEqual({
      value: 'Create employee',
      from: 'heading',
    });
  });

  it('falls back to a preceding heading', () => {
    mount(`<h3>Assign application</h3><form><input name="app"></form>`);
    expect(resolveAccessibleName(el('form'), { useText: false }).value).toBe('Assign application');
  });

  it('falls back to button text, then name, then id', () => {
    mount(`<button>Reset password</button>`);
    expect(resolveAccessibleName(el('button')).from).toBe('button-text');

    mount(`<button name="do_thing"></button>`);
    expect(resolveAccessibleName(el('button'))).toEqual({ value: 'do_thing', from: 'name' });

    mount(`<button id="only-id"></button>`);
    expect(resolveAccessibleName(el('button'))).toEqual({ value: 'only-id', from: 'id' });
  });

  it('reports no name when nothing is available', () => {
    mount(`<button></button>`);
    expect(resolveAccessibleName(el('button')).from).toBe('none');
  });
});

describe('visibleText', () => {
  it('ignores aria-hidden decoration', () => {
    mount(`<button><span aria-hidden="true">🗑</span> Revoke access</button>`);
    expect(visibleText(el('button'))).toBe('Revoke access');
  });
});

describe('resolveAccessibleDescription', () => {
  it('prefers aria-description', () => {
    mount(`<button aria-description="Move this employee to another department">Change</button>`);
    expect(resolveAccessibleDescription(el('button'))).toEqual({
      value: 'Move this employee to another department',
      from: 'aria-description',
    });
  });

  it('resolves aria-describedby to referenced text', () => {
    mount(`
      <button aria-label="Deactivate employee" aria-describedby="deactivate-help">Deactivate</button>
      <p id="deactivate-help">Prevents this employee from signing in.</p>
    `);
    expect(resolveAccessibleDescription(el('button'))).toEqual({
      value: 'Prevents this employee from signing in.',
      from: 'aria-describedby',
    });
  });

  it('falls back to title', () => {
    mount(`<button title="Send the offer letter">Send</button>`);
    expect(resolveAccessibleDescription(el('button')).from).toBe('title');
  });

  it('reports none when the element carries no description', () => {
    mount(`<button>Send</button>`);
    expect(resolveAccessibleDescription(el('button'))).toEqual({ value: '', from: 'none' });
  });
});
