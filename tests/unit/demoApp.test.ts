import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { discoverCapabilities } from '@reflex/discovery-engine';
import { executeCandidate } from '@reflex/webmcp-adapter';
import type { CapabilityCandidate } from '@reflex/capability-model';

/**
 * End-to-end discovery against the real National Claims Portal markup, rendered
 * by the demo service itself. If its accessibility metadata regresses, these
 * fail — which is the point: the markup is the contract Reflex reads.
 */
let render: () => void;
let navigate: (path: string) => void;

beforeAll(async () => {
  document.body.innerHTML = '<div id="app"></div>';
  window.history.pushState({}, '', '/claims');
  const app = await import('../../apps/demo-legacy-app/src/main.js');
  render = app.render;
  navigate = app.navigate;
});

beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>';
  render();
});

const scan = (path: string) => {
  navigate(path);
  return discoverCapabilities(document);
};

const namesOn = (path: string): string[] => scan(path).candidates.map((candidate) => candidate.name).sort();

const byName = (path: string): Map<string, CapabilityCandidate> =>
  new Map(scan(path).candidates.map((candidate) => [candidate.name, candidate]));

describe('/claims — the claims register', () => {
  it('discovers the register capabilities and nothing else', () => {
    expect(namesOn('/claims')).toEqual([
      'file_new_claim',
      'filter_claims_by_status',
      'import_claims_from_csv',
      'search_claims',
      'view_claim_record',
    ]);
  });

  it('leaves the interface mechanics alone', () => {
    const names = namesOn('/claims');
    for (const decoy of [
      'toggle_navigation_menu',
      'dismiss_this_notice',
      'expand_all_rows',
      'print_this_page',
      'next_page',
      'previous_page',
      'back_to_top',
    ]) {
      expect(names).not.toContain(decoy);
    }
  });

  it('classifies the register correctly', () => {
    const claims = byName('/claims');
    expect(claims.get('search_claims')!.risk).toBe('read');
    expect(claims.get('filter_claims_by_status')!.risk).toBe('read');
    // "View claim record" is a read, even though "record" is also a write verb.
    expect(claims.get('view_claim_record')!.risk).toBe('read');
    expect(claims.get('file_new_claim')!.risk).toBe('write');
    expect(claims.get('import_claims_from_csv')!.risk).toBe('write');
  });

  it('builds a rich schema for the claim-filing form', () => {
    const claim = byName('/claims').get('file_new_claim')!;
    const properties = claim.inputSchema.properties;

    expect(claim.inputSchema.required).toEqual([
      'policyNumber',
      'claimType',
      'incidentDate',
      'amountClaimed',
      'district',
      'contactEmail',
    ]);
    expect(properties.policyNumber).toMatchObject({ type: 'string', pattern: '[Pp][Oo][Ll]-[0-9]{4}-[0-9]{3}' });
    expect(properties.claimType).toMatchObject({
      type: 'string',
      enum: ['flood', 'motor', 'property', 'travel', 'liability'],
    });
    expect(properties.incidentDate).toMatchObject({ type: 'string', format: 'date' });
    expect(properties.amountClaimed).toMatchObject({ type: 'number', minimum: 100, maximum: 500000 });
    expect(properties.contactEmail).toMatchObject({ type: 'string', format: 'email' });
    expect(properties.preferredContact).toMatchObject({ type: 'string', enum: ['email', 'phone', 'post'] });
    expect(properties.urgentReview).toMatchObject({ type: 'boolean' });
    expect(properties.description).toMatchObject({ type: 'string', maxLength: 500 });
  });

  it('carries the field hints through as parameter descriptions', () => {
    const claim = byName('/claims').get('file_new_claim')!;
    expect(claim.inputSchema.properties.amountClaimed.description).toContain('between 100 and 500,000');
    expect(claim.inputSchema.properties.incidentDate.description).toContain('within 90 days');
  });

  it('records the evidence behind a generated tool', () => {
    const search = byName('/claims').get('search_claims')!;
    expect(search.evidence).toEqual(
      expect.arrayContaining([
        { type: 'aria-label', value: 'Search claims' },
        { type: 'aria-description', value: 'Find a claim by reference number, claimant name or policy number' },
        expect.objectContaining({ type: 'form', origin: '#claim-search' }),
      ]),
    );
    expect(search.resultSelector).toBe('#claims-results');
  });

  it('scores the service as highly agent-ready', () => {
    const { readiness } = scan('/claims');
    expect(readiness.score).toBeGreaterThanOrEqual(95);
    expect(readiness.breakdown.formQuality).toBe(1);
    expect(readiness.breakdown.ariaCoverage).toBe(1);
  });
});

describe('/claims/:reference — a single claim', () => {
  const CLAIM = '/claims/CLM-2026-0481';

  it('discovers the case-handling capabilities', () => {
    expect(namesOn(CLAIM)).toEqual([
      'add_supporting_document',
      'authorise_payment',
      'delete_supporting_document',
      'list_claim_documents',
      'request_claim_review',
      'set_claim_access_pin',
      'update_correspondence_address',
      'withdraw_claim',
    ]);
  });

  it('separates money-moving actions from merely reading about money', () => {
    const claim = byName(CLAIM);
    // The act releases funds.
    expect(claim.get('authorise_payment')!.risk).toBe('sensitive');
    // These only look, or touch no sensitive subject.
    expect(claim.get('list_claim_documents')!.risk).toBe('read');
    expect(claim.get('request_claim_review')!.risk).toBe('write');
    expect(claim.get('update_correspondence_address')!.risk).toBe('write');
  });

  it('marks destruction as destructive', () => {
    const claim = byName(CLAIM);
    expect(claim.get('withdraw_claim')!.risk).toBe('destructive');
    expect(claim.get('delete_supporting_document')!.risk).toBe('destructive');
  });

  it('never exposes the telephone PIN field, and escalates the tool that sets it', () => {
    const pin = byName(CLAIM).get('set_claim_access_pin')!;
    expect(pin.inputSchema.properties).toEqual({});
    expect(pin.risk).toBe('sensitive');
    expect(pin.evidence.map((item) => item.value)).toContain(
      'Password field present — excluded from schema, risk escalated to sensitive',
    );
  });

  it('skips the optional file upload, which an agent cannot supply', () => {
    const add = byName(CLAIM).get('add_supporting_document')!;
    expect(Object.keys(add.inputSchema.properties)).toEqual([
      'documentType',
      'documentReference',
      'issuedDate',
    ]);
  });

  it('takes the description for a button from aria-describedby', () => {
    const withdraw = byName(CLAIM).get('withdraw_claim')!;
    expect(withdraw.source).toBe('button');
    expect(withdraw.description).toContain('closes it permanently');
  });
});

describe('/policies and /payments', () => {
  it('discovers cover administration', () => {
    expect(namesOn('/policies')).toEqual([
      'cancel_policy',
      'check_policy_status',
      'filter_policies_by_status',
      'renew_policy',
    ]);
  });

  it('treats checking cover as a read and ending it as destructive', () => {
    const policies = byName('/policies');
    expect(policies.get('check_policy_status')!.risk).toBe('read');
    expect(policies.get('renew_policy')!.risk).toBe('write');
    expect(policies.get('cancel_policy')!.risk).toBe('destructive');
  });

  it('discovers the payment capabilities, and does not over-warn about searching them', () => {
    expect(namesOn('/payments')).toEqual(['search_payments', 'send_payment_statement']);
    const payments = byName('/payments');
    // Reading payment records changes nothing.
    expect(payments.get('search_payments')!.risk).toBe('read');
    // Emailing a statement out of the service does.
    expect(payments.get('send_payment_statement')!.risk).toBe('sensitive');
  });
});

describe('executing discovered tools against the service', () => {
  it('searches claims and reads the result out of the page', async () => {
    const search = byName('/claims').get('search_claims')!;
    const result = await executeCandidate(document, search, { query: 'Okonkwo' }, { settleMs: 0 });

    expect(result.success).toBe(true);
    expect(String(result.observed?.region)).toContain('CLM-2026-0481');
    expect(String(result.observed?.region)).toContain('Amara Okonkwo');
    expect(String(result.observed?.region)).not.toContain('Rohan Mehta');
  });

  it('files a new claim, and the register visibly gains it', async () => {
    const file = byName('/claims').get('file_new_claim')!;
    const result = await executeCandidate(
      document,
      file,
      {
        policyNumber: 'POL-2210-114',
        claimType: 'motor',
        incidentDate: '2026-08-25',
        amountClaimed: 2400,
        district: 'northgate',
        contactEmail: 'rohan.mehta@example.test',
        description: 'Hail damage to bonnet and roof.',
        urgentReview: true,
      },
      { settleMs: 0 },
    );

    expect(result.success).toBe(true);
    expect(document.getElementById('service-status')!.textContent).toContain('Filed claim CLM-2026-0');
    expect(document.getElementById('service-status')!.textContent).toContain('flagged for urgent review');
  });

  it('refuses a claim type that is not on the menu', async () => {
    const file = byName('/claims').get('file_new_claim')!;
    const result = await executeCandidate(document, file, { claimType: 'spacecraft' }, { settleMs: 0 });
    expect(result.success).toBe(false);
    expect(result.error).toContain('not an option: spacecraft');
  });

  it('requires the arguments the form requires', async () => {
    const file = byName('/claims').get('file_new_claim')!;
    const result = await executeCandidate(document, file, { claimType: 'motor' }, { settleMs: 0 });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Missing required argument(s)');
    expect(result.error).toContain('policyNumber');
  });

  it('authorises a payment, and the claim record updates', async () => {
    const authorise = byName('/claims/CLM-2026-0333').get('authorise_payment')!;
    const result = await executeCandidate(document, authorise, { amount: 6950, method: 'bacs' }, { settleMs: 0 });

    expect(result.success).toBe(true);
    expect(document.getElementById('claim-record')!.textContent).toContain('Paid');
    expect(document.getElementById('service-status')!.textContent).toContain('Authorised 6,950.00');
  });

  it('withdraws a claim only after human approval', async () => {
    const withdraw = byName('/claims/CLM-2026-0512').get('withdraw_claim')!;

    const declined = await executeCandidate(document, withdraw, {}, { settleMs: 0, confirm: () => false });
    expect(declined).toMatchObject({ success: false, error: 'Human approval declined' });
    expect(document.getElementById('claim-record')!.textContent).toContain('Under review');

    const approved = await executeCandidate(document, withdraw, {}, { settleMs: 0, confirm: () => true });
    expect(approved.success).toBe(true);
    expect(document.getElementById('service-status')!.textContent).toContain('Withdrew CLM-2026-0512');
  });

  it('checks cover and returns the answer the caseworker would read', async () => {
    const check = byName('/policies').get('check_policy_status')!;
    const result = await executeCandidate(
      document,
      check,
      { policyNumber: 'POL-3312-905', onDate: '2026-08-01' },
      { settleMs: 0 },
    );

    expect(result.success).toBe(true);
    expect(document.getElementById('service-status')!.textContent).toContain('is lapsed');
    expect(document.getElementById('service-status')!.textContent).toContain('Cover was NOT in force');
  });
});
