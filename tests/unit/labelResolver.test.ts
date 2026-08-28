import { describe, expect, it } from 'vitest';
import { hasAuthoredLabel, resolveControlLabel } from '@reflex/discovery-engine';
import { el, mount } from './helpers.js';

describe('resolveControlLabel', () => {
  it('resolves an explicit label[for]', () => {
    mount(`
      <label for="employeeName">Employee name</label>
      <input id="employeeName" name="employeeName">
    `);
    expect(resolveControlLabel(el('input'))).toMatchObject({ label: 'Employee name', from: 'label-for' });
  });

  it('strips trailing colons and required markers', () => {
    mount(`<label for="q">Employee name or email:<span aria-hidden="true"> *</span></label><input id="q" name="q">`);
    expect(resolveControlLabel(el('input')).label).toBe('Employee name or email');
  });

  it('resolves a wrapping label without reading the control value', () => {
    mount(`<label>Department <select name="department"><option>Engineering</option></select></label>`);
    expect(resolveControlLabel(el('select'))).toMatchObject({ label: 'Department', from: 'label-wrapper' });
  });

  it('falls back to aria-label, then placeholder, then the name attribute', () => {
    mount(`<input name="a" aria-label="Search query">`);
    expect(resolveControlLabel(el('input'))).toMatchObject({ label: 'Search query', from: 'aria-label' });

    mount(`<input name="b" placeholder="name@acme.test">`);
    expect(resolveControlLabel(el('input'))).toMatchObject({ label: 'name@acme.test', from: 'placeholder' });

    mount(`<input name="startDate">`);
    expect(resolveControlLabel(el('input'))).toMatchObject({ label: 'Start date', from: 'name' });
  });

  it('carries field-level help text from aria-describedby', () => {
    mount(`
      <label for="e">Email</label>
      <input id="e" name="email" aria-describedby="e-help">
      <p id="e-help">Work email address.</p>
    `);
    expect(resolveControlLabel(el('input')).description).toBe('Work email address.');
  });
});

describe('hasAuthoredLabel', () => {
  it('is true for authored labels only', () => {
    mount(`<label for="a">Name</label><input id="a" name="a">`);
    expect(hasAuthoredLabel(el('input'))).toBe(true);
  });

  it('is false when the label was synthesised from the name attribute', () => {
    mount(`<input name="startDate">`);
    expect(hasAuthoredLabel(el('input'))).toBe(false);
  });
});
