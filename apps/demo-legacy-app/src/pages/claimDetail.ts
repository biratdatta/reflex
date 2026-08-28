import { clickHandlers, submitHandlers } from '../actions.js';
import {
  DISTRICTS,
  DOCUMENT_TYPES,
  REVIEW_REASONS,
  claimTypeName,
  districtName,
  documentTypeName,
  findClaim,
  money,
  statusName,
  store,
  type Claim,
} from '../data.js';
import { escapeHtml } from '../dom.js';
import { rerender } from '../main.js';
import { view } from '../state.js';

const currentClaim = (): Claim | undefined => {
  const match = window.location.pathname.match(/^\/claims\/([^/]+)$/);
  return match ? findClaim(decodeURIComponent(match[1])) : undefined;
};

const options = (items: Array<{ id: string; name: string }>, placeholder: string): string =>
  [`<option value="">${placeholder}</option>`, ...items.map((item) => `<option value="${item.id}">${item.name}</option>`)].join('');

const documentRows = (claim: Claim): string => {
  const filter = view.documentFilter;
  const rows = claim.documents.filter((document) => {
    if (filter === 'verified') return document.verified;
    if (filter === 'pending') return !document.verified;
    return true;
  });
  if (!rows.length) {
    return `<tr><td colspan="4">No documents recorded for this filter.</td></tr>`;
  }
  return rows
    .map(
      (document) => `
        <tr>
          <td>${escapeHtml(documentTypeName(document.type))}</td>
          <td class="ref">${escapeHtml(document.reference)}</td>
          <td>${escapeHtml(document.issuedDate)}</td>
          <td>
            <span class="tag ${document.verified ? 'approved' : 'under-review'}">
              ${document.verified ? 'Verified' : 'Pending check'}
            </span>
          </td>
        </tr>`,
    )
    .join('');
};

export const renderClaimDetail = (reference: string): string => {
  const claim = findClaim(reference);
  if (!claim) {
    return `
      <h1>Claim not found</h1>
      <p class="lede">No claim on this desk has the reference “${escapeHtml(reference)}”.</p>
      <p><a href="/claims">Back to the claims register</a></p>
    `;
  }

  return `
    <h1 class="ref">${escapeHtml(claim.reference)}</h1>
    <p class="lede">
      ${escapeHtml(claim.claimant)} · ${escapeHtml(claimTypeName(claim.type))} ·
      <span class="tag ${claim.status}">${statusName(claim.status)}</span>
    </p>

    <div class="grid">
      <section class="card plain" aria-labelledby="record-heading">
        <h3 id="record-heading">Claim record</h3>
        <div id="claim-record" aria-live="polite" data-reflex-result>
          <dl class="record">
            <div><dt>Claimant</dt><dd>${escapeHtml(claim.claimant)}</dd></div>
            <div><dt>Policy number</dt><dd class="ref">${escapeHtml(claim.policyNumber)}</dd></div>
            <div><dt>Claim type</dt><dd>${escapeHtml(claimTypeName(claim.type))}</dd></div>
            <div><dt>Date of incident</dt><dd>${escapeHtml(claim.incidentDate)}</dd></div>
            <div><dt>Date received</dt><dd>${escapeHtml(claim.submittedDate)}</dd></div>
            <div><dt>Amount claimed</dt><dd>${money(claim.amountClaimed)}</dd></div>
            <div><dt>Amount approved</dt><dd>${claim.amountApproved ? money(claim.amountApproved) : 'Not yet determined'}</dd></div>
            <div><dt>Assessor</dt><dd>${escapeHtml(claim.assessor)}</dd></div>
            <div><dt>Handling office</dt><dd>${escapeHtml(districtName(claim.district))}</dd></div>
            <div><dt>Correspondence</dt><dd>${escapeHtml(claim.correspondenceAddress)}</dd></div>
            <div><dt>Stage</dt><dd><span class="tag ${claim.status}">${statusName(claim.status)}</span></dd></div>
          </dl>
        </div>
      </section>

      <section class="card plain" aria-labelledby="progress-heading">
        <div class="actions" style="justify-content:space-between">
          <h3 id="progress-heading" style="margin:0">Case history</h3>
          <button type="button" class="secondary small" aria-label="Collapse this section" data-action="noop">Collapse</button>
        </div>
        <ol class="timeline" style="margin-top:14px">
          ${claim.timeline
            .map(
              (entry) =>
                `<li><span class="when">${escapeHtml(entry.date)}</span>${escapeHtml(entry.event)}</li>`,
            )
            .join('')}
        </ol>
      </section>
    </div>

    <section class="card" aria-labelledby="progress-actions-heading">
      <h3 id="progress-actions-heading">Progress this claim</h3>
      <div class="grid">
        <form
          id="request-review"
          aria-label="Request claim review"
          aria-description="Ask an assessor to re-examine this claim"
          aria-controls="claim-record"
        >
          <div class="field">
            <label for="review-reason">Why should this claim be reviewed?</label>
            <select id="review-reason" name="reason" required>${options(REVIEW_REASONS, 'Choose a reason')}</select>
          </div>
          <div class="field">
            <label for="review-notes">Notes for the assessor</label>
            <textarea id="review-notes" name="notes" maxlength="400" rows="2"></textarea>
          </div>
          <button type="submit">Request review</button>
        </form>

        <form
          id="update-correspondence"
          aria-label="Update correspondence address"
          aria-description="Change where letters about this claim are sent"
          aria-controls="claim-record"
        >
          <div class="field">
            <label for="address-line">Address</label>
            <input id="address-line" name="addressLine" type="text" required maxlength="120" />
          </div>
          <div class="field">
            <label for="address-postcode">Postcode</label>
            <span class="hint" id="postcode-hint">For example PM4 2QT.</span>
            <input
              id="address-postcode"
              name="postcode"
              type="text"
              required
              pattern="[A-Za-z]{2}[0-9] ?[0-9][A-Za-z]{2}"
              aria-describedby="postcode-hint"
            />
          </div>
          <div class="field">
            <label for="address-office">Handling office</label>
            <select id="address-office" name="district">${options(DISTRICTS, 'Leave unchanged')}</select>
          </div>
          <button type="submit">Update address</button>
        </form>
      </div>
    </section>

    <section class="card plain" aria-labelledby="documents-heading">
      <h3 id="documents-heading">Supporting documents</h3>
      <div class="row">
        <form
          id="list-documents"
          aria-label="List claim documents"
          aria-description="Show the documents recorded against this claim"
          aria-controls="documents-table"
        >
          <div class="field">
            <label for="document-filter">Show</label>
            <select id="document-filter" name="verification">
              <option value="">All documents</option>
              <option value="verified"${view.documentFilter === 'verified' ? ' selected' : ''}>Verified only</option>
              <option value="pending"${view.documentFilter === 'pending' ? ' selected' : ''}>Pending check</option>
            </select>
          </div>
          <button type="submit" class="secondary">List documents</button>
        </form>

        <form
          id="add-document"
          aria-label="Add supporting document"
          aria-description="Record a document supplied in support of this claim"
          aria-controls="documents-table"
        >
          <div class="field">
            <label for="document-type">Document type</label>
            <select id="document-type" name="documentType" required>${options(DOCUMENT_TYPES, 'Choose a type')}</select>
          </div>
          <div class="field">
            <label for="document-reference">Document reference</label>
            <input id="document-reference" name="documentReference" type="text" required maxlength="30" />
          </div>
          <div class="field">
            <label for="document-issued">Date issued</label>
            <input id="document-issued" name="issuedDate" type="date" />
          </div>
          <div class="field">
            <label for="document-file">Attach a scan (optional)</label>
            <input id="document-file" name="scan" type="file" accept="image/*,.pdf" />
          </div>
          <button type="submit">Add document</button>
        </form>

        <form
          id="delete-document"
          aria-label="Delete supporting document"
          aria-description="Permanently remove a document from this claim file"
          aria-controls="documents-table"
        >
          <div class="field">
            <label for="delete-document-id">Document</label>
            <select id="delete-document-id" name="documentId" required>
              <option value="">Choose a document</option>
              ${claim.documents
                .map(
                  (document) =>
                    `<option value="${document.id}">${escapeHtml(documentTypeName(document.type))} · ${escapeHtml(document.reference)}</option>`,
                )
                .join('')}
            </select>
          </div>
          <button type="submit" class="danger">Delete document</button>
        </form>
      </div>

      <table id="documents-table" aria-live="polite" aria-label="Documents recorded against this claim" style="margin-top:18px">
        <thead><tr><th>Type</th><th>Reference</th><th>Issued</th><th>Verification</th></tr></thead>
        <tbody>${documentRows(claim)}</tbody>
      </table>
    </section>

    <section class="card danger" aria-labelledby="settlement-heading">
      <h3 id="settlement-heading">Settlement and closure</h3>
      <div class="grid">
        <form
          id="authorise-payment"
          aria-label="Authorise payment"
          aria-description="Release the approved amount to the claimant's registered bank account"
          aria-controls="claim-record"
        >
          <div class="field">
            <label for="payment-amount">Amount to release</label>
            <input
              id="payment-amount"
              name="amount"
              type="number"
              required
              min="0"
              max="500000"
              value="${claim.amountApproved ?? ''}"
            />
          </div>
          <div class="field">
            <label for="payment-method">Payment method</label>
            <select id="payment-method" name="method" required>
              <option value="">Choose a method</option>
              <option value="bacs">Bank transfer</option>
              <option value="cheque">Cheque by post</option>
              <option value="card-refund">Refund to card</option>
            </select>
          </div>
          <button type="submit">Authorise payment</button>
        </form>

        <form
          id="set-claim-pin"
          aria-label="Set claim access PIN"
          aria-description="Set the PIN the claimant uses to check this claim by telephone"
        >
          <div class="field">
            <label for="claim-pin">New telephone PIN</label>
            <span class="hint" id="pin-hint">Six digits. Never read an existing PIN back to a caller.</span>
            <input id="claim-pin" name="accessPin" type="password" minlength="6" maxlength="6" required aria-describedby="pin-hint" />
          </div>
          <button type="submit" class="secondary">Set PIN</button>
        </form>

        <div>
          <p class="inset" id="withdraw-help">
            Withdrawing a claim closes it permanently and cancels any scheduled payment. The claimant
            must file again from the beginning.
          </p>
          <button
            type="button"
            class="danger"
            aria-label="Withdraw claim"
            aria-describedby="withdraw-help"
            aria-controls="claim-record"
            data-action="withdraw"
            ${claim.status === 'withdrawn' ? 'disabled' : ''}
          >
            Withdraw this claim
          </button>
        </div>
      </div>
    </section>

    <p><a href="/claims">Back to the claims register</a></p>
  `;
};

submitHandlers.set('request-review', (values) => {
  const claim = currentClaim();
  if (!claim) return;
  claim.status = 'under-review';
  claim.timeline.push({
    date: new Date().toISOString().slice(0, 10),
    event: `Review requested — ${REVIEW_REASONS.find((reason) => reason.id === values.reason)?.name ?? 'reason not given'}`,
  });
  rerender(`Review requested on ${claim.reference}. The claim is now under review.`);
});

submitHandlers.set('update-correspondence', (values) => {
  const claim = currentClaim();
  if (!claim) return;
  claim.correspondenceAddress = `${values.addressLine ?? ''}, ${(values.postcode ?? '').toUpperCase()}`.trim();
  if (values.district) claim.district = values.district as Claim['district'];
  rerender(`Correspondence address updated to ${claim.correspondenceAddress}.`);
});

submitHandlers.set('list-documents', (values) => {
  const claim = currentClaim();
  if (!claim) return;
  view.documentFilter = values.verification ?? '';
  const verified = claim.documents.filter((document) => document.verified).length;
  rerender(
    `${claim.reference} has ${claim.documents.length} document${claim.documents.length === 1 ? '' : 's'} on file, ` +
      `${verified} verified: ${claim.documents.map((document) => documentTypeName(document.type)).join(', ') || 'none'}.`,
  );
});

submitHandlers.set('add-document', (values) => {
  const claim = currentClaim();
  if (!claim || !values.documentType) return;
  store.nextDocument += 1;
  claim.documents.push({
    id: `DOC-${store.nextDocument}`,
    type: values.documentType,
    reference: values.documentReference || 'not supplied',
    issuedDate: values.issuedDate || new Date().toISOString().slice(0, 10),
    verified: false,
  });
  rerender(`Recorded ${documentTypeName(values.documentType)} against ${claim.reference}, pending verification.`);
});

submitHandlers.set('delete-document', (values) => {
  const claim = currentClaim();
  if (!claim || !values.documentId) return;
  const removed = claim.documents.find((document) => document.id === values.documentId);
  claim.documents = claim.documents.filter((document) => document.id !== values.documentId);
  rerender(
    removed
      ? `Deleted ${documentTypeName(removed.type)} (${removed.reference}) from ${claim.reference}.`
      : 'No such document on this claim.',
  );
});

submitHandlers.set('authorise-payment', (values) => {
  const claim = currentClaim();
  if (!claim) return;
  const amount = Number(values.amount) || 0;
  claim.status = 'paid';
  claim.amountApproved = amount;
  claim.timeline.push({
    date: new Date().toISOString().slice(0, 10),
    event: `Payment of ${money(amount)} authorised by ${values.method === 'cheque' ? 'cheque' : 'bank transfer'}`,
  });
  store.payments.unshift({
    id: `PAY-${77000 + store.payments.length + 1}`,
    claimReference: claim.reference,
    amount,
    method: (values.method || 'bacs') as 'bacs' | 'cheque' | 'card-refund',
    status: 'scheduled',
    date: new Date().toISOString().slice(0, 10),
  });
  rerender(`Authorised ${money(amount)} on ${claim.reference}. Payment is scheduled.`);
});

submitHandlers.set('set-claim-pin', () => {
  const claim = currentClaim();
  if (!claim) return;
  rerender(`Telephone PIN set for ${claim.reference}. The claimant must be told it in person.`);
});

clickHandlers.set('withdraw', () => {
  const claim = currentClaim();
  if (!claim) return;
  claim.status = 'withdrawn';
  claim.timeline.push({ date: new Date().toISOString().slice(0, 10), event: 'Claim withdrawn by claimant' });
  rerender(`Withdrew ${claim.reference}. The case is closed and any scheduled payment is cancelled.`);
});
