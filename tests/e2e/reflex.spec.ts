import { expect, test } from './fixtures.js';
import type { CapabilityCandidate } from '@reflex/capability-model';

const byName = (candidates: CapabilityCandidate[], name: string): CapabilityCandidate => {
  const found = candidates.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`No candidate "${name}". Found: ${candidates.map((c) => c.name).join(', ')}`);
  return found;
};

test.describe('Reflex on the National Claims Portal', () => {
  test('discovers the register capabilities in a real browser', async ({ context, reflex }) => {
    const page = await context.newPage();
    await page.goto('/claims');
    await reflex.attach(page);

    const snapshot = await reflex.snapshot(page);

    expect(snapshot.candidates.map((candidate) => candidate.name).sort()).toEqual([
      'file_new_claim',
      'filter_claims_by_status',
      'import_claims_from_csv',
      'search_claims',
      'view_claim_record',
    ]);
    expect(snapshot.readiness.score).toBeGreaterThanOrEqual(75);
    expect(snapshot.webmcpAvailable).toBe(true);
  });

  test('registers approved tools with a WebMCP host and leaves the rest alone', async ({ context, reflex }) => {
    const page = await context.newPage();
    await page.goto('/claims');
    await reflex.attach(page);

    const before = await reflex.snapshot(page);
    const search = byName(before.candidates, 'search_claims');

    // Nothing is registered until a human approves it.
    expect(before.activeToolIds).toEqual([]);
    expect(await page.evaluate(() => navigator.modelContext?.listTools?.().length ?? 0)).toBe(0);

    const response = await reflex.send(page, { type: 'APPROVE_CANDIDATE', candidateId: search.id });
    expect(response.ok).toBe(true);

    const tools = await page.evaluate(() =>
      (navigator.modelContext?.listTools?.() ?? []).map((tool) => ({
        name: tool.name,
        description: tool.description,
        readOnly: tool.annotations?.readOnlyHint,
        schema: tool.inputSchema,
      })),
    );
    expect(tools).toHaveLength(1);
    expect(tools[0]).toMatchObject({
      name: 'search_claims',
      description: 'Find a claim by reference number, claimant name or policy number.',
      readOnly: true,
    });
    expect(tools[0].schema.properties.query).toMatchObject({ type: 'string', maxLength: 60 });
  });

  test('an agent calling the tool drives the real UI', async ({ context, reflex }) => {
    const page = await context.newPage();
    await page.goto('/claims');
    await reflex.attach(page);

    const snapshot = await reflex.snapshot(page);
    await reflex.send(page, {
      type: 'APPROVE_CANDIDATE',
      candidateId: byName(snapshot.candidates, 'search_claims').id,
    });

    // This is what a WebMCP client does: call the tool by name with JSON arguments.
    const response = await page.evaluate(async () => {
      const result = await navigator.modelContext!.callTool!('search_claims', { query: 'Okonkwo' });
      return { text: result.content[0]?.text, isError: result.isError };
    });

    expect(response.isError).toBeFalsy();
    const result = JSON.parse(response.text!);
    expect(result.success).toBe(true);
    expect(result.observed.region).toContain('CLM-2026-0481');

    // And the page itself visibly reacted.
    await expect(page.locator('#claim-query')).toHaveValue('Okonkwo');
    await expect(page.locator('#service-status')).toContainText('returned 1 claim');
  });

  test('a write tool changes the application state', async ({ context, reflex }) => {
    const page = await context.newPage();
    await page.goto('/claims/CLM-2026-0481');
    await reflex.attach(page);

    const snapshot = await reflex.snapshot(page);
    const review = byName(snapshot.candidates, 'request_claim_review');
    expect(review.risk).toBe('write');
    expect(review.inputSchema.properties.reason.enum).toContain('valuation-dispute');

    await reflex.send(page, { type: 'APPROVE_CANDIDATE', candidateId: review.id });

    const result = await page.evaluate(async () => {
      const response = await navigator.modelContext!.callTool!('request_claim_review', {
        reason: 'valuation-dispute',
        notes: 'Claimant supplied a second estimate.',
      });
      return JSON.parse(response.content[0]!.text) as { success: boolean };
    });

    expect(result.success).toBe(true);
    await expect(page.locator('#claim-record')).toContainText('Under review');
    await expect(page.locator('#service-status')).toContainText('Review requested on CLM-2026-0481');
  });

  test('destructive tools ask a human in the page before actuating', async ({ context, reflex }) => {
    const page = await context.newPage();
    await page.goto('/claims/CLM-2026-0481');
    await reflex.attach(page);

    const snapshot = await reflex.snapshot(page);
    const withdraw = byName(snapshot.candidates, 'withdraw_claim');
    expect(withdraw.risk).toBe('destructive');
    await reflex.send(page, { type: 'APPROVE_CANDIDATE', candidateId: withdraw.id });

    // Refuse the first time.
    page.once('dialog', (dialog) => {
      expect(dialog.message()).toContain('human approval required');
      void dialog.dismiss();
    });
    const declined = await page.evaluate(async () => {
      const response = await navigator.modelContext!.callTool!('withdraw_claim', {});
      return JSON.parse(response.content[0]!.text) as { success: boolean; error?: string };
    });
    expect(declined).toMatchObject({ success: false, error: 'Human approval declined' });
    await expect(page.locator('#claim-record')).toContainText('Awaiting documents');

    // Allow the second time.
    page.once('dialog', (dialog) => void dialog.accept());
    const approved = await page.evaluate(async () => {
      const response = await navigator.modelContext!.callTool!('withdraw_claim', {});
      return JSON.parse(response.content[0]!.text) as { success: boolean };
    });
    expect(approved.success).toBe(true);
    await expect(page.locator('#service-status')).toContainText('Withdrew CLM-2026-0481');
    await expect(page.locator('#claim-record')).toContainText('Withdrawn');
  });

  test('withdrawing tools unregisters them from the host', async ({ context, reflex }) => {
    const page = await context.newPage();
    await page.goto('/claims');
    await reflex.attach(page);

    const snapshot = await reflex.snapshot(page);
    await reflex.send(page, { type: 'APPROVE_SAFE_TOOLS' });

    const registered = await page.evaluate(() => navigator.modelContext!.listTools!().map((tool) => tool.name));
    expect(registered.sort()).toEqual(['filter_claims_by_status', 'search_claims', 'view_claim_record']);
    // Bulk approval covers read-only capabilities only.
    expect(registered).not.toContain('file_new_claim');
    expect(snapshot.candidates.some((candidate) => candidate.name === 'file_new_claim')).toBe(true);

    await reflex.send(page, { type: 'DISABLE_ALL_TOOLS' });
    expect(await page.evaluate(() => navigator.modelContext!.listTools!().length)).toBe(0);
  });

  test('the in-page console lists what is registered', async ({ context, reflex }) => {
    const page = await context.newPage();
    await page.goto('/claims');
    await reflex.attach(page);

    const console_ = page.locator('#reflex-agent-console');
    await expect(console_).toBeAttached();
    await expect(console_.locator('.empty')).toContainText('No tools registered yet');

    const snapshot = await reflex.snapshot(page);
    await reflex.send(page, {
      type: 'APPROVE_CANDIDATE',
      candidateId: byName(snapshot.candidates, 'search_claims').id,
    });

    await expect(console_.locator('.tool')).toHaveCount(1);
    await expect(console_.locator('.tool .name')).toContainText('search_claims');
  });

  test('the console keeps its arguments and result after a call re-renders the page', async ({
    context,
    reflex,
  }) => {
    const page = await context.newPage();
    await page.goto('/claims');
    await reflex.attach(page);

    const snapshot = await reflex.snapshot(page);
    await reflex.send(page, {
      type: 'APPROVE_CANDIDATE',
      candidateId: byName(snapshot.candidates, 'search_claims').id,
    });

    const console_ = page.locator('#reflex-agent-console');
    const tool = console_.locator('.tool').first();
    await tool.locator('button.name').click();
    await tool.locator('textarea').fill('{"query": "Mehta"}');
    await tool.locator('button.run').click();

    // Executing the tool re-renders the application; the panel must survive it.
    await expect(tool.locator('pre.result')).toContainText('"success": true');
    await expect(tool.locator('textarea')).toHaveValue('{"query": "Mehta"}');
    await expect(tool).toHaveClass(/open/);
    await expect(page.locator('#service-status')).toContainText('returned 1 claim');
  });

  test('re-attaching does not create a second runtime', async ({ context, reflex }) => {
    const page = await context.newPage();
    await page.goto('/claims');
    await reflex.attach(page);
    // Opening the popup again re-runs the injection path.
    await reflex.attach(page);
    await reflex.attach(page);

    const snapshot = await reflex.snapshot(page);
    await reflex.send(page, {
      type: 'APPROVE_CANDIDATE',
      candidateId: byName(snapshot.candidates, 'search_claims').id,
    });

    // One console, and one registration of the tool — not three.
    expect(await page.locator('#reflex-agent-console').count()).toBe(1);
    expect(await page.evaluate(() => navigator.modelContext!.listTools!().map((tool) => tool.name))).toEqual([
      'search_claims',
    ]);

    const calls = await page.evaluate(async () => {
      const response = await navigator.modelContext!.callTool!('search_claims', { query: 'Mehta' });
      return JSON.parse(response.content[0]!.text) as { success: boolean };
    });
    expect(calls.success).toBe(true);
    await expect(page.locator('#service-status')).toContainText('returned 1 claim');
  });

  test('approvals are scoped to the origin that granted them', async ({ context, reflex }) => {
    const page = await context.newPage();
    await page.goto('http://localhost:3000/claims');
    await reflex.attach(page);

    const snapshot = await reflex.snapshot(page);
    await reflex.send(page, {
      type: 'APPROVE_CANDIDATE',
      candidateId: byName(snapshot.candidates, 'search_claims').id,
    });

    const stored = await reflex.storedOrigins();
    expect(Object.keys(stored)).toEqual(['http://localhost:3000']);
    expect(stored['http://localhost:3000'].approvedTools).toHaveLength(1);

    // The same application, served from a different origin, starts from nothing.
    const other = await context.newPage();
    await other.goto('http://127.0.0.1:3000/claims');
    await reflex.attach(other);

    const otherSnapshot = await reflex.snapshot(other);
    expect(otherSnapshot.origin).toBe('http://127.0.0.1:3000');
    expect(otherSnapshot.activeToolIds).toEqual([]);
    expect(await other.evaluate(() => navigator.modelContext!.listTools!().length)).toBe(0);
  });

  test('a stale approval fails closed rather than actuating the wrong control', async ({ context, reflex }) => {
    const page = await context.newPage();
    await page.goto('/claims/CLM-2026-0481');
    await reflex.attach(page);

    const snapshot = await reflex.snapshot(page);
    await reflex.send(page, {
      type: 'APPROVE_CANDIDATE',
      candidateId: byName(snapshot.candidates, 'request_claim_review').id,
    });

    // The page changes what the form means, keeping its id.
    await page.evaluate(() => {
      document.getElementById('request-review')!.setAttribute('aria-label', 'Reject claim outright');
    });

    const result = await page.evaluate(async () => {
      const response = await navigator.modelContext!.callTool!('request_claim_review', {
        reason: 'valuation-dispute',
      });
      return JSON.parse(response.content[0]!.text) as { success: boolean; error?: string };
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('accessible name changed');
    await expect(page.locator('#claim-record')).toContainText('Awaiting documents');
  });
});
