import { clickHandlers, submitHandlers } from '../actions.js';
import {
  DEPARTMENTS,
  createEmployee,
  departmentName,
  findEmployee,
  searchEmployees,
  statusLabel,
  store,
} from '../data.js';
import { escapeHtml } from '../dom.js';
import { navigate, rerender } from '../main.js';
import { view } from '../state.js';

const departmentOptions = (selected: string, placeholder: string): string =>
  [
    `<option value="">${placeholder}</option>`,
    ...DEPARTMENTS.map(
      (department) =>
        `<option value="${department.id}"${department.id === selected ? ' selected' : ''}>${department.name}</option>`,
    ),
  ].join('');

const managerOptions = (): string =>
  [
    '<option value="">Unassigned</option>',
    ...store.employees
      .filter((employee) => employee.roles.includes('manager'))
      .map((employee) => `<option value="${escapeHtml(employee.name)}">${escapeHtml(employee.name)}</option>`),
  ].join('');

const resultRows = (): string => {
  const results = searchEmployees(view.query, view.filterDepartment);
  if (!results.length) {
    return `<tr><td colspan="5">No employees match the current search.</td></tr>`;
  }
  return results
    .map(
      (employee) => `
        <tr>
          <td><a href="/employees/${employee.id}">${escapeHtml(employee.name)}</a></td>
          <td>${escapeHtml(employee.id)}</td>
          <td>${escapeHtml(employee.email)}</td>
          <td>${escapeHtml(departmentName(employee.department))}</td>
          <td><span class="status-pill ${employee.status}">${statusLabel(employee.status)}</span></td>
        </tr>`,
    )
    .join('');
};

const recordPreview = (): string => {
  const employee = view.previewEmployeeId ? findEmployee(view.previewEmployeeId) : undefined;
  if (!view.previewEmployeeId) {
    return `<p>No record loaded. Use “View employee record” to load one.</p>`;
  }
  if (!employee) {
    return `<p>No employee found with ID “${escapeHtml(view.previewEmployeeId)}”.</p>`;
  }
  return `
    <dl class="record">
      <dt>Name</dt><dd>${escapeHtml(employee.name)}</dd>
      <dt>Employee ID</dt><dd>${escapeHtml(employee.id)}</dd>
      <dt>Email</dt><dd>${escapeHtml(employee.email)}</dd>
      <dt>Department</dt><dd>${escapeHtml(departmentName(employee.department))}</dd>
      <dt>Manager</dt><dd>${escapeHtml(employee.manager)}</dd>
      <dt>Status</dt><dd>${statusLabel(employee.status)}</dd>
    </dl>
    <p><a href="/employees/${employee.id}">Open the full record for ${escapeHtml(employee.name)}</a></p>
  `;
};

export const renderEmployees = (): string => `
  <h2>Employees</h2>
  <p class="lede">${store.employees.length} people on record. Search, filter, or add someone new.</p>

  <section class="panel" aria-labelledby="find-heading">
    <h3 id="find-heading">Find people</h3>
    <div class="row">
      <form
        id="employee-search"
        aria-label="Search employees"
        aria-description="Find an employee by name or email"
        aria-controls="employee-results"
      >
        <div class="field">
          <label for="employee-query">Employee name or email</label>
          <input
            id="employee-query"
            name="query"
            type="text"
            required
            maxlength="80"
            aria-describedby="employee-query-hint"
            value="${escapeHtml(view.query)}"
          />
          <span class="hint" id="employee-query-hint">Matches name, work email or employee ID.</span>
        </div>
        <button type="submit">Search</button>
      </form>

      <form
        id="department-filter"
        aria-label="Filter employees by department"
        aria-description="Show only the employees in one department"
        aria-controls="employee-results"
      >
        <div class="field">
          <label for="filter-department">Department</label>
          <select id="filter-department" name="department">
            ${departmentOptions(view.filterDepartment, 'All departments')}
          </select>
        </div>
        <button type="submit">Apply filter</button>
      </form>
    </div>
  </section>

  <section class="panel" aria-labelledby="results-heading">
    <div class="toolbar">
      <h3 id="results-heading" style="flex:1">Directory</h3>
      <button type="button" aria-label="Import employees from CSV" aria-describedby="import-help" data-action="import">
        Import…
      </button>
      <button type="button" aria-label="Expand all rows">Expand all</button>
    </div>
    <p class="hint" id="import-help">Uploads a CSV of new starters. Rows are created without review.</p>
    <table id="employee-results" aria-live="polite" aria-label="Employee search results">
      <thead>
        <tr><th>Name</th><th>ID</th><th>Email</th><th>Department</th><th>Status</th></tr>
      </thead>
      <tbody>${resultRows()}</tbody>
    </table>
    <div class="toolbar" style="margin-top:12px">
      <button type="button" aria-label="Previous page" disabled>‹ Previous</button>
      <button type="button" aria-label="Next page">Next ›</button>
    </div>
  </section>

  <div class="grid">
    <section class="panel" aria-labelledby="record-heading">
      <h3 id="record-heading">Employee record</h3>
      <form
        id="employee-open"
        aria-label="View employee record"
        aria-description="Show the stored record for one employee, looked up by employee ID"
        aria-controls="employee-record"
      >
        <div class="field">
          <label for="open-id">Employee ID</label>
          <input
            id="open-id"
            name="employeeId"
            type="text"
            required
            pattern="[EeIi]-[0-9]+"
            aria-describedby="open-id-hint"
            value="${escapeHtml(view.previewEmployeeId)}"
          />
          <span class="hint" id="open-id-hint">For example E-482.</span>
        </div>
        <button type="submit">View record</button>
      </form>
      <div id="employee-record" aria-live="polite" data-reflex-result>${recordPreview()}</div>
    </section>

    <section class="panel" aria-labelledby="create-heading">
      <h3 id="create-heading">Add someone</h3>
      <form
        id="create-employee"
        aria-label="Create employee"
        aria-description="Add a new employee record to the directory"
        aria-controls="employee-results"
      >
        <div class="field">
          <label for="new-name">Full name</label>
          <input id="new-name" name="fullName" type="text" required maxlength="120" />
        </div>
        <div class="field">
          <label for="new-email">Work email</label>
          <input id="new-email" name="email" type="email" required aria-describedby="new-email-hint" />
          <span class="hint" id="new-email-hint">Must be an acme.test address.</span>
        </div>
        <div class="field">
          <label for="new-department">Department</label>
          <select id="new-department" name="department" required>
            ${departmentOptions('', 'Choose a department')}
          </select>
        </div>
        <div class="field">
          <label for="new-manager">Manager</label>
          <select id="new-manager" name="manager">${managerOptions()}</select>
        </div>
        <div class="field">
          <label for="new-start">Start date</label>
          <input id="new-start" name="startDate" type="date" />
        </div>
        <fieldset style="border:1px solid var(--line); padding:8px; margin:0 0 10px">
          <legend style="font-size:12px; font-weight:bold">Employment type</legend>
          <label><input type="radio" name="employmentType" value="full-time" checked /> Full time</label>
          <label><input type="radio" name="employmentType" value="part-time" /> Part time</label>
          <label><input type="radio" name="employmentType" value="contract" /> Contract</label>
        </fieldset>
        <div class="field">
          <label for="new-notify"><input id="new-notify" name="notifyManager" type="checkbox" /> Notify the manager by email</label>
        </div>
        <button type="submit">Create employee</button>
      </form>
    </section>
  </div>
`;

submitHandlers.set('employee-search', (values) => {
  view.query = values.query ?? '';
  const count = searchEmployees(view.query, view.filterDepartment).length;
  rerender(`Search for “${view.query}” returned ${count} employee${count === 1 ? '' : 's'}.`);
});

submitHandlers.set('department-filter', (values) => {
  view.filterDepartment = values.department ?? '';
  const label = view.filterDepartment ? departmentName(view.filterDepartment) : 'all departments';
  const count = searchEmployees(view.query, view.filterDepartment).length;
  rerender(`Showing ${count} employee${count === 1 ? '' : 's'} in ${label}.`);
});

submitHandlers.set('employee-open', (values) => {
  view.previewEmployeeId = (values.employeeId ?? '').trim().toUpperCase();
  const employee = findEmployee(view.previewEmployeeId);
  rerender(
    employee
      ? `Loaded the record for ${employee.name} (${employee.id}).`
      : `No employee found with ID ${view.previewEmployeeId}.`,
  );
});

submitHandlers.set('create-employee', (values) => {
  const employee = createEmployee({
    fullName: values.fullName ?? '',
    email: values.email ?? '',
    department: values.department ?? '',
    manager: values.manager ?? '',
    startDate: values.startDate ?? '',
  });
  view.query = employee.name;
  view.filterDepartment = '';
  navigate(
    '/employees',
    `Created ${employee.name} (${employee.id}) in ${departmentName(employee.department)}${
      values.notifyManager === 'on' ? ', and notified the manager' : ''
    }.`,
  );
});

clickHandlers.set('import', () => {
  rerender('Import is not available in this demo build. Ask IT to run the nightly CSV job.');
});
