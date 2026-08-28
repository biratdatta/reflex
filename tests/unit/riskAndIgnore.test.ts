import { describe, expect, it } from 'vitest';
import { classifyRisk, escalateRisk, requiresHumanApproval, shouldIgnoreLabel } from '@reflex/discovery-engine';

describe('classifyRisk', () => {
  it('classifies read verbs', () => {
    for (const label of ['Search employees', 'View employee', 'List applications', 'Filter by department']) {
      expect(classifyRisk(label).risk).toBe('read');
    }
  });

  it('classifies write verbs', () => {
    for (const label of ['Create employee', 'Change department', 'Assign application', 'Import employees']) {
      expect(classifyRisk(label).risk).toBe('write');
    }
  });

  it('classifies sensitive words', () => {
    expect(classifyRisk('Reset password').risk).toBe('sensitive');
    expect(classifyRisk('Assign role').risk).toBe('sensitive');
    expect(classifyRisk('Approve request').risk).toBe('sensitive');
  });

  it('classifies destructive words', () => {
    for (const label of ['Delete employee', 'Deactivate employee', 'Revoke application access', 'Terminate contract']) {
      expect(classifyRisk(label).risk).toBe('destructive');
    }
  });

  it('takes the most dangerous match when words conflict', () => {
    expect(classifyRisk('Search and revoke access').risk).toBe('destructive');
    expect(classifyRisk('Update role permissions').risk).toBe('sensitive');
  });

  it('reads the description too', () => {
    expect(classifyRisk('Offboard', 'Removes the employee from all systems').risk).toBe('destructive');
  });

  it('defaults unknown labels to write, flagged as unclassified', () => {
    expect(classifyRisk('Frobnicate widget')).toMatchObject({ risk: 'write', classified: false });
  });

  it('separates a sensitive action from a sensitive subject', () => {
    // The act moves money.
    expect(classifyRisk('Authorise payment').risk).toBe('sensitive');
    expect(classifyRisk('Send the offer letter').risk).toBe('sensitive');
    expect(classifyRisk('Grant access to an application').risk).toBe('sensitive');

    // A write against a sensitive subject.
    expect(classifyRisk('Update bank details').risk).toBe('sensitive');
    expect(classifyRisk('Set claim access PIN').risk).toBe('sensitive');

    // Only reading one. Nothing changes, so nothing to warn about.
    expect(classifyRisk('Search payments').risk).toBe('read');
    expect(classifyRisk('View payment history').risk).toBe('read');
    expect(classifyRisk('Show employee access').risk).toBe('read');
    expect(classifyRisk('List billing invoices').risk).toBe('read');
  });

  it('explains how it decided', () => {
    expect(classifyRisk('Authorise payment').reason).toBe('consequential action');
    expect(classifyRisk('Update bank details').reason).toContain('writes to');
    expect(classifyRisk('Withdraw claim')).toMatchObject({ reason: 'destructive verb', matched: 'withdraw' });
  });

  it('classifies the claims-portal vocabulary', () => {
    expect(classifyRisk('Withdraw claim').risk).toBe('destructive');
    expect(classifyRisk('Cancel policy').risk).toBe('destructive');
    expect(classifyRisk('Delete supporting document').risk).toBe('destructive');
    expect(classifyRisk('File new claim').risk).toBe('write');
    expect(classifyRisk('Request claim review').risk).toBe('write');
    expect(classifyRisk('Renew policy').risk).toBe('write');
    expect(classifyRisk('Check policy status').risk).toBe('read');
    expect(classifyRisk('Track a claim').risk).toBe('read');
  });

  it('reports which keyword decided the classification', () => {
    expect(classifyRisk('Deactivate employee').matched).toBe('deactivate');
  });
});

describe('escalateRisk', () => {
  it('escalates to sensitive when a password field is present', () => {
    expect(escalateRisk('write', true)).toBe('sensitive');
    expect(escalateRisk('read', true)).toBe('sensitive');
  });

  it('never de-escalates a destructive tool', () => {
    expect(escalateRisk('destructive', true)).toBe('destructive');
  });

  it('leaves risk alone without a password field', () => {
    expect(escalateRisk('read', false)).toBe('read');
  });
});

describe('requiresHumanApproval', () => {
  it('covers sensitive and destructive only', () => {
    expect(requiresHumanApproval('destructive')).toBe(true);
    expect(requiresHumanApproval('sensitive')).toBe(true);
    expect(requiresHumanApproval('write')).toBe(false);
    expect(requiresHumanApproval('read')).toBe(false);
  });
});

describe('shouldIgnoreLabel', () => {
  it('ignores generic UI actions', () => {
    for (const label of ['Close', 'Dismiss', 'Next', 'Expand all', 'Show more', 'Back to top', 'Toggle menu']) {
      expect(shouldIgnoreLabel(label).ignored, label).toBe(true);
    }
  });

  it('ignores a UI verb paired with a UI noun', () => {
    for (const label of ['Close modal', 'Toggle sidebar', 'Expand row details', 'Dismiss notification', 'Open dropdown']) {
      expect(shouldIgnoreLabel(label).ignored, label).toBe(true);
    }
  });

  it('ignores chrome found on real pages', () => {
    // Observed on Wikipedia while scanning live sites.
    for (const label of [
      'Move tools to sidebar',
      'Move appearance to sidebar',
      'Hide appearance',
      'Toggle the table of contents',
      'Switch to dark mode',
      'Pin the toolbar',
    ]) {
      expect(shouldIgnoreLabel(label).ignored, label).toBe(true);
    }
  });

  it('keeps business capabilities that share a verb with UI mechanics', () => {
    for (const label of ['Open employee record', 'Close pay period', 'Show employee access', 'Expand headcount plan']) {
      expect(shouldIgnoreLabel(label).ignored, label).toBe(false);
    }
  });

  it('keeps a domain action whose verb also appears in interface mechanics', () => {
    for (const label of ['Move employee to another department', 'Show employee access', 'Hide salary from directory']) {
      expect(shouldIgnoreLabel(label).ignored, label).toBe(false);
    }
  });

  it('ignores an empty name', () => {
    expect(shouldIgnoreLabel('   ').ignored).toBe(true);
  });

  it('explains why it ignored something', () => {
    expect(shouldIgnoreLabel('Close modal').reason).toContain('Interface mechanic');
  });
});
