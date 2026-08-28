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
    await expect(popup.locator('.readiness .label')).toContainText('controls');
    // Triage reports what it kept and what it held back.
    await expect(popup.locator('.tally')).toContainText('8 shown of 8 found');

    // Read → write → sensitive → destructive.
    await expect(popup.locator('.group')).toHaveText([
      /read/i,
      /write/i,
      /sensitive/i,
      /destructive/i,
    ]);
    await expect(popup.locator('.row')).toHaveCount(8);
    await expect(popup.locator('.row', { hasText: 'withdraw_claim' })).toContainText('🔒');
  });

  test('enabling a tool from the inspector registers it in the page', async ({ context, reflex }) => {
    const page = await context.newPage();
    await page.goto('/claims/CLM-2026-0481');
    await reflex.attach(page);

    const popup = await reflex.openPopup(page);
    await popup.locator('.row', { hasText: 'request_claim_review' }).click();

    // The inspector shows what the decision is based on.
    await expect(popup.locator('h1')).toHaveText('Request claim review');
    await expect(popup.locator('.badge').first()).toHaveText('write');
    await expect(popup.locator('ul.evidence')).toContainText('Ask an assessor to re-examine this claim');
    await expect(popup.locator('pre.schema')).toContainText('"notes"');

    await popup.locator('button', { hasText: 'enable tool' }).click();
    await expect(popup.locator('.badge', { hasText: 'active' })).toBeVisible();

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
    await popup.locator('.row', { hasText: 'view_claim_record' }).click();

    await popup.locator('label.field', { hasText: 'Tool name' }).locator('input').fill('get_claim');
    await popup
      .locator('label.field', { hasText: 'Description' })
      .locator('textarea')
      .fill('Get one claim record by its reference number.');
    await popup.locator('button', { hasText: 'enable tool' }).click();

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
    await popup.locator('.row', { hasText: 'withdraw_claim' }).click();
    await popup.locator('button', { hasText: 'reject' }).click();

    await expect(popup.locator('.row', { hasText: 'withdraw_claim' })).toContainText('✕');
    expect(await page.evaluate(() => navigator.modelContext!.listTools!().length)).toBe(0);

    const stored = await reflex.storedOrigins();
    expect(stored['http://localhost:3000'].rejectedTools).toHaveLength(1);
    expect(stored['http://localhost:3000'].approvedTools).toHaveLength(0);
  });

  test('triage hides weak candidates, and one click brings them back', async ({ context, reflex }) => {
    const page = await context.newPage();
    await page.goto('/claims');

    // Plant the kind of noise a real page produces: labelled buttons with no
    // description, and a control whose label is a count.
    await page.evaluate(() => {
      const host = document.querySelector('main')!;
      for (let i = 0; i < 3; i += 1) {
        const button = document.createElement('button');
        button.type = 'button';
        button.setAttribute('aria-label', 'Show cards');
        button.textContent = 'Show cards';
        host.append(button);
      }
      const counted = document.createElement('button');
      counted.type = 'button';
      counted.setAttribute('aria-label', '166 replies');
      counted.textContent = '166 replies';
      host.append(counted);
    });
    await reflex.attach(page);

    const popup = await reflex.openPopup(page);
    // The five real capabilities survive; the four planted controls do not.
    await expect(popup.locator('.tally')).toContainText('5 shown of 9 found');
    await expect(popup.locator('.row')).toHaveCount(5);
    await expect(popup.locator('.row', { hasText: 'show_cards' })).toHaveCount(0);
    await expect(popup.locator('.row', { hasText: '166_replies' })).toHaveCount(0);

    // And they are recoverable, not discarded. All three "Show cards" controls
    // appear here: each was held back on its own for being too weak, so none
    // was promoted to represent the group.
    await popup.locator('button', { hasText: 'show 4 held back' }).click();
    await expect(popup.locator('.row')).toHaveCount(9);
    await expect(popup.locator('.row', { hasText: 'show_cards' })).toHaveCount(3);

    // Each held-back row explains why it was held.
    await popup.locator('.row', { hasText: '166_replies' }).click();
    await expect(popup.locator('.note.held')).toContainText('label is a count');
    await popup.locator('button[title="Back to the list"]').click();

    await popup.locator('.row', { hasText: 'show_cards' }).first().click();
    await expect(popup.locator('.note.held')).toContainText('below the 70% floor for buttons');
    await expect(popup.locator('.reasons')).toContainText('no ARIA description');
  });

  test('the filter narrows the list', async ({ context, reflex }) => {
    const page = await context.newPage();
    await page.goto('/claims/CLM-2026-0481');
    await reflex.attach(page);

    const popup = await reflex.openPopup(page);
    await expect(popup.locator('.row')).toHaveCount(8);

    await popup.locator('.triage input').fill('document');
    await expect(popup.locator('.row')).toHaveCount(3);
    await expect(popup.locator('.row', { hasText: 'delete_supporting_document' })).toHaveCount(1);

    await popup.locator('.triage input').fill('destructive');
    await expect(popup.locator('.row')).toHaveCount(2);
  });

  test('a low score explains itself in the inspector', async ({ context, reflex }) => {
    const page = await context.newPage();
    await page.goto('/claims/CLM-2026-0481');
    await reflex.attach(page);

    const popup = await reflex.openPopup(page);
    await popup.locator('.row', { hasText: 'set_claim_access_pin' }).click();

    // 55% is not a verdict a reviewer can act on; the reasons are.
    await expect(popup.locator('.reasons')).toContainText('declares fields but exposes none');
    await expect(popup.locator('pre.schema')).toContainText('"properties": {}');
  });

  test('turning Reflex off for a site withdraws its tools at once', async ({ context, reflex }) => {
    const page = await context.newPage();
    await page.goto('/claims');
    await reflex.attach(page);

    const popup = await reflex.openPopup(page);
    await popup.locator('button', { hasText: /enable \d read-only/ }).click();
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
