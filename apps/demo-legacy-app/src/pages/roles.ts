import { submitHandlers } from '../actions.js';
import { ROLES, findEmployee, roleName, store } from '../data.js';
import { escapeHtml } from '../dom.js';
import { rerender } from '../main.js';

const roleRows = (): string =>
  ROLES.map((role) => {
    const holders = store.employees.filter((employee) => employee.roles.includes(role.id));
    return `
      <tr>
        <td>${escapeHtml(role.name)}</td>
        <td>${escapeHtml(role.description)}</td>
        <td>${holders.length}</td>
        <td>${holders.map((employee) => escapeHtml(employee.name)).join(', ') || '—'}</td>
      </tr>`;
  }).join('');

const roleOptions = (): string =>
  ROLES.map((role) => `<option value="${role.id}">${role.name}</option>`).join('');

export const renderRoles = (): string => `
  <h2>Roles</h2>
  <p class="lede">Roles decide what someone can do inside ACME systems.</p>

  <section class="panel" aria-labelledby="role-admin-heading">
    <h3 id="role-admin-heading">Role assignment</h3>
    <div class="row">
      <form
        id="assign-role"
        aria-label="Assign role"
        aria-description="Grant an ACME role to an employee"
        aria-controls="role-table"
      >
        <div class="field">
          <label for="assign-role-employee">Employee ID</label>
          <input id="assign-role-employee" name="employeeId" type="text" required pattern="[EeIi]-[0-9]+" />
        </div>
        <div class="field">
          <label for="assign-role-role">Role</label>
          <select id="assign-role-role" name="role" required>
            <option value="">Choose a role</option>
            ${roleOptions()}
          </select>
        </div>
        <button type="submit">Assign role</button>
      </form>

      <form
        id="revoke-role"
        aria-label="Revoke role"
        aria-description="Remove an ACME role from an employee"
        aria-controls="role-table"
      >
        <div class="field">
          <label for="revoke-role-employee">Employee ID</label>
          <input id="revoke-role-employee" name="employeeId" type="text" required pattern="[EeIi]-[0-9]+" />
        </div>
        <div class="field">
          <label for="revoke-role-role">Role</label>
          <select id="revoke-role-role" name="role" required>
            <option value="">Choose a role</option>
            ${roleOptions()}
          </select>
        </div>
        <button type="submit" class="danger">Revoke role</button>
      </form>
    </div>
  </section>

  <section class="panel" aria-labelledby="role-list-heading">
    <h3 id="role-list-heading">Defined roles</h3>
    <table id="role-table" aria-live="polite" aria-label="Roles and who holds them">
      <thead><tr><th>Role</th><th>Description</th><th>Holders</th><th>Employees</th></tr></thead>
      <tbody>${roleRows()}</tbody>
    </table>
  </section>
`;

submitHandlers.set('assign-role', (values) => {
  const employee = findEmployee((values.employeeId ?? '').trim());
  if (!employee) {
    rerender(`No employee found with ID ${values.employeeId}.`);
    return;
  }
  if (!employee.roles.includes(values.role)) employee.roles.push(values.role);
  rerender(`Assigned the ${roleName(values.role)} role to ${employee.name}.`);
});

submitHandlers.set('revoke-role', (values) => {
  const employee = findEmployee((values.employeeId ?? '').trim());
  if (!employee) {
    rerender(`No employee found with ID ${values.employeeId}.`);
    return;
  }
  employee.roles = employee.roles.filter((role) => role !== values.role);
  rerender(`Revoked the ${roleName(values.role)} role from ${employee.name}.`);
});
