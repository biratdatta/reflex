import { clickHandlers, submitHandlers } from '../actions.js';
import {
  APPLICATIONS,
  DEPARTMENTS,
  applicationName,
  departmentName,
  findEmployee,
  roleName,
  statusLabel,
  type Employee,
} from '../data.js';
import { escapeHtml } from '../dom.js';
import { rerender } from '../main.js';
import { view } from '../state.js';

const currentEmployee = (): Employee | undefined => {
  const match = window.location.pathname.match(/^\/employees\/([^/]+)$/);
  return match ? findEmployee(decodeURIComponent(match[1])) : undefined;
};

const applicationRows = (employee: Employee): string => {
  const filter = view.applicationStatusFilter;
  const rows = APPLICATIONS.filter((application) => {
    const held = employee.applications.includes(application.id);
    if (filter === 'assigned') return held;
    if (filter === 'available') return !held;
    return true;
  });
  if (!rows.length) return `<tr><td colspan="4">Nothing to show for this filter.</td></tr>`;
  return rows
    .map((application) => {
      const held = employee.applications.includes(application.id);
      const standard = application.standardFor.includes(employee.department);
      return `
        <tr>
          <td>${escapeHtml(application.name)}</td>
          <td>${escapeHtml(application.owner)}</td>
          <td>${held ? 'Assigned' : 'Not assigned'}</td>
          <td>${standard ? 'Standard for this department' : '—'}</td>
        </tr>`;
    })
    .join('');
};

export const renderEmployeeDetail = (id: string): string => {
  const employee = findEmployee(id);
  if (!employee) {
    return `
      <h2>Employee not found</h2>
      <p class="lede">No employee has the ID “${escapeHtml(id)}”.</p>
      <p><a href="/employees">Back to the directory</a></p>
    `;
  }

  const assigned = employee.applications;
  const available = APPLICATIONS.filter((application) => !assigned.includes(application.id));

  return `
    <h2>${escapeHtml(employee.name)}</h2>
    <p class="lede">${escapeHtml(employee.id)} · ${escapeHtml(departmentName(employee.department))} ·
      <span class="status-pill ${employee.status}">${statusLabel(employee.status)}</span></p>

    <div class="grid">
      <section class="panel" aria-labelledby="summary-heading">
        <h3 id="summary-heading">Record</h3>
        <div id="employee-record" aria-live="polite" data-reflex-result>
          <dl class="record">
            <dt>Name</dt><dd>${escapeHtml(employee.name)}</dd>
            <dt>Employee ID</dt><dd>${escapeHtml(employee.id)}</dd>
            <dt>Email</dt><dd>${escapeHtml(employee.email)}</dd>
            <dt>Department</dt><dd>${escapeHtml(departmentName(employee.department))}</dd>
            <dt>Manager</dt><dd>${escapeHtml(employee.manager)}</dd>
            <dt>Start date</dt><dd>${escapeHtml(employee.startDate)}</dd>
            <dt>Status</dt><dd>${statusLabel(employee.status)}</dd>
            <dt>Roles</dt><dd>${employee.roles.map(roleName).map(escapeHtml).join(', ')}</dd>
          </dl>
        </div>
      </section>

      <section class="panel" aria-labelledby="move-heading">
        <h3 id="move-heading">Organisation</h3>
        <form
          id="change-department"
          aria-label="Change department"
          aria-description="Move this employee to another department"
          aria-controls="employee-record"
        >
          <div class="field">
            <label for="new-dept">New department</label>
            <select id="new-dept" name="department" required>
              <option value="">Choose a department</option>
              ${DEPARTMENTS.filter((department) => department.id !== employee.department)
                .map((department) => `<option value="${department.id}">${department.name}</option>`)
                .join('')}
            </select>
          </div>
          <div class="field">
            <label for="effective">Effective date</label>
            <input id="effective" name="effectiveDate" type="date" aria-describedby="effective-hint" />
            <span class="hint" id="effective-hint">Leave blank to apply the move today.</span>
          </div>
          <div class="field">
            <label for="move-reason">Reason</label>
            <textarea id="move-reason" name="reason" rows="2" maxlength="200"></textarea>
          </div>
          <button type="submit">Change department</button>
        </form>
      </section>
    </div>

    <section class="panel" aria-labelledby="apps-heading">
      <div class="toolbar">
        <h3 id="apps-heading" style="flex:1">Application access</h3>
        <button type="button" aria-label="Collapse this section">Collapse</button>
      </div>

      <div class="row">
        <form
          id="list-applications"
          aria-label="List employee applications"
          aria-description="Show the applications this employee holds"
          aria-controls="application-table"
        >
          <div class="field">
            <label for="app-filter">Show</label>
            <select id="app-filter" name="status">
              <option value="">All applications</option>
              <option value="assigned"${view.applicationStatusFilter === 'assigned' ? ' selected' : ''}>Assigned only</option>
              <option value="available"${view.applicationStatusFilter === 'available' ? ' selected' : ''}>Not assigned</option>
            </select>
          </div>
          <button type="submit">List applications</button>
        </form>

        <form
          id="assign-application"
          aria-label="Assign application"
          aria-description="Grant this employee access to an application"
          aria-controls="application-table"
        >
          <div class="field">
            <label for="assign-app">Application</label>
            <select id="assign-app" name="application" required>
              <option value="">Choose an application</option>
              ${available.map((application) => `<option value="${application.id}">${application.name}</option>`).join('')}
            </select>
          </div>
          <button type="submit">Assign</button>
        </form>

        <form
          id="revoke-application"
          aria-label="Revoke application access"
          aria-description="Remove this employee's access to an application"
          aria-controls="application-table"
        >
          <div class="field">
            <label for="revoke-app">Application</label>
            <select id="revoke-app" name="application" required>
              <option value="">Choose an application</option>
              ${assigned
                .map((appId) => `<option value="${appId}">${escapeHtml(applicationName(appId))}</option>`)
                .join('')}
            </select>
          </div>
          <button type="submit" class="danger">Revoke access</button>
        </form>
      </div>

      <table id="application-table" aria-live="polite" aria-label="Application access for this employee">
        <thead><tr><th>Application</th><th>Owner</th><th>Access</th><th>Notes</th></tr></thead>
        <tbody>${applicationRows(employee)}</tbody>
      </table>
    </section>

    <section class="panel" aria-labelledby="danger-heading">
      <h3 id="danger-heading">Account actions</h3>
      <div class="toolbar">
        <button
          type="button"
          aria-label="Reset password"
          aria-description="Email this employee a link to choose a new password"
          data-action="reset-password"
        >
          Reset password
        </button>
        <button
          type="button"
          class="danger"
          aria-label="Deactivate employee"
          aria-describedby="deactivate-help"
          aria-controls="employee-record"
          data-action="deactivate"
          ${employee.status === 'deactivated' ? 'disabled' : ''}
        >
          Deactivate
        </button>
      </div>
      <p class="hint" id="deactivate-help">Prevents this employee from signing in to any ACME application.</p>

      <form
        id="set-temporary-password"
        aria-label="Set temporary password"
        aria-description="Set a one-time password this employee must change at next sign-in"
      >
        <div class="field">
          <label for="temp-password">Temporary password</label>
          <input id="temp-password" name="temporaryPassword" type="password" minlength="12" required />
        </div>
        <button type="submit">Set password</button>
      </form>
    </section>

    <p><a href="/employees">Back to the directory</a></p>
  `;
};

submitHandlers.set('change-department', (values) => {
  const employee = currentEmployee();
  if (!employee) return;
  const previous = departmentName(employee.department);
  employee.department = values.department ?? employee.department;
  rerender(
    `Moved ${employee.name} from ${previous} to ${departmentName(employee.department)}` +
      `${values.effectiveDate ? `, effective ${values.effectiveDate}` : ''}.`,
  );
});

submitHandlers.set('list-applications', (values) => {
  const employee = currentEmployee();
  if (!employee) return;
  view.applicationStatusFilter = values.status ?? '';
  rerender(
    `${employee.name} holds ${employee.applications.length} application${
      employee.applications.length === 1 ? '' : 's'
    }: ${employee.applications.map(applicationName).join(', ')}.`,
  );
});

submitHandlers.set('assign-application', (values) => {
  const employee = currentEmployee();
  if (!employee || !values.application) return;
  if (!employee.applications.includes(values.application)) employee.applications.push(values.application);
  rerender(`Granted ${employee.name} access to ${applicationName(values.application)}.`);
});

submitHandlers.set('revoke-application', (values) => {
  const employee = currentEmployee();
  if (!employee || !values.application) return;
  employee.applications = employee.applications.filter((appId) => appId !== values.application);
  rerender(`Revoked ${employee.name}'s access to ${applicationName(values.application)}.`);
});

submitHandlers.set('set-temporary-password', () => {
  const employee = currentEmployee();
  if (!employee) return;
  rerender(`Set a temporary password for ${employee.name}. They must change it at next sign-in.`);
});

clickHandlers.set('deactivate', () => {
  const employee = currentEmployee();
  if (!employee) return;
  employee.status = 'deactivated';
  rerender(`Deactivated ${employee.name}. They can no longer sign in.`);
});

clickHandlers.set('reset-password', () => {
  const employee = currentEmployee();
  if (!employee) return;
  rerender(`Sent a password reset link to ${employee.email}.`);
});
