import { announce } from './dom.js';
import { renderApplications } from './pages/applications.js';
import { renderEmployeeDetail } from './pages/employeeDetail.js';
import { renderEmployees } from './pages/employees.js';
import { renderRoles } from './pages/roles.js';

const NAV = [
  { href: '/employees', label: 'Employees' },
  { href: '/roles', label: 'Roles' },
  { href: '/applications', label: 'Applications' },
];

const shell = (path: string, main: string): string => `
  <header class="app-header">
    <h1>ACME Employee Manager</h1>
    <span class="env">Internal · v2.4.1</span>
    <button type="button" aria-label="Toggle navigation menu" aria-expanded="true">☰ Menu</button>
  </header>
  <nav class="app-nav" aria-label="Main">
    ${NAV.map(
      (item) =>
        `<a href="${item.href}"${path.startsWith(item.href) ? ' aria-current="page"' : ''}>${item.label}</a>`,
    ).join('')}
  </nav>
  <p id="app-status" role="status" aria-live="polite"></p>
  <main id="main">${main}</main>
  <footer class="app-footer">
    ACME Corp · Employee Manager · This is a fictional application used to demonstrate Reflex.
  </footer>
`;

const routeTo = (path: string): string => {
  const detail = path.match(/^\/employees\/([^/]+)$/);
  if (detail) return renderEmployeeDetail(decodeURIComponent(detail[1]));
  if (path.startsWith('/roles')) return renderRoles();
  if (path.startsWith('/applications')) return renderApplications();
  return renderEmployees();
};

let lastStatus = '';

export const render = (options: { keepStatus?: boolean } = {}): void => {
  const path = window.location.pathname === '/' ? '/employees' : window.location.pathname;
  const app = document.getElementById('app');
  if (!app) return;
  app.innerHTML = shell(path, routeTo(path));
  if (options.keepStatus && lastStatus) announce(lastStatus);
};

/** Re-render after a mutation, preserving the announced outcome. */
export const rerender = (message?: string): void => {
  if (message !== undefined) lastStatus = message;
  render({ keepStatus: true });
};

export const navigate = (path: string, message?: string): void => {
  window.history.pushState({}, '', path);
  lastStatus = message ?? '';
  render({ keepStatus: Boolean(message) });
};

document.addEventListener('click', (event) => {
  const link = (event.target as HTMLElement | null)?.closest('a');
  if (!link) return;
  const href = link.getAttribute('href');
  if (!href || !href.startsWith('/')) return;
  event.preventDefault();
  navigate(href);
});

window.addEventListener('popstate', () => render());

render();
