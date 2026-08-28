import { submitHandlers } from '../actions.js';
import { findClaim, money, store } from '../data.js';
import { escapeHtml } from '../dom.js';
import { rerender } from '../main.js';
import { view } from '../state.js';

const METHOD_NAMES: Record<string, string> = {
  bacs: 'Bank transfer',
  cheque: 'Cheque',
  'card-refund': 'Card refund',
};

const paymentRows = (): string => {
  const rows = store.payments.filter(
    (payment) =>
      !view.paymentQuery ||
      payment.claimReference.toLowerCase().includes(view.paymentQuery.toLowerCase()) ||
      payment.id.toLowerCase().includes(view.paymentQuery.toLowerCase()),
  );
  if (!rows.length) return `<tr><td colspan="5">No payments match this search.</td></tr>`;
  return rows
    .map(
      (payment) => `
        <tr>
          <td class="ref">${escapeHtml(payment.id)}</td>
          <td><a class="ref" href="/claims/${payment.claimReference}">${escapeHtml(payment.claimReference)}</a></td>
          <td>${money(payment.amount)}</td>
          <td>${escapeHtml(METHOD_NAMES[payment.method] ?? payment.method)}</td>
          <td><span class="tag ${payment.status}">${payment.status}</span></td>
        </tr>`,
    )
    .join('');
};

export const renderPayments = () => `
  <h1>Payments</h1>
  <p class="lede">Track settlement payments issued against approved claims.</p>

  <section class="card" aria-labelledby="payment-search-heading">
    <h3 id="payment-search-heading">Find a payment</h3>
    <form
      id="payment-search"
      aria-label="Search payments"
      aria-description="Find settlement payments by claim reference or payment number"
      aria-controls="payments-table"
    >
      <div class="field">
        <label for="payment-query">Claim reference or payment number</label>
        <span class="hint" id="payment-query-hint">For example CLM-2026-0298 or PAY-77120.</span>
        <input
          id="payment-query"
          name="query"
          type="text"
          required
          maxlength="40"
          aria-describedby="payment-query-hint"
          value="${escapeHtml(view.paymentQuery)}"
        />
      </div>
      <button type="submit">Search payments</button>
    </form>
  </section>

  <section class="card plain" aria-labelledby="payment-list-heading">
    <h3 id="payment-list-heading">Payment history</h3>
    <table id="payments-table" aria-live="polite" aria-label="Settlement payments">
      <thead><tr><th>Payment</th><th>Claim</th><th>Amount</th><th>Method</th><th>Status</th></tr></thead>
      <tbody>${paymentRows()}</tbody>
    </table>
  </section>

  <section class="card plain" aria-labelledby="statement-heading">
    <h3 id="statement-heading">Statements</h3>
    <form
      id="request-statement"
      aria-label="Send payment statement"
      aria-description="Email a statement of all payments on a claim to the claimant"
      aria-controls="payments-table"
    >
      <div class="row">
        <div class="field">
          <label for="statement-claim">Claim reference</label>
          <input id="statement-claim" name="claimReference" type="text" required pattern="[Cc][Ll][Mm]-[0-9]{4}-[0-9]{4}" />
        </div>
        <div class="field">
          <label for="statement-email">Send to</label>
          <input id="statement-email" name="email" type="email" required />
        </div>
      </div>
      <button type="submit">Send statement</button>
    </form>
  </section>
`;

submitHandlers.set('payment-search', (values) => {
  view.paymentQuery = values.query ?? '';
  const count = store.payments.filter(
    (payment) =>
      payment.claimReference.toLowerCase().includes(view.paymentQuery.toLowerCase()) ||
      payment.id.toLowerCase().includes(view.paymentQuery.toLowerCase()),
  ).length;
  rerender(`Found ${count} payment${count === 1 ? '' : 's'} matching “${view.paymentQuery}”.`);
});

submitHandlers.set('request-statement', (values) => {
  const claim = findClaim(values.claimReference ?? '');
  rerender(
    claim
      ? `Statement for ${claim.reference} sent to ${values.email}.`
      : `No claim found with reference ${values.claimReference}.`,
  );
});
