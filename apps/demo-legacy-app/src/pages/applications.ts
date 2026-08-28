import { submitHandlers } from '../actions.js';
import { APPLICATIONS, applicationName, departmentName, store } from '../data.js';
import { escapeHtml } from '../dom.js';
import { rerender } from '../main.js';
import { view } from '../state.js';

const owners = (): string[] => Array.from(new Set(APPLICATIONS.map((application) => application.owner)));

const catalogRows = (): string => {
  const rows = APPLICATIONS.filter(
    (application) => !view.ownerFilter || application.owner === view.ownerFilter,
  );
  if (!rows.length) return `<tr><td colspan="4">No applications match this owner.</td></tr>`;
  return rows
    .map((application) => {
      const holders = store.employees.filter((employee) => employee.applications.includes(application.id));
      return `
        <tr>
          <td>${escapeHtml(application.name)}</td>
          <td>${escapeHtml(application.owner)}</td>
          <td>${application.standardFor.map(departmentName).map(escapeHtml).join(', ') || '—'}</td>
          <td>${holders.length}</td>
        </tr>`;
    })
    .join('');
};

const holderRows = (): string => {
  if (!view.holdersApplicationId) {
    return `<tr><td colspan="3">Choose an application to list the people who hold it.</td></tr>`;
  }
  const holders = store.employees.filter((employee) =>
    employee.applications.includes(view.holdersApplicationId),
  );
  if (!holders.length) {
    return `<tr><td colspan="3">Nobody currently holds ${escapeHtml(applicationName(view.holdersApplicationId))}.</td></tr>`;
  }
  return holders
    .map(
      (employee) => `
        <tr>
          <td><a href="/employees/${employee.id}">${escapeHtml(employee.name)}</a></td>
          <td>${escapeHtml(employee.id)}</td>
          <td>${escapeHtml(departmentName(employee.department))}</td>
        </tr>`,
    )
    .join('');
};

export const renderApplications = (): string => `
  <h2>Applications</h2>
  <p class="lede">The application catalogue and who has access to what.</p>

  <section class="panel" aria-labelledby="catalog-heading">
    <h3 id="catalog-heading">Catalogue</h3>
    <form
      id="application-filter"
      aria-label="Filter applications by owner"
      aria-description="Show only the applications owned by one team"
      aria-controls="application-catalog"
    >
      <div class="field">
        <label for="owner-filter">Owning team</label>
        <select id="owner-filter" name="owner">
          <option value="">All teams</option>
          ${owners()
            .map(
              (owner) =>
                `<option value="${escapeHtml(owner)}"${owner === view.ownerFilter ? ' selected' : ''}>${escapeHtml(owner)}</option>`,
            )
            .join('')}
        </select>
      </div>
      <button type="submit">Apply filter</button>
    </form>
    <table id="application-catalog" aria-live="polite" aria-label="Application catalogue">
      <thead><tr><th>Application</th><th>Owner</th><th>Standard for</th><th>Users</th></tr></thead>
      <tbody>${catalogRows()}</tbody>
    </table>
  </section>

  <section class="panel" aria-labelledby="holders-heading">
    <h3 id="holders-heading">Access report</h3>
    <form
      id="list-application-holders"
      aria-label="List application holders"
      aria-description="Show every employee who has access to one application"
      aria-controls="holders-table"
    >
      <div class="field">
        <label for="holders-app">Application</label>
        <select id="holders-app" name="application" required>
          <option value="">Choose an application</option>
          ${APPLICATIONS.map(
            (application) =>
              `<option value="${application.id}"${application.id === view.holdersApplicationId ? ' selected' : ''}>${application.name}</option>`,
          ).join('')}
        </select>
      </div>
      <button type="submit">List holders</button>
    </form>
    <table id="holders-table" aria-live="polite" aria-label="Employees holding the selected application">
      <thead><tr><th>Name</th><th>ID</th><th>Department</th></tr></thead>
      <tbody>${holderRows()}</tbody>
    </table>
  </section>
`;

submitHandlers.set('application-filter', (values) => {
  view.ownerFilter = values.owner ?? '';
  rerender(view.ownerFilter ? `Showing applications owned by ${view.ownerFilter}.` : 'Showing all applications.');
});

submitHandlers.set('list-application-holders', (values) => {
  view.holdersApplicationId = values.application ?? '';
  const count = store.employees.filter((employee) =>
    employee.applications.includes(view.holdersApplicationId),
  ).length;
  rerender(
    `${count} employee${count === 1 ? '' : 's'} currently hold ${applicationName(view.holdersApplicationId)}.`,
  );
});
