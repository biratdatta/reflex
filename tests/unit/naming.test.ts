import { describe, expect, it } from 'vitest';
import { asSentence, humanize, normalizeToolName, uniqueToolName } from '@reflex/discovery-engine';

describe('normalizeToolName', () => {
  it('converts a title to snake_case', () => {
    expect(normalizeToolName('Search Employees')).toBe('search_employees');
  });

  it('collapses punctuation and trims separators', () => {
    expect(normalizeToolName('  Revoke — application access!  ')).toBe('revoke_application_access');
  });

  it('drops characters outside a-z0-9', () => {
    expect(normalizeToolName('Créate Employee #2')).toBe('cr_ate_employee_2');
  });

  it('returns an empty string for input with no usable characters', () => {
    expect(normalizeToolName('—•—')).toBe('');
  });
});

describe('uniqueToolName', () => {
  it('suffixes duplicates so WebMCP names stay unique per page', () => {
    const taken = new Set<string>();
    expect(uniqueToolName('search_employees', taken)).toBe('search_employees');
    expect(uniqueToolName('search_employees', taken)).toBe('search_employees_2');
    expect(uniqueToolName('search_employees', taken)).toBe('search_employees_3');
  });

  it('falls back to a placeholder when there is no name', () => {
    expect(uniqueToolName('', new Set())).toBe('unnamed_capability');
  });
});

describe('humanize', () => {
  it('splits camelCase', () => {
    expect(humanize('employeeName')).toBe('Employee name');
  });

  it('splits snake_case and kebab-case', () => {
    expect(humanize('start_date')).toBe('Start date');
    expect(humanize('manager-id')).toBe('Manager id');
  });
});

describe('asSentence', () => {
  it('capitalises and punctuates', () => {
    expect(asSentence('prevents this employee from signing in')).toBe('Prevents this employee from signing in.');
  });

  it('leaves existing punctuation alone', () => {
    expect(asSentence('Find an employee by name or email.')).toBe('Find an employee by name or email.');
  });
});
