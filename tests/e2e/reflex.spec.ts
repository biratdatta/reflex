import { expect, test } from './fixtures.js';
import type { CapabilityCandidate } from '@reflex/capability-model';

const byName = (candidates: CapabilityCandidate[], name: string): CapabilityCandidate => {
  const found = candidates.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`No candidate "${name}". Found: ${candidates.map((c) => c.name).join(', ')}`);
  return found;
};

test.describe('Reflex on the ACME demo app', () => {
  test('discovers the directory capabilities in a real browser', async ({ context, reflex }) => {
    const page = await context.newPage();
    await page.goto('/employees');
    await reflex.attach(page);

    const snapshot = await reflex.snapshot(page);

    expect(snapshot.candidates.map((candidate) => candidate.name).sort()).toEqual([
      'create_employee',
      'filter_employees_by_department',
      'import_employees_from_csv',
      'search_employees',
      'view_employee_record',
    ]);
    expect(snapshot.readiness.score).toBeGreaterThanOrEqual(75);
    expect(snapshot.webmcpAvailable).toBe(true);
  });

  test('registers approved tools with a WebMCP host and leaves the rest alone', async ({ context, reflex }) => {
    const page = await context.newPage();
    await page.goto('/employees');
    await reflex.attach(page);

    const before = await reflex.snapshot(page);
    const search = byName(before.candidates, 'search_employees');

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
      name: 'search_employees',
      description: 'Find an employee by name or email.',
      readOnly: true,
    });
    expect(tools[0].schema.properties.query).toMatchObject({ type: 'string' });
  });

  test('an agent calling the tool drives the real UI', async ({ context, reflex }) => {
    const page = await context.newPage();
    await page.goto('/employees');
    await reflex.attach(page);

    const snapshot = await reflex.snapshot(page);
    await reflex.send(page, {
      type: 'APPROVE_CANDIDATE',
      candidateId: byName(snapshot.candidates, 'search_employees').id,
    });

    // This is what a WebMCP client does: call the tool by name with JSON arguments.
    const response = await page.evaluate(async () => {
      const result = await navigator.modelContext!.callTool!('search_employees', { query: 'Sarah Chen' });
      return { text: result.content[0]?.text, isError: result.isError };
    });

    expect(response.isError).toBeFalsy();
    const result = JSON.parse(response.text!);
    expect(result.success).toBe(true);
    expect(result.observed.region).toContain('Sarah Chen');

    // And the page itself visibly reacted.
    await expect(page.locator('#employee-query')).toHaveValue('Sarah Chen');
    await expect(page.locator('#app-status')).toContainText('returned 1 employee');
  });

  test('a write tool changes the application state', async ({ context, reflex }) => {
    const page = await context.newPage();
    await page.goto('/employees/E-482');
    await reflex.attach(page);

    const snapshot = await reflex.snapshot(page);
    const change = byName(snapshot.candidates, 'change_department');
    expect(change.risk).toBe('write');
    expect(change.inputSchema.properties.department.enum).toContain('finance');

    await reflex.send(page, { type: 'APPROVE_CANDIDATE', candidateId: change.id });

    const result = await page.evaluate(async () => {
      const response = await navigator.modelContext!.callTool!('change_department', { department: 'finance' });
      return JSON.parse(response.content[0]!.text) as { success: boolean };
    });

    expect(result.success).toBe(true);
    await expect(page.locator('#employee-record')).toContainText('Finance');
    await expect(page.locator('#app-status')).toContainText('Moved Sarah Chen from Engineering to Finance');
  });

  test('destructive tools ask a human in the page before actuating', async ({ context, reflex }) => {
    const page = await context.newPage();
    await page.goto('/employees/E-482');
    await reflex.attach(page);

    const snapshot = await reflex.snapshot(page);
    const revoke = byName(snapshot.candidates, 'revoke_application_access');
    expect(revoke.risk).toBe('destructive');
    await reflex.send(page, { type: 'APPROVE_CANDIDATE', candidateId: revoke.id });

    // Refuse the first time.
    page.once('dialog', (dialog) => {
      expect(dialog.message()).toContain('human approval required');
      void dialog.dismiss();
    });
    const declined = await page.evaluate(async () => {
      const response = await navigator.modelContext!.callTool!('revoke_application_access', { application: 'aws' });
      return JSON.parse(response.content[0]!.text) as { success: boolean; error?: string };
    });
    expect(declined).toMatchObject({ success: false, error: 'Human approval declined' });
    await expect(page.locator('#application-table')).toContainText('AWS');
    await expect(page.locator('#revoke-app')).toContainText('AWS');

    // Allow the second time.
    page.once('dialog', (dialog) => void dialog.accept());
    const approved = await page.evaluate(async () => {
      const response = await navigator.modelContext!.callTool!('revoke_application_access', { application: 'aws' });
      return JSON.parse(response.content[0]!.text) as { success: boolean };
    });
    expect(approved.success).toBe(true);
    await expect(page.locator('#app-status')).toContainText("Revoked Sarah Chen's access to AWS");
  });

  test('withdrawing tools unregisters them from the host', async ({ context, reflex }) => {
    const page = await context.newPage();
    await page.goto('/employees');
    await reflex.attach(page);

    const snapshot = await reflex.snapshot(page);
    await reflex.send(page, { type: 'APPROVE_SAFE_TOOLS' });

    const registered = await page.evaluate(() => navigator.modelContext!.listTools!().map((tool) => tool.name));
    expect(registered.sort()).toEqual([
      'filter_employees_by_department',
      'search_employees',
      'view_employee_record',
    ]);
    // Bulk approval covers read-only capabilities only.
    expect(registered).not.toContain('create_employee');
    expect(snapshot.candidates.some((candidate) => candidate.name === 'create_employee')).toBe(true);

    await reflex.send(page, { type: 'DISABLE_ALL_TOOLS' });
    expect(await page.evaluate(() => navigator.modelContext!.listTools!().length)).toBe(0);
  });

  test('the in-page console lists what is registered', async ({ context, reflex }) => {
    const page = await context.newPage();
    await page.goto('/employees');
    await reflex.attach(page);

    const console_ = page.locator('#reflex-agent-console');
    await expect(console_).toBeAttached();
    await expect(console_.locator('.empty')).toContainText('No tools registered yet');

    const snapshot = await reflex.snapshot(page);
    await reflex.send(page, {
      type: 'APPROVE_CANDIDATE',
      candidateId: byName(snapshot.candidates, 'search_employees').id,
    });

    await expect(console_.locator('.tool')).toHaveCount(1);
    await expect(console_.locator('.tool .name')).toContainText('search_employees');
  });

  test('the console keeps its arguments and result after a call re-renders the page', async ({
    context,
    reflex,
  }) => {
    const page = await context.newPage();
    await page.goto('/employees');
    await reflex.attach(page);

    const snapshot = await reflex.snapshot(page);
    await reflex.send(page, {
      type: 'APPROVE_CANDIDATE',
      candidateId: byName(snapshot.candidates, 'search_employees').id,
    });

    const console_ = page.locator('#reflex-agent-console');
    const tool = console_.locator('.tool').first();
    await tool.locator('button.name').click();
    await tool.locator('textarea').fill('{"query": "Priya"}');
    await tool.locator('button.run').click();

    // Executing the tool re-renders the application; the panel must survive it.
    await expect(tool.locator('pre.result')).toContainText('"success": true');
    await expect(tool.locator('textarea')).toHaveValue('{"query": "Priya"}');
    await expect(tool).toHaveClass(/open/);
    await expect(page.locator('#app-status')).toContainText('returned 1 employee');
  });

  test('re-attaching does not create a second runtime', async ({ context, reflex }) => {
    const page = await context.newPage();
    await page.goto('/employees');
    await reflex.attach(page);
    // Opening the popup again re-runs the injection path.
    await reflex.attach(page);
    await reflex.attach(page);

    const snapshot = await reflex.snapshot(page);
    await reflex.send(page, {
      type: 'APPROVE_CANDIDATE',
      candidateId: byName(snapshot.candidates, 'search_employees').id,
    });

    // One console, and one registration of the tool — not three.
    expect(await page.locator('#reflex-agent-console').count()).toBe(1);
    expect(await page.evaluate(() => navigator.modelContext!.listTools!().map((tool) => tool.name))).toEqual([
      'search_employees',
    ]);

    const calls = await page.evaluate(async () => {
      const response = await navigator.modelContext!.callTool!('search_employees', { query: 'Priya' });
      return JSON.parse(response.content[0]!.text) as { success: boolean };
    });
    expect(calls.success).toBe(true);
    await expect(page.locator('#app-status')).toContainText('returned 1 employee');
  });

  test('approvals are scoped to the origin that granted them', async ({ context, reflex }) => {
    const page = await context.newPage();
    await page.goto('http://localhost:3000/employees');
    await reflex.attach(page);

    const snapshot = await reflex.snapshot(page);
    await reflex.send(page, {
      type: 'APPROVE_CANDIDATE',
      candidateId: byName(snapshot.candidates, 'search_employees').id,
    });

    const stored = await reflex.storedOrigins();
    expect(Object.keys(stored)).toEqual(['http://localhost:3000']);
    expect(stored['http://localhost:3000'].approvedTools).toHaveLength(1);

    // The same application, served from a different origin, starts from nothing.
    const other = await context.newPage();
    await other.goto('http://127.0.0.1:3000/employees');
    await reflex.attach(other);

    const otherSnapshot = await reflex.snapshot(other);
    expect(otherSnapshot.origin).toBe('http://127.0.0.1:3000');
    expect(otherSnapshot.activeToolIds).toEqual([]);
    expect(await other.evaluate(() => navigator.modelContext!.listTools!().length)).toBe(0);
  });

  test('a stale approval fails closed rather than actuating the wrong control', async ({ context, reflex }) => {
    const page = await context.newPage();
    await page.goto('/employees/E-482');
    await reflex.attach(page);

    const snapshot = await reflex.snapshot(page);
    await reflex.send(page, {
      type: 'APPROVE_CANDIDATE',
      candidateId: byName(snapshot.candidates, 'change_department').id,
    });

    // The page changes what the form means, keeping its id.
    await page.evaluate(() => {
      document.getElementById('change-department')!.setAttribute('aria-label', 'Terminate employment');
    });

    const result = await page.evaluate(async () => {
      const response = await navigator.modelContext!.callTool!('change_department', { department: 'finance' });
      return JSON.parse(response.content[0]!.text) as { success: boolean; error?: string };
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('accessible name changed');
    await expect(page.locator('#employee-record')).toContainText('Engineering');
  });
});
