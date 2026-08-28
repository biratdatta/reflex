import { clickHandlers, submitHandlers } from '../actions.js';
import {
  CLAIM_STATUSES,
  CLAIM_TYPES,
  DISTRICTS,
  claimTypeName,
  districtName,
  fileClaim,
  findClaim,
  money,
  searchClaims,
  statusName,
  store,
} from '../data.js';
import { escapeHtml } from '../dom.js';
import { navigate, rerender } from '../main.js';
import { view } from '../state.js';

const options = (
  items: Array<{ id: string; name: string }>,
  selected: string,
  placeholder: string,
): string =>
  [
    `<option value="">${placeholder}</option>`,
    ...items.map(
      (item) => `<option value="${item.id}"${item.id === selected ? ' selected' : ''}>${item.name}</option>`,
    ),
  ].join('');

const claimRows = (): string => {
  const results = searchClaims(view.query, view.statusFilter);
  if (!results.length) {
    return `<tr><td colspan="6">No claims match the current search.</td></tr>`;
  }
  return results
    .map(
      (claim) => `
        <tr>
          <td><a class="ref" href="/claims/${claim.reference}">${escapeHtml(claim.reference)}</a></td>
          <td>${escapeHtml(claim.claimant)}</td>
          <td>${escapeHtml(claimTypeName(claim.type))}</td>
          <td>${escapeHtml(claim.incidentDate)}</td>
          <td>${money(claim.amountClaimed)}</td>
          <td><span class="tag ${claim.status}">${statusName(claim.status)}</span></td>
        </tr>`,
    )
    .join('');
};

const claimPreview = (): string => {
  if (!view.previewReference) {
    return `<p class="caption">No claim loaded. Use “View claim record” to look one up by reference.</p>`;
  }
  const claim = findClaim(view.previewReference);
  if (!claim) {
    return `<p class="caption">No claim found with reference “${escapeHtml(view.previewReference)}”.</p>`;
  }
  return `
    <dl class="record">
      <div><dt>Reference</dt><dd class="ref">${escapeHtml(claim.reference)}</dd></div>
      <div><dt>Claimant</dt><dd>${escapeHtml(claim.claimant)}</dd></div>
      <div><dt>Policy number</dt><dd class="ref">${escapeHtml(claim.policyNumber)}</dd></div>
      <div><dt>Claim type</dt><dd>${escapeHtml(claimTypeName(claim.type))}</dd></div>
      <div><dt>Amount claimed</dt><dd>${money(claim.amountClaimed)}</dd></div>
      <div><dt>Status</dt><dd><span class="tag ${claim.status}">${statusName(claim.status)}</span></dd></div>
      <div><dt>Handling office</dt><dd>${escapeHtml(districtName(claim.district))}</dd></div>
    </dl>
    <p style="margin:14px 0 0"><a href="/claims/${claim.reference}">Open the full record for ${escapeHtml(claim.reference)}</a></p>
  `;
};

const tiles = (): string => {
  const total = store.claims.length;
  const awaiting = store.claims.filter((claim) => claim.status === 'awaiting-documents').length;
  const review = store.claims.filter((claim) => claim.status === 'under-review').length;
  const paid = store.claims.filter((claim) => claim.status === 'paid').length;
  return `
    <div class="tiles">
      <div class="tile"><div class="value">${total}</div><div class="label">Open on this desk</div></div>
      <div class="tile amber"><div class="value">${awaiting}</div><div class="label">Awaiting documents</div></div>
      <div class="tile grey"><div class="value">${review}</div><div class="label">Under review</div></div>
      <div class="tile green"><div class="value">${paid}</div><div class="label">Paid this year</div></div>
    </div>
  `;
};

export const renderClaims = (): string => `
  <h1>Claims register</h1>
  <p class="lede">
    Search claims filed against a policy, look up a single record, or file a new claim on a
    claimant's behalf.
  </p>

  ${tiles()}

  <section class="card" aria-labelledby="find-heading">
    <h3 id="find-heading">Find a claim</h3>
    <div class="row">
      <form
        id="claim-search"
        aria-label="Search claims"
        aria-description="Find a claim by reference number, claimant name or policy number"
        aria-controls="claims-results"
      >
        <div class="field">
          <label for="claim-query">Reference, claimant or policy number</label>
          <span class="hint" id="claim-query-hint">For example CLM-2026-0481, Okonkwo, or POL-4471-882.</span>
          <input
            id="claim-query"
            name="query"
            type="text"
            required
            maxlength="60"
            aria-describedby="claim-query-hint"
            value="${escapeHtml(view.query)}"
          />
        </div>
        <button type="submit">Search claims</button>
      </form>

      <form
        id="status-filter"
        aria-label="Filter claims by status"
        aria-description="Show only the claims at one stage of processing"
        aria-controls="claims-results"
      >
        <div class="field">
          <label for="filter-status">Processing stage</label>
          <select id="filter-status" name="status">
            ${options(CLAIM_STATUSES, view.statusFilter, 'Any stage')}
          </select>
        </div>
        <button type="submit" class="secondary">Apply filter</button>
      </form>
    </div>
  </section>

  <section class="card plain" aria-labelledby="register-heading">
    <div class="actions" style="justify-content:space-between; margin-bottom:14px">
      <h3 id="register-heading" style="margin:0">Claims on this desk</h3>
      <div class="actions">
        <button
          type="button"
          class="secondary small"
          aria-label="Import claims from CSV"
          aria-describedby="import-help"
          data-action="import"
        >
          Import…
        </button>
        <button type="button" class="secondary small" aria-label="Expand all rows" data-action="noop">Expand all</button>
        <button type="button" class="secondary small" aria-label="Print this page" data-action="noop">Print</button>
      </div>
    </div>
    <p class="hint" id="import-help">
      Uploads a CSV of claims from a district office. Rows are created without caseworker review.
    </p>
    <table id="claims-results" aria-live="polite" aria-label="Claims matching the current search">
      <caption>Ordered by date received. Select a reference to open the full record.</caption>
      <thead>
        <tr><th>Reference</th><th>Claimant</th><th>Type</th><th>Incident date</th><th>Amount</th><th>Stage</th></tr>
      </thead>
      <tbody>${claimRows()}</tbody>
    </table>
    <div class="actions" style="margin-top:16px">
      <button type="button" class="secondary small" aria-label="Previous page" disabled>‹ Previous</button>
      <button type="button" class="secondary small" aria-label="Next page" data-action="noop">Next ›</button>
      <button type="button" class="secondary small" aria-label="Back to top" data-action="noop">Back to top</button>
    </div>
  </section>

  <div class="grid">
    <section class="card plain" aria-labelledby="record-heading">
      <h3 id="record-heading">Claim record</h3>
      <form
        id="claim-lookup"
        aria-label="View claim record"
        aria-description="Show the stored record for one claim, looked up by its reference number"
        aria-controls="claim-record"
      >
        <div class="field">
          <label for="lookup-reference">Claim reference</label>
          <span class="hint" id="lookup-hint">Eight digits in the form CLM-2026-0481.</span>
          <input
            id="lookup-reference"
            name="reference"
            type="text"
            required
            pattern="[Cc][Ll][Mm]-[0-9]{4}-[0-9]{4}"
            aria-describedby="lookup-hint"
            value="${escapeHtml(view.previewReference)}"
          />
        </div>
        <button type="submit" class="secondary">View record</button>
      </form>
      <div id="claim-record" aria-live="polite" data-reflex-result style="margin-top:18px">${claimPreview()}</div>
    </section>

    <section class="card" aria-labelledby="file-heading">
      <h3 id="file-heading">File a claim</h3>
      <ol class="steps" aria-label="Progress">
        <li aria-current="step">1. Claim details</li>
        <li>2. Evidence</li>
        <li>3. Declaration</li>
      </ol>
      <form
        id="file-claim"
        aria-label="File new claim"
        aria-description="Start a new insurance claim against an active policy"
        aria-controls="claims-results"
      >
        <div class="field">
          <label for="new-policy">Policy number</label>
          <span class="hint" id="new-policy-hint">Shown on the certificate of cover, as POL-0000-000.</span>
          <input
            id="new-policy"
            name="policyNumber"
            type="text"
            required
            pattern="[Pp][Oo][Ll]-[0-9]{4}-[0-9]{3}"
            aria-describedby="new-policy-hint"
          />
        </div>
        <div class="field">
          <label for="new-type">What are you claiming for?</label>
          <select id="new-type" name="claimType" required>
            ${options(CLAIM_TYPES, '', 'Choose a claim type')}
          </select>
        </div>
        <div class="field">
          <label for="new-incident">Date of the incident</label>
          <span class="hint" id="new-incident-hint">Claims must be filed within 90 days of the incident.</span>
          <input id="new-incident" name="incidentDate" type="date" required aria-describedby="new-incident-hint" />
        </div>
        <div class="field">
          <label for="new-amount">Amount claimed</label>
          <span class="hint" id="new-amount-hint">In whole units of currency, between 100 and 500,000.</span>
          <input
            id="new-amount"
            name="amountClaimed"
            type="number"
            required
            min="100"
            max="500000"
            aria-describedby="new-amount-hint"
          />
        </div>
        <div class="field">
          <label for="new-district">Handling office</label>
          <select id="new-district" name="district" required>${options(DISTRICTS, '', 'Choose an office')}</select>
        </div>
        <div class="field">
          <label for="new-description">Describe what happened</label>
          <textarea id="new-description" name="description" maxlength="500" rows="3"></textarea>
        </div>
        <div class="field">
          <label for="new-email">Contact email address</label>
          <input id="new-email" name="contactEmail" type="email" required />
        </div>
        <fieldset>
          <legend>How should we contact you about this claim?</legend>
          <div class="choice">
            <input id="contact-email" type="radio" name="preferredContact" value="email" checked />
            <label for="contact-email">By email</label>
          </div>
          <div class="choice">
            <input id="contact-phone" type="radio" name="preferredContact" value="phone" />
            <label for="contact-phone">By telephone</label>
          </div>
          <div class="choice">
            <input id="contact-post" type="radio" name="preferredContact" value="post" />
            <label for="contact-post">By post</label>
          </div>
        </fieldset>
        <div class="choice">
          <input id="new-urgent" type="checkbox" name="urgentReview" />
          <label for="new-urgent">Request urgent review (property is uninhabitable)</label>
        </div>
        <button type="submit" style="margin-top:12px">File claim</button>
      </form>
    </section>
  </div>
`;

submitHandlers.set('claim-search', (values) => {
  view.query = values.query ?? '';
  const count = searchClaims(view.query, view.statusFilter).length;
  rerender(`Search for “${view.query}” returned ${count} claim${count === 1 ? '' : 's'}.`);
});

submitHandlers.set('status-filter', (values) => {
  view.statusFilter = values.status ?? '';
  const label = view.statusFilter ? statusName(view.statusFilter).toLowerCase() : 'any stage';
  const count = searchClaims(view.query, view.statusFilter).length;
  rerender(`Showing ${count} claim${count === 1 ? '' : 's'} at ${label}.`);
});

submitHandlers.set('claim-lookup', (values) => {
  view.previewReference = (values.reference ?? '').trim().toUpperCase();
  const claim = findClaim(view.previewReference);
  rerender(
    claim
      ? `Loaded claim ${claim.reference} for ${claim.claimant}, ${statusName(claim.status).toLowerCase()}.`
      : `No claim found with reference ${view.previewReference}.`,
  );
});

submitHandlers.set('file-claim', (values) => {
  const claim = fileClaim({
    policyNumber: values.policyNumber ?? '',
    claimType: values.claimType ?? '',
    incidentDate: values.incidentDate ?? '',
    amountClaimed: values.amountClaimed ?? '0',
    district: values.district ?? '',
    description: values.description ?? '',
    contactEmail: values.contactEmail ?? '',
  });
  view.query = claim.reference;
  view.statusFilter = '';
  navigate(
    '/claims',
    `Filed claim ${claim.reference} for ${money(claim.amountClaimed)} against policy ${claim.policyNumber}` +
      `${values.urgentReview === 'on' ? ', flagged for urgent review' : ''}.`,
  );
});

clickHandlers.set('import', () => {
  rerender('Bulk import runs overnight. Ask the district office to place the CSV in the transfer folder.');
});
