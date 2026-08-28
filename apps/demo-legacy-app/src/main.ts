import { clickHandlers } from './actions.js';
import { announce } from './dom.js';
import { renderClaimDetail } from './pages/claimDetail.js';
import { renderClaims } from './pages/claims.js';
import { renderPayments } from './pages/payments.js';
import { renderPolicies } from './pages/policies.js';

const NAV = [
  { href: '/claims', label: 'Claims' },
  { href: '/policies', label: 'Policies' },
  { href: '/payments', label: 'Payments' },
];

/** A fictional crest. Generic on purpose: no real agency's emblem. */
const CREST = `
  <svg width="34" height="34" viewBox="0 0 34 34" role="img" aria-hidden="true" focusable="false">
    <path d="M17 2 4 6v11c0 7 5.4 12.7 13 15 7.6-2.3 13-8 13-15V6L17 2z" fill="#1d70b8" stroke="#ffffff" stroke-width="1.5"/>
    <path d="M17 9.5l2.1 4.4 4.7.6-3.5 3.3.9 4.8-4.2-2.4-4.2 2.4.9-4.8-3.5-3.3 4.7-.6L17 9.5z" fill="#ffffff"/>
  </svg>
`;

const shell = (path: string, content: string): string => `
  <header class="masthead">
    <div class="masthead-inner">
      <a class="crest" href="/claims">
        ${CREST}
        <span>
          <span class="service">National Claims Portal</span><br />
          <span class="agency">Department of Insurance Services · State of Marisol</span>
        </span>
      </a>
      <span class="spacer"></span>
      <span class="account">Signed in as <strong>caseworker.dhalloran</strong></span>
      <button type="button" aria-label="Toggle navigation menu" aria-expanded="true">☰ Menu</button>
    </div>
  </header>

  <div class="phase" data-reflex-ignore>
    <div class="phase-inner">
      <span class="tag">DEMO</span>
      <span>
        This is a <strong>fictional service</strong> built to demonstrate Reflex. No real agency, policy or
        claim exists here.
      </span>
      <button type="button" aria-label="Dismiss this notice">Hide this message</button>
    </div>
  </div>

  <nav class="nav" aria-label="Service sections">
    <div class="nav-inner">
      ${NAV.map(
        (item) =>
          `<a href="${item.href}"${path.startsWith(item.href) ? ' aria-current="page"' : ''}>${item.label}</a>`,
      ).join('')}
    </div>
  </nav>

  <div id="service-status" role="status" aria-live="polite"></div>

  <main id="main">${content}</main>

  <footer class="foot">
    <div class="inner">
      <a href="/claims">Claims</a> · <a href="/policies">Policies</a> · <a href="/payments">Payments</a>
      <div class="fine">
        National Claims Portal is a fictional application. It is not affiliated with, and does not
        represent, any real government agency or insurer. Built to demonstrate
        <strong>Reflex</strong> — WebMCP tool discovery from existing semantics.
      </div>
    </div>
  </footer>
`;

const routeTo = (path: string): string => {
  const detail = path.match(/^\/claims\/([^/]+)$/);
  if (detail) return renderClaimDetail(decodeURIComponent(detail[1]));
  if (path.startsWith('/policies')) return renderPolicies();
  if (path.startsWith('/payments')) return renderPayments();
  return renderClaims();
};

let lastStatus = '';

export const render = (options: { keepStatus?: boolean } = {}): void => {
  const path = window.location.pathname === '/' ? '/claims' : window.location.pathname;
  const app = document.getElementById('app');
  if (!app) return;
  app.innerHTML = shell(path, routeTo(path));
  if (options.keepStatus && lastStatus) announce(lastStatus);
};

/** Re-render after a change, keeping the announced outcome visible. */
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

clickHandlers.set('noop', () => {
  /* decoy interface controls do nothing */
});

render();
