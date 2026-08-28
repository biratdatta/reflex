import { describe, expect, it } from 'vitest';
import { resolveControlLabel } from '@reflex/discovery-engine';
import { buildFormSchema, controlToProperty } from '@reflex/schema-generator';
import { el, mount } from './helpers.js';

const schemaOf = (html: string) => {
  mount(html);
  return buildFormSchema(el('form'), (control) => {
    const resolved = resolveControlLabel(control);
    return { label: resolved.from === 'name' ? undefined : resolved.label, fallbackLabel: resolved.label, description: resolved.description };
  });
};

describe('text inputs', () => {
  it('maps to string and carries the label as the description', () => {
    const { schema } = schemaOf(`
      <form aria-label="Search employees">
        <label for="q">Employee name or email</label>
        <input id="q" name="query" type="text" required>
        <button type="submit">Search</button>
      </form>
    `);
    expect(schema.properties.query).toEqual({ type: 'string', description: 'Employee name or email' });
    expect(schema.required).toEqual(['query']);
  });

  it('carries minlength, maxlength and pattern', () => {
    const { schema } = schemaOf(`
      <form><input name="code" minlength="2" maxlength="8" pattern="[A-Z]+"></form>
    `);
    expect(schema.properties.code).toMatchObject({ type: 'string', minLength: 2, maxLength: 8, pattern: '[A-Z]+' });
  });

  it('drops an unusable pattern rather than emitting an invalid schema', () => {
    const { schema } = schemaOf(`<form><input name="code" pattern="[("></form>`);
    expect(schema.properties.code.pattern).toBeUndefined();
  });
});

describe('typed inputs', () => {
  it('maps email to string + email format', () => {
    const { schema } = schemaOf(`<form><input name="email" type="email"></form>`);
    expect(schema.properties.email).toMatchObject({ type: 'string', format: 'email' });
  });

  it('maps url to string + uri format', () => {
    const { schema } = schemaOf(`<form><input name="profile" type="url"></form>`);
    expect(schema.properties.profile).toMatchObject({ type: 'string', format: 'uri' });
  });

  it('maps date to string + date format', () => {
    const { schema } = schemaOf(`<form><input name="startDate" type="date"></form>`);
    expect(schema.properties.startDate).toMatchObject({ type: 'string', format: 'date' });
  });

  it('maps datetime-local to a plain string', () => {
    const { schema } = schemaOf(`<form><input name="when" type="datetime-local"></form>`);
    expect(schema.properties.when.type).toBe('string');
    expect(schema.properties.when.format).toBeUndefined();
  });

  it('maps number with min/max', () => {
    const { schema } = schemaOf(`<form><input name="age" type="number" min="18" max="100" required></form>`);
    expect(schema.properties.age).toMatchObject({ type: 'number', minimum: 18, maximum: 100 });
    expect(schema.required).toEqual(['age']);
  });

  it('uses integer when the step is a whole number', () => {
    const { schema } = schemaOf(`<form><input name="headcount" type="number" step="1" min="0"></form>`);
    expect(schema.properties.headcount.type).toBe('integer');
  });
});

describe('choice controls', () => {
  it('maps a select to an enum of option values', () => {
    const { schema } = schemaOf(`
      <form>
        <label for="d">Department</label>
        <select id="d" name="department">
          <option value="">Any department</option>
          <option value="engineering">Engineering</option>
          <option value="finance">Finance</option>
        </select>
      </form>
    `);
    expect(schema.properties.department).toMatchObject({
      type: 'string',
      enum: ['engineering', 'finance'],
      'x-reflex-enumLabels': ['Engineering', 'Finance'],
    });
  });

  it('maps a multiple select to an array of enum values', () => {
    const { schema } = schemaOf(`
      <form><select name="apps" multiple><option value="github">GitHub</option><option value="aws">AWS</option></select></form>
    `);
    expect(schema.properties.apps).toMatchObject({ type: 'array', items: { type: 'string', enum: ['github', 'aws'] } });
  });

  it('maps a radio group to a single enum', () => {
    const { schema } = schemaOf(`
      <form>
        <label for="r1">Active</label><input id="r1" type="radio" name="status" value="active">
        <label for="r2">On leave</label><input id="r2" type="radio" name="status" value="leave">
      </form>
    `);
    expect(schema.properties.status).toMatchObject({
      type: 'string',
      enum: ['active', 'leave'],
      'x-reflex-enumLabels': ['Active', 'On leave'],
    });
    expect(Object.keys(schema.properties)).toEqual(['status']);
  });

  it('maps a lone checkbox to a boolean', () => {
    const { schema } = schemaOf(`
      <form><label for="c">Notify manager</label><input id="c" type="checkbox" name="notify"></form>
    `);
    expect(schema.properties.notify).toMatchObject({ type: 'boolean', description: 'Notify manager' });
  });

  it('maps a checkbox group to an array of values', () => {
    const { schema } = schemaOf(`
      <form>
        <input type="checkbox" name="apps" value="github">
        <input type="checkbox" name="apps" value="slack">
      </form>
    `);
    expect(schema.properties.apps).toMatchObject({ type: 'array', items: { type: 'string', enum: ['github', 'slack'] } });
  });

  it('requires a radio group only when the group is required', () => {
    const { schema } = schemaOf(`
      <form>
        <input type="radio" name="status" value="a" required>
        <input type="radio" name="status" value="b" required>
      </form>
    `);
    expect(schema.required).toEqual(['status']);
  });
});

describe('excluded controls', () => {
  it('skips submit, hidden, disabled and file inputs', () => {
    const { schema, skipped } = schemaOf(`
      <form>
        <input name="query">
        <input name="token" type="hidden" value="x">
        <input name="upload" type="file">
        <input name="off" disabled>
        <input type="submit" value="Go">
      </form>
    `);
    expect(Object.keys(schema.properties)).toEqual(['query']);
    expect(skipped).toBe(4);
  });

  it('never exposes a password field, and reports its presence', () => {
    const { schema, hasPasswordField } = schemaOf(`
      <form aria-label="Reset password"><input name="newPassword" type="password"></form>
    `);
    expect(schema.properties.newPassword).toBeUndefined();
    expect(hasPasswordField).toBe(true);
  });

  it('skips controls with no name or id, since they cannot be addressed later', () => {
    const { schema } = schemaOf(`<form><input type="text"></form>`);
    expect(Object.keys(schema.properties)).toEqual([]);
  });

  it('omits required entirely when nothing is required', () => {
    const { schema } = schemaOf(`<form><input name="query"></form>`);
    expect('required' in schema).toBe(false);
  });
});

describe('controlToProperty', () => {
  it('returns null for controls that carry no agent-settable value', () => {
    mount(`<form><input type="submit" name="go"></form>`);
    expect(controlToProperty(el('input'))).toBeNull();
  });
});
