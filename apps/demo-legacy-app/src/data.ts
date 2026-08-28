/**
 * ══════════════════════════════════════════════════════════════════════════
 *  NATIONAL CLAIMS PORTAL — a FICTIONAL government service
 *
 *  There is no State of Marisol and no Department of Insurance Services. This
 *  application exists only to give Reflex a realistic, well-marked-up legacy
 *  service to read: the sort of form-heavy public-sector portal that already
 *  has excellent accessibility metadata because it was required to.
 * ══════════════════════════════════════════════════════════════════════════
 */

export type ClaimStatus =
  | 'submitted'
  | 'under-review'
  | 'awaiting-documents'
  | 'approved'
  | 'rejected'
  | 'paid'
  | 'withdrawn';

export type ClaimType = 'flood' | 'motor' | 'property' | 'travel' | 'liability';

export interface TimelineEntry {
  date: string;
  event: string;
}

export interface ClaimDocument {
  id: string;
  type: string;
  reference: string;
  issuedDate: string;
  verified: boolean;
}

export interface Claim {
  reference: string;
  claimant: string;
  policyNumber: string;
  type: ClaimType;
  status: ClaimStatus;
  incidentDate: string;
  submittedDate: string;
  amountClaimed: number;
  amountApproved?: number;
  assessor: string;
  district: string;
  correspondenceAddress: string;
  documents: ClaimDocument[];
  timeline: TimelineEntry[];
}

export interface Policy {
  number: string;
  holder: string;
  product: string;
  status: 'active' | 'lapsed' | 'cancelled';
  premium: number;
  renewalDate: string;
  excess: number;
}

export interface Payment {
  id: string;
  claimReference: string;
  amount: number;
  method: 'bacs' | 'cheque' | 'card-refund';
  status: 'scheduled' | 'sent' | 'cleared' | 'returned';
  date: string;
}

export const CLAIM_TYPES: Array<{ id: ClaimType; name: string }> = [
  { id: 'flood', name: 'Flood damage' },
  { id: 'motor', name: 'Motor vehicle' },
  { id: 'property', name: 'Property damage' },
  { id: 'travel', name: 'Travel disruption' },
  { id: 'liability', name: 'Public liability' },
];

export const CLAIM_STATUSES: Array<{ id: ClaimStatus; name: string }> = [
  { id: 'submitted', name: 'Submitted' },
  { id: 'under-review', name: 'Under review' },
  { id: 'awaiting-documents', name: 'Awaiting documents' },
  { id: 'approved', name: 'Approved' },
  { id: 'rejected', name: 'Rejected' },
  { id: 'paid', name: 'Paid' },
  { id: 'withdrawn', name: 'Withdrawn' },
];

export const DOCUMENT_TYPES = [
  { id: 'photograph', name: 'Photograph of damage' },
  { id: 'invoice', name: 'Repair invoice' },
  { id: 'estimate', name: 'Repair estimate' },
  { id: 'police-report', name: 'Police report' },
  { id: 'medical-report', name: 'Medical report' },
  { id: 'proof-of-ownership', name: 'Proof of ownership' },
];

export const REVIEW_REASONS = [
  { id: 'new-evidence', name: 'New evidence available' },
  { id: 'valuation-dispute', name: 'Disagree with the valuation' },
  { id: 'processing-delay', name: 'Excessive processing delay' },
  { id: 'other', name: 'Another reason' },
];

export const DISTRICTS = [
  { id: 'northgate', name: 'Northgate' },
  { id: 'eastvale', name: 'Eastvale' },
  { id: 'port-marisol', name: 'Port Marisol' },
  { id: 'westhaven', name: 'Westhaven' },
];

const seedClaims: Claim[] = [
  {
    reference: 'CLM-2026-0481',
    claimant: 'Amara Okonkwo',
    policyNumber: 'POL-4471-882',
    type: 'flood',
    status: 'awaiting-documents',
    incidentDate: '2026-07-14',
    submittedDate: '2026-07-19',
    amountClaimed: 12400,
    assessor: 'D. Halloran',
    district: 'port-marisol',
    correspondenceAddress: '14 Harbour Row, Port Marisol, PM4 2QT',
    documents: [
      { id: 'DOC-1', type: 'photograph', reference: 'IMG-0031', issuedDate: '2026-07-15', verified: true },
      { id: 'DOC-2', type: 'estimate', reference: 'EST-7741', issuedDate: '2026-07-18', verified: false },
    ],
    timeline: [
      { date: '2026-07-19', event: 'Claim submitted online' },
      { date: '2026-07-21', event: 'Assigned to assessor D. Halloran' },
      { date: '2026-07-28', event: 'Additional documents requested' },
    ],
  },
  {
    reference: 'CLM-2026-0512',
    claimant: 'Rohan Mehta',
    policyNumber: 'POL-2210-114',
    type: 'motor',
    status: 'under-review',
    incidentDate: '2026-08-02',
    submittedDate: '2026-08-03',
    amountClaimed: 3850,
    assessor: 'K. Iversen',
    district: 'northgate',
    correspondenceAddress: '8 Kestrel Way, Northgate, NG1 7HP',
    documents: [
      { id: 'DOC-3', type: 'police-report', reference: 'PR-99120', issuedDate: '2026-08-02', verified: true },
    ],
    timeline: [
      { date: '2026-08-03', event: 'Claim submitted online' },
      { date: '2026-08-06', event: 'Assigned to assessor K. Iversen' },
    ],
  },
  {
    reference: 'CLM-2026-0333',
    claimant: 'Ingrid Solberg',
    policyNumber: 'POL-8890-471',
    type: 'property',
    status: 'approved',
    incidentDate: '2026-05-30',
    submittedDate: '2026-06-01',
    amountClaimed: 7600,
    amountApproved: 6950,
    assessor: 'D. Halloran',
    district: 'eastvale',
    correspondenceAddress: '2 Cathedral Close, Eastvale, EV9 3BB',
    documents: [
      { id: 'DOC-4', type: 'invoice', reference: 'INV-2211', issuedDate: '2026-06-12', verified: true },
      { id: 'DOC-5', type: 'proof-of-ownership', reference: 'DEED-771', issuedDate: '2026-06-14', verified: true },
    ],
    timeline: [
      { date: '2026-06-01', event: 'Claim submitted at Eastvale office' },
      { date: '2026-06-15', event: 'Assessment completed' },
      { date: '2026-06-22', event: 'Claim approved for 6,950' },
    ],
  },
  {
    reference: 'CLM-2026-0298',
    claimant: 'Tomás Ferreira',
    policyNumber: 'POL-3312-905',
    type: 'travel',
    status: 'paid',
    incidentDate: '2026-04-11',
    submittedDate: '2026-04-13',
    amountClaimed: 1450,
    amountApproved: 1450,
    assessor: 'M. Achebe',
    district: 'westhaven',
    correspondenceAddress: '51 Lantern Street, Westhaven, WH2 8DL',
    documents: [
      { id: 'DOC-6', type: 'invoice', reference: 'INV-1180', issuedDate: '2026-04-20', verified: true },
    ],
    timeline: [
      { date: '2026-04-13', event: 'Claim submitted online' },
      { date: '2026-04-29', event: 'Claim approved in full' },
      { date: '2026-05-06', event: 'Payment issued by bank transfer' },
    ],
  },
  {
    reference: 'CLM-2026-0577',
    claimant: 'Beatriz Alvarez',
    policyNumber: 'POL-4471-882',
    type: 'liability',
    status: 'submitted',
    incidentDate: '2026-08-20',
    submittedDate: '2026-08-24',
    amountClaimed: 22000,
    assessor: 'Unassigned',
    district: 'port-marisol',
    correspondenceAddress: '14 Harbour Row, Port Marisol, PM4 2QT',
    documents: [],
    timeline: [{ date: '2026-08-24', event: 'Claim submitted online' }],
  },
  {
    reference: 'CLM-2026-0104',
    claimant: 'Jonah Whitmore',
    policyNumber: 'POL-6654-320',
    type: 'motor',
    status: 'rejected',
    incidentDate: '2026-02-08',
    submittedDate: '2026-02-10',
    amountClaimed: 5200,
    assessor: 'K. Iversen',
    district: 'northgate',
    correspondenceAddress: '77 Mill Lane, Northgate, NG4 1AA',
    documents: [
      { id: 'DOC-7', type: 'estimate', reference: 'EST-3300', issuedDate: '2026-02-14', verified: true },
    ],
    timeline: [
      { date: '2026-02-10', event: 'Claim submitted online' },
      { date: '2026-03-04', event: 'Claim rejected — incident outside cover period' },
    ],
  },
];

const seedPolicies: Policy[] = [
  { number: 'POL-4471-882', holder: 'Amara Okonkwo', product: 'Home & Flood Cover', status: 'active', premium: 41.5, renewalDate: '2027-03-01', excess: 250 },
  { number: 'POL-2210-114', holder: 'Rohan Mehta', product: 'Comprehensive Motor', status: 'active', premium: 63.0, renewalDate: '2026-11-14', excess: 400 },
  { number: 'POL-8890-471', holder: 'Ingrid Solberg', product: 'Property Protection', status: 'active', premium: 55.25, renewalDate: '2027-01-09', excess: 300 },
  { number: 'POL-3312-905', holder: 'Tomás Ferreira', product: 'Travel Essentials', status: 'lapsed', premium: 12.0, renewalDate: '2026-06-30', excess: 100 },
  { number: 'POL-6654-320', holder: 'Jonah Whitmore', product: 'Comprehensive Motor', status: 'cancelled', premium: 58.75, renewalDate: '2026-02-28', excess: 400 },
];

const seedPayments: Payment[] = [
  { id: 'PAY-77120', claimReference: 'CLM-2026-0298', amount: 1450, method: 'bacs', status: 'cleared', date: '2026-05-06' },
  { id: 'PAY-77455', claimReference: 'CLM-2026-0333', amount: 6950, method: 'bacs', status: 'scheduled', date: '2026-09-02' },
  { id: 'PAY-76004', claimReference: 'CLM-2026-0104', amount: 0, method: 'cheque', status: 'returned', date: '2026-03-05' },
];

export const store = {
  claims: seedClaims.map((claim) => ({ ...claim })),
  policies: seedPolicies.map((policy) => ({ ...policy })),
  payments: seedPayments.map((payment) => ({ ...payment })),
  nextReference: 600,
  nextDocument: 100,
};

export const claimTypeName = (id: string): string =>
  CLAIM_TYPES.find((type) => type.id === id)?.name ?? id;

export const statusName = (id: string): string =>
  CLAIM_STATUSES.find((status) => status.id === id)?.name ?? id;

export const documentTypeName = (id: string): string =>
  DOCUMENT_TYPES.find((type) => type.id === id)?.name ?? id;

export const districtName = (id: string): string =>
  DISTRICTS.find((district) => district.id === id)?.name ?? id;

export const money = (amount: number): string =>
  `${amount.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const findClaim = (reference: string): Claim | undefined =>
  store.claims.find((claim) => claim.reference.toLowerCase() === reference.trim().toLowerCase());

export const findPolicy = (number: string): Policy | undefined =>
  store.policies.find((policy) => policy.number.toLowerCase() === number.trim().toLowerCase());

export const searchClaims = (query: string, status?: string, type?: string): Claim[] => {
  const needle = query.trim().toLowerCase();
  return store.claims.filter((claim) => {
    const matchesQuery =
      !needle ||
      claim.reference.toLowerCase().includes(needle) ||
      claim.claimant.toLowerCase().includes(needle) ||
      claim.policyNumber.toLowerCase().includes(needle);
    return matchesQuery && (!status || claim.status === status) && (!type || claim.type === type);
  });
};

export const fileClaim = (input: {
  policyNumber: string;
  claimType: string;
  incidentDate: string;
  amountClaimed: string;
  district: string;
  description: string;
  contactEmail: string;
}): Claim => {
  store.nextReference += 1;
  const policy = findPolicy(input.policyNumber);
  const claim: Claim = {
    reference: `CLM-2026-0${store.nextReference}`,
    claimant: policy?.holder ?? 'New claimant',
    policyNumber: input.policyNumber,
    type: (input.claimType || 'property') as ClaimType,
    status: 'submitted',
    incidentDate: input.incidentDate || new Date().toISOString().slice(0, 10),
    submittedDate: new Date().toISOString().slice(0, 10),
    amountClaimed: Number(input.amountClaimed) || 0,
    assessor: 'Unassigned',
    district: input.district || 'northgate',
    correspondenceAddress: 'Address not yet supplied',
    documents: [],
    timeline: [{ date: new Date().toISOString().slice(0, 10), event: 'Claim submitted online' }],
  };
  store.claims.unshift(claim);
  return claim;
};
