import { expect, test } from './fixtures.js';

/**
 * Drives the real popup UI. The popup is opened as a tab pointed at the demo
 * page (?tabId=…), which is the same code path the toolbar button takes.
 */
test.describe('the Reflex popup', () => {
  test('shows readiness and the discovered capabilities, grouped by risk', async ({ context, reflex }) => {
    const page = await context.newPage();
    await page.goto('/claims/CLM-2026-0481');
    await reflex.attach(page);

    const popup = await reflex.openPopup(page);

    await expect(popup.locator('.brand')).toHaveText('REFLEX');
    await expect(popup.locator('.readiness .score')).toContainText('%');
    await expect(popup.locator('.readiness .label')).toContainText('capabilities discovered');

    // Read → write → sensitive → destructive.
    await expect(popup.locator('.group-title')).toHaveText([
      /READ/i,
      /WRITE/i,
      /SENSITIVE/i,
      /DESTRUCTIVE/i,
    ]);
    await expect(popup.locator('.candidate')).toHaveCount(8);
    await expect(popup.locator('.candidate', { hasText: 'withdraw_claim' })).toContainText('🔒');
  });

  test('enabling a tool from the inspector registers it in the page', async ({ context, reflex }) => {
    const page = await context.newPage();
    await page.goto('/claims/CLM-2026-0481');
    await reflex.attach(page);

    const popup = await reflex.openPopup(page);
    await popup.locator('.candidate', { hasText: 'request_claim_review' }).click();

    // The inspector shows what the decision is based on.
    await expect(popup.locator('h1')).toHaveText('Request claim review');
    await expect(popup.locator('.badge').first()).toHaveText('Write');
    await expect(popup.locator('.evidence')).toContainText('Ask an assessor to re-examine this claim');
    await expect(popup.locator('pre.schema')).toContainText('"notes"');

    await popup.locator('button', { hasText: 'Enable tool' }).click();
    await expect(popup.locator('.badge', { hasText: 'tool active' })).toBeVisible();

    // And the page now really has the tool.
    await expect
      .poll(async () => page.evaluate(() => navigator.modelContext!.listTools!().map((tool) => tool.name)))
      .toEqual(['request_claim_review']);
  });

  test('a reviewer can correct a generated name and description before enabling', async ({ context, reflex }) => {
    const page = await context.newPage();
    await page.goto('/claims');
    await reflex.attach(page);

    const popup = await reflex.openPopup(page);
    await popup.locator('.candidate', { hasText: 'view_claim_record' }).click();

    await popup.locator('label.field', { hasText: 'Tool name' }).locator('input').fill('get_claim');
    await popup
      .locator('label.field', { hasText: 'Description' })
      .locator('textarea')
      .fill('Get one claim record by its reference number.');
    await popup.locator('button', { hasText: 'Enable tool' }).click();

    await expect
      .poll(async () =>
        page.evaluate(() =>
          navigator.modelContext!.listTools!().map((tool) => ({ name: tool.name, description: tool.description })),
        ),
      )
      .toEqual([{ name: 'get_claim', description: 'Get one claim record by its reference number.' }]);
  });

  test('rejecting a capability leaves nothing registered', async ({ context, reflex }) => {
    const page = await context.newPage();
    await page.goto('/claims/CLM-2026-0481');
    await reflex.attach(page);

    const popup = await reflex.openPopup(page);
    await popup.locator('.candidate', { hasText: 'withdraw_claim' }).click();
    await popup.locator('button', { hasText: 'Reject' }).click();

    await expect(popup.locator('.candidate', { hasText: 'withdraw_claim' })).toContainText('✕');
    expect(await page.evaluate(() => navigator.modelContext!.listTools!().length)).toBe(0);

    const stored = await reflex.storedOrigins();
    expect(stored['http://localhost:3000'].rejectedTools).toHaveLength(1);
    expect(stored['http://localhost:3000'].approvedTools).toHaveLength(0);
  });

  test('turning Reflex off for a site withdraws its tools at once', async ({ context, reflex }) => {
    const page = await context.newPage();
    await page.goto('/claims');
    await reflex.attach(page);

    const popup = await reflex.openPopup(page);
    await popup.locator('button', { hasText: /Enable \d read-only tools/ }).click();
    await expect
      .poll(async () => page.evaluate(() => navigator.modelContext!.listTools!().length))
      .toBe(3);

    await popup.locator('button[title="Settings"]').click();
    const toggle = popup.locator('label.toggle', { hasText: 'Reflex enabled here' }).locator('input');
    await toggle.click();
    await expect(toggle).not.toBeChecked();

    await expect.poll(async () => page.evaluate(() => navigator.modelContext!.listTools!().length)).toBe(0);
  });
});
