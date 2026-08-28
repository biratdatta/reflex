import { submitHandlers } from '../actions.js';
import { findPolicy, money, store } from '../data.js';
import { escapeHtml } from '../dom.js';
import { rerender } from '../main.js';
import { view } from '../state.js';

const policyRows = (): string =>
  store.policies
    .filter((policy) => !view.policyStatusFilter || policy.status === view.policyStatusFilter)
    .map(
      (policy) => `
        <tr>
          <td class="ref">${escapeHtml(policy.number)}</td>
          <td>${escapeHtml(policy.holder)}</td>
          <td>${escapeHtml(policy.product)}</td>
          <td>${money(policy.premium)} / month</td>
          <td>${escapeHtml(policy.renewalDate)}</td>
          <td><span class="tag ${policy.status}">${policy.status}</span></td>
        </tr>`,
    )
    .join('') || `<tr><td colspan="6">No policies match this filter.</td></tr>`;

export const renderPolicies = (): string => `
  <h1>Policies</h1>
  <p class="lede">Confirm cover before accepting a claim, renew an expiring policy, or end cover.</p>

  <section class="card" aria-labelledby="check-heading">
    <h3 id="check-heading">Confirm cover</h3>
    <form
      id="policy-check"
      aria-label="Check policy status"
      aria-description="Confirm whether a policy was active on the date of an incident"
      aria-controls="policy-outcome"
    >
      <div class="row">
        <div class="field">
          <label for="check-policy">Policy number</label>
          <span class="hint" id="check-policy-hint">As printed on the certificate of cover.</span>
          <input
            id="check-policy"
            name="policyNumber"
            type="text"
            required
            pattern="[Pp][Oo][Ll]-[0-9]{4}-[0-9]{3}"
            aria-describedby="check-policy-hint"
          />
        </div>
        <div class="field">
          <label for="check-date">Date of incident</label>
          <input id="check-date" name="onDate" type="date" required />
        </div>
      </div>
      <button type="submit">Check cover</button>
    </form>
    <div id="policy-outcome" aria-live="polite" data-reflex-result style="margin-top:16px">
      <p class="caption">No policy checked yet.</p>
    </div>
  </section>

  <div class="grid">
    <section class="card plain" aria-labelledby="renew-heading">
      <h3 id="renew-heading">Renewal</h3>
      <form
        id="renew-policy"
        aria-label="Renew policy"
        aria-description="Extend an active policy for a further twelve months"
        aria-controls="policy-table"
      >
        <div class="field">
          <label for="renew-number">Policy number</label>
          <input id="renew-number" name="policyNumber" type="text" required pattern="[Pp][Oo][Ll]-[0-9]{4}-[0-9]{3}" />
        </div>
        <fieldset>
          <legend>How will the premium be collected?</legend>
          <div class="choice">
            <input id="freq-monthly" type="radio" name="paymentFrequency" value="monthly" checked />
            <label for="freq-monthly">Monthly by direct debit</label>
          </div>
          <div class="choice">
            <input id="freq-annual" type="radio" name="paymentFrequency" value="annual" />
            <label for="freq-annual">Once a year</label>
          </div>
        </fieldset>
        <div class="choice">
          <input id="renew-auto" type="checkbox" name="autoRenew" checked />
          <label for="renew-auto">Renew automatically next year</label>
        </div>
        <button type="submit" style="margin-top:10px">Renew policy</button>
      </form>
    </section>

    <section class="card danger" aria-labelledby="cancel-heading">
      <h3 id="cancel-heading">End cover</h3>
      <p class="inset" id="cancel-help">
        Cancelling ends cover immediately. Claims for incidents after the cancellation date will be
        refused.
      </p>
      <form
        id="cancel-policy"
        aria-label="Cancel policy"
        aria-describedby="cancel-help"
        aria-controls="policy-table"
      >
        <div class="field">
          <label for="cancel-number">Policy number</label>
          <input id="cancel-number" name="policyNumber" type="text" required pattern="[Pp][Oo][Ll]-[0-9]{4}-[0-9]{3}" />
        </div>
        <div class="field">
          <label for="cancel-reason">Reason for cancellation</label>
          <select id="cancel-reason" name="reason" required>
            <option value="">Choose a reason</option>
            <option value="requested">Requested by the policyholder</option>
            <option value="non-payment">Premium not paid</option>
            <option value="fraud">Suspected misrepresentation</option>
          </select>
        </div>
        <button type="submit" class="danger">Cancel policy</button>
      </form>
    </section>
  </div>

  <section class="card plain" aria-labelledby="policy-list-heading">
    <div class="actions" style="justify-content:space-between; margin-bottom:14px">
      <h3 id="policy-list-heading" style="margin:0">Policies on file</h3>
      <form
        id="policy-filter"
        aria-label="Filter policies by status"
        aria-description="Show only the policies in one state of cover"
        aria-controls="policy-table"
      >
        <div class="actions" style="align-items:flex-end">
        <div class="field" style="margin:0">
          <label for="policy-status">Status</label>
          <select id="policy-status" name="status">
            <option value="">All statuses</option>
            <option value="active"${view.policyStatusFilter === 'active' ? ' selected' : ''}>Active</option>
            <option value="lapsed"${view.policyStatusFilter === 'lapsed' ? ' selected' : ''}>Lapsed</option>
            <option value="cancelled"${view.policyStatusFilter === 'cancelled' ? ' selected' : ''}>Cancelled</option>
          </select>
        </div>
        <button type="submit" class="secondary small">Apply</button>
        </div>
      </form>
    </div>
    <table id="policy-table" aria-live="polite" aria-label="Policies on file">
      <thead><tr><th>Number</th><th>Policyholder</th><th>Product</th><th>Premium</th><th>Renews</th><th>Status</th></tr></thead>
      <tbody>${policyRows()}</tbody>
    </table>
  </section>
`;

submitHandlers.set('policy-check', (values) => {
  const policy = findPolicy(values.policyNumber ?? '');
  const outcome = document.getElementById('policy-outcome');
  if (!policy) {
    if (outcome) outcome.innerHTML = `<p><strong>No policy found</strong> with number ${escapeHtml(values.policyNumber ?? '')}.</p>`;
    rerender(`No policy found with number ${values.policyNumber}.`);
    return;
  }
  const covered = policy.status === 'active';
  rerender(
    `Policy ${policy.number} (${policy.product}) held by ${policy.holder} is ${policy.status}. ` +
      `${covered ? 'Cover was in force' : 'Cover was NOT in force'} on ${values.onDate || 'the date given'}. ` +
      `Excess ${money(policy.excess)}.`,
  );
});

submitHandlers.set('policy-filter', (values) => {
  view.policyStatusFilter = values.status ?? '';
  rerender(view.policyStatusFilter ? `Showing ${view.policyStatusFilter} policies.` : 'Showing all policies.');
});

submitHandlers.set('renew-policy', (values) => {
  const policy = findPolicy(values.policyNumber ?? '');
  if (!policy) {
    rerender(`No policy found with number ${values.policyNumber}.`);
    return;
  }
  policy.status = 'active';
  const renewal = new Date(policy.renewalDate);
  renewal.setFullYear(renewal.getFullYear() + 1);
  policy.renewalDate = renewal.toISOString().slice(0, 10);
  rerender(
    `Renewed ${policy.number} for ${policy.holder} until ${policy.renewalDate}, collected ${values.paymentFrequency === 'annual' ? 'annually' : 'monthly'}.`,
  );
});

submitHandlers.set('cancel-policy', (values) => {
  const policy = findPolicy(values.policyNumber ?? '');
  if (!policy) {
    rerender(`No policy found with number ${values.policyNumber}.`);
    return;
  }
  policy.status = 'cancelled';
  rerender(`Cancelled ${policy.number} for ${policy.holder}. Cover has ended.`);
});
