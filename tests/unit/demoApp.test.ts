import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { discoverCapabilities } from '@reflex/discovery-engine';
import { executeCandidate } from '@reflex/webmcp-adapter';

/**
 * End-to-end discovery against the real ACME Employee Manager markup, rendered
 * by the demo app itself. If the demo's accessibility metadata regresses, these
 * fail — which is the point: the demo is the contract Reflex reads.
 */
let render: () => void;
let navigate: (path: string) => void;

beforeAll(async () => {
  document.body.innerHTML = '<div id="app"></div>';
  window.history.pushState({}, '', '/employees');
  const app = await import('../../apps/demo-legacy-app/src/main.js');
  render = app.render;
  navigate = app.navigate;
});

beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>';
  render();
});

const namesOn = (path: string): string[] => {
  navigate(path);
  return discoverCapabilities(document).candidates.map((candidate) => candidate.name);
};

describe('/employees', () => {
  it('discovers the directory capabilities', () => {
    expect(namesOn('/employees').sort()).toEqual(
      [
        'create_employee',
        'filter_employees_by_department',
        'import_employees_from_csv',
        'search_employees',
        'view_employee_record',
      ].sort(),
    );
  });

  it('discovers at least five meaningful capabilities', () => {
    navigate('/employees');
    expect(discoverCapabilities(document).candidates.length).toBeGreaterThanOrEqual(5);
  });

  it('leaves interface mechanics alone', () => {
    const names = namesOn('/employees');
    for (const mechanic of ['toggle_navigation_menu', 'next_page', 'previous_page', 'expand_all_rows']) {
      expect(names).not.toContain(mechanic);
    }
  });

  it('classifies risk across the page', () => {
    navigate('/employees');
    const byName = new Map(
      discoverCapabilities(document).candidates.map((candidate) => [candidate.name, candidate]),
    );
    expect(byName.get('search_employees')!.risk).toBe('read');
    expect(byName.get('view_employee_record')!.risk).toBe('read');
    expect(byName.get('filter_employees_by_department')!.risk).toBe('read');
    expect(byName.get('create_employee')!.risk).toBe('write');
    expect(byName.get('import_employees_from_csv')!.risk).toBe('write');
  });

  it('builds a rich schema for the create form', () => {
    navigate('/employees');
    const create = discoverCapabilities(document).candidates.find(
      (candidate) => candidate.name === 'create_employee',
    )!;
    expect(create.inputSchema.required).toEqual(['fullName', 'email', 'department']);
    expect(create.inputSchema.properties.email).toMatchObject({ type: 'string', format: 'email' });
    expect(create.inputSchema.properties.startDate).toMatchObject({ type: 'string', format: 'date' });
    expect(create.inputSchema.properties.notifyManager).toMatchObject({ type: 'boolean' });
    expect(create.inputSchema.properties.department.enum).toContain('finance');
    expect(create.inputSchema.properties.employmentType).toMatchObject({
      type: 'string',
      enum: ['full-time', 'part-time', 'contract'],
    });
  });

  it('scores the page as agent-ready', () => {
    navigate('/employees');
    expect(discoverCapabilities(document).readiness.score).toBeGreaterThanOrEqual(75);
  });
});

describe('/employees/:id', () => {
  it('discovers the employee capabilities from the demo scenario', () => {
    expect(namesOn('/employees/E-482').sort()).toEqual(
      [
        'assign_application',
        'change_department',
        'deactivate_employee',
        'list_employee_applications',
        'reset_password',
        'revoke_application_access',
        'set_temporary_password',
      ].sort(),
    );
  });

  it('classifies the dangerous actions', () => {
    navigate('/employees/E-482');
    const byName = new Map(
      discoverCapabilities(document).candidates.map((candidate) => [candidate.name, candidate]),
    );
    expect(byName.get('deactivate_employee')!.risk).toBe('destructive');
    expect(byName.get('revoke_application_access')!.risk).toBe('destructive');
    expect(byName.get('reset_password')!.risk).toBe('sensitive');
    expect(byName.get('set_temporary_password')!.risk).toBe('sensitive');
    expect(byName.get('change_department')!.risk).toBe('write');
    expect(byName.get('list_employee_applications')!.risk).toBe('read');
  });

  it('never exposes the temporary password field', () => {
    navigate('/employees/E-482');
    const candidate = discoverCapabilities(document).candidates.find(
      (entry) => entry.name === 'set_temporary_password',
    )!;
    expect(candidate.inputSchema.properties).toEqual({});
  });
});

describe('/roles and /applications', () => {
  it('discovers role administration', () => {
    expect(namesOn('/roles').sort()).toEqual(['assign_role', 'revoke_role']);
  });

  it('discovers the application reports', () => {
    expect(namesOn('/applications').sort()).toEqual([
      'filter_applications_by_owner',
      'list_application_holders',
    ]);
  });
});

describe('executing discovered tools against the demo app', () => {
  it('searches, and reads the result out of the page', async () => {
    navigate('/employees');
    const search = discoverCapabilities(document).candidates.find(
      (candidate) => candidate.name === 'search_employees',
    )!;

    const result = await executeCandidate(document, search, { query: 'Sarah Chen' }, { settleMs: 0 });

    expect(result.success).toBe(true);
    expect(String(result.observed?.region)).toContain('Sarah Chen');
    expect(String(result.observed?.region)).toContain('E-482');
  });

  it('changes a department, and the page visibly updates', async () => {
    navigate('/employees/E-482');
    const change = discoverCapabilities(document).candidates.find(
      (candidate) => candidate.name === 'change_department',
    )!;

    const result = await executeCandidate(document, change, { department: 'finance' }, { settleMs: 0 });

    expect(result.success).toBe(true);
    expect(document.getElementById('employee-record')!.textContent).toContain('Finance');
    expect(document.getElementById('app-status')!.textContent).toContain('Moved Sarah Chen from Engineering to Finance');
  });

  it('revokes access after human approval, and refuses without it', async () => {
    navigate('/employees/E-482');
    const revoke = discoverCapabilities(document).candidates.find(
      (candidate) => candidate.name === 'revoke_application_access',
    )!;

    const declined = await executeCandidate(document, revoke, { application: 'aws' }, { settleMs: 0, confirm: () => false });
    expect(declined.success).toBe(false);
    expect(document.getElementById('application-table')!.textContent).toContain('Assigned');

    const approved = await executeCandidate(document, revoke, { application: 'aws' }, { settleMs: 0, confirm: () => true });
    expect(approved.success).toBe(true);
    expect(document.getElementById('app-status')!.textContent).toContain("Revoked Sarah Chen's access to AWS");
  });

  it('rejects an application that is not on the menu', async () => {
    navigate('/employees/E-482');
    const assign = discoverCapabilities(document).candidates.find(
      (candidate) => candidate.name === 'assign_application',
    )!;
    const result = await executeCandidate(document, assign, { application: 'sap' }, { settleMs: 0 });
    expect(result.success).toBe(false);
    expect(result.error).toContain('not an option: sap');
  });
});
