import { describe, expect, it, vi } from 'vitest';
import { discoverCapabilities, scanButtons, scanForm } from '@reflex/discovery-engine';
import { applyField, executeCandidate, toToolResponse } from '@reflex/webmcp-adapter';
import { el, mount } from './helpers.js';

const FORM = `
  <section>
    <form id="change-department" aria-label="Change department" aria-description="Move this employee to another department">
      <label for="dept">New department</label>
      <select id="dept" name="department" required>
        <option value="">Choose…</option>
        <option value="engineering">Engineering</option>
        <option value="finance">Finance</option>
      </select>
      <label for="eff">Effective date</label>
      <input id="eff" name="effectiveDate" type="date">
      <label for="notify">Notify manager</label>
      <input id="notify" name="notifyManager" type="checkbox">
      <button type="submit">Change department</button>
    </form>
    <p id="status" role="status">Department: Engineering</p>
  </section>
`;

/** Stand in for the page's own submit handler. */
const captureSubmit = (form: HTMLFormElement, onSubmit: (data: Record<string, string>) => void) => {
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const data: Record<string, string> = {};
    for (const [key, value] of new FormData(form).entries()) data[key] = String(value);
    onSubmit(data);
  });
};

describe('applyField', () => {
  it('sets a text field and fires input and change', () => {
    mount(`<form id="f"><input name="query"></form>`);
    const events: string[] = [];
    el('input').addEventListener('input', () => events.push('input'));
    el('input').addEventListener('change', () => events.push('change'));

    expect(applyField(el('#f'), 'query', 'Sarah Chen')).toEqual({ key: 'query', applied: true });
    expect(el<HTMLInputElement>('input').value).toBe('Sarah Chen');
    expect(events).toEqual(['input', 'change']);
  });

  it('selects a radio by value', () => {
    mount(`
      <form id="f">
        <input type="radio" name="status" value="active">
        <input type="radio" name="status" value="leave">
      </form>
    `);
    expect(applyField(el('#f'), 'status', 'leave').applied).toBe(true);
    expect(document.querySelectorAll<HTMLInputElement>('input')[1].checked).toBe(true);
  });

  it('refuses a value that is not an option', () => {
    mount(`<form id="f"><select name="department"><option value="engineering">Eng</option></select></form>`);
    const outcome = applyField(el('#f'), 'department', 'legal');
    expect(outcome.applied).toBe(false);
    expect(outcome.reason).toContain('not an option: legal');
    expect(outcome.reason).toContain('allowed: engineering');
  });

  it('toggles a checkbox group to exactly the requested values', () => {
    mount(`
      <form id="f">
        <input type="checkbox" name="apps" value="github" checked>
        <input type="checkbox" name="apps" value="slack">
      </form>
    `);
    applyField(el('#f'), 'apps', ['slack']);
    const boxes = document.querySelectorAll<HTMLInputElement>('input');
    expect([boxes[0].checked, boxes[1].checked]).toEqual([false, true]);
  });

  it('reports a field that does not exist', () => {
    mount(`<form id="f"></form>`);
    expect(applyField(el('#f'), 'query', 'x')).toEqual({ key: 'query', applied: false, reason: 'no matching field' });
  });
});

describe('executeCandidate — forms', () => {
  it('populates fields, submits, and returns what the page then showed', async () => {
    mount(FORM);
    const candidate = scanForm(el('form'))!;
    const submitted = vi.fn((data: Record<string, string>) => {
      el('#status').textContent = `Department: ${data.department}`;
    });
    captureSubmit(el<HTMLFormElement>('form'), submitted);

    const result = await executeCandidate(document, candidate, { department: 'finance' }, { settleMs: 0 });

    expect(submitted).toHaveBeenCalledOnce();
    expect(submitted.mock.calls[0][0].department).toBe('finance');
    expect(result.success).toBe(true);
    expect(result.observed).toMatchObject({ applied: ['department'], region: 'Department: finance' });
  });

  it('reports arguments the schema does not describe instead of silently dropping them', async () => {
    mount(FORM);
    const candidate = scanForm(el('form'))!;
    captureSubmit(el<HTMLFormElement>('form'), () => {});
    const result = await executeCandidate(
      document,
      candidate,
      { department: 'finance', salaryBand: 'L5' },
      { settleMs: 0 },
    );
    expect(result.observed).toMatchObject({ ignoredArguments: ['salaryBand'] });
  });

  it('refuses to submit when a required argument is missing', async () => {
    mount(FORM);
    const candidate = scanForm(el('form'))!;
    const submitted = vi.fn();
    captureSubmit(el<HTMLFormElement>('form'), submitted);

    const result = await executeCandidate(document, candidate, { notifyManager: true }, { settleMs: 0 });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Missing required argument(s): department');
    expect(submitted).not.toHaveBeenCalled();
  });

  it('fails closed when the form is gone', async () => {
    mount(FORM);
    const candidate = scanForm(el('form'))!;
    el('form').remove();
    const result = await executeCandidate(document, candidate, { department: 'finance' }, { settleMs: 0 });
    expect(result.success).toBe(false);
    expect(result.error).toContain('no longer present');
  });

  it('fails closed when the form lost a field it was approved with', async () => {
    mount(FORM);
    const candidate = scanForm(el('form'))!;
    el('#dept').remove();
    const result = await executeCandidate(document, candidate, { department: 'finance' }, { settleMs: 0 });
    expect(result.success).toBe(false);
    expect(result.error).toContain('fields missing: department');
  });

  it('fails closed when the form was relabelled under the same id', async () => {
    mount(FORM);
    const candidate = scanForm(el('form'))!;
    el('form').setAttribute('aria-label', 'Terminate employee');
    const result = await executeCandidate(document, candidate, { department: 'finance' }, { settleMs: 0 });
    expect(result.success).toBe(false);
    expect(result.error).toContain('accessible name changed');
  });
});

describe('executeCandidate on a multi-page application', () => {
  it('returns as soon as the page starts navigating, instead of hanging', async () => {
    mount(FORM);
    const candidate = scanForm(el('form'))!;
    // A classic server-rendered form: submitting unloads the document.
    el('form').addEventListener('submit', (event) => {
      event.preventDefault();
      window.dispatchEvent(new Event('pagehide'));
    });

    const started = Date.now();
    // A settle delay far longer than the test could afford to wait.
    const result = await executeCandidate(document, candidate, { department: 'finance' }, { settleMs: 5000 });

    expect(result.success).toBe(true);
    expect(result.detail).toContain('the page is navigating');
    expect(result.observed).toMatchObject({ navigating: true });
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('reports navigation for button tools too', async () => {
    mount(`<button id="go" aria-label="Deactivate employee" aria-description="Blocks sign-in">Deactivate</button>`);
    const candidate = scanButtons(document)[0];
    el('#go').addEventListener('click', () => window.dispatchEvent(new Event('pagehide')));

    const result = await executeCandidate(document, candidate, {}, { settleMs: 5000 });
    expect(result).toMatchObject({ success: true, observed: { navigating: true } });
  });
});

describe('executeCandidate — buttons', () => {
  const BUTTON = `
    <section>
      <button id="deactivate" aria-label="Deactivate employee" aria-describedby="h">Deactivate</button>
      <p id="h">Prevents this employee from signing in.</p>
      <p id="state" role="status">Status: active</p>
    </section>
  `;

  it('clicks the verified control and returns the observed region', async () => {
    mount(BUTTON);
    const candidate = scanButtons(document)[0];
    el('#deactivate').addEventListener('click', () => {
      el('#state').textContent = 'Status: deactivated';
    });

    const result = await executeCandidate(document, candidate, {}, { settleMs: 0 });
    expect(result.success).toBe(true);
    expect(result.observed).toMatchObject({ region: 'Status: deactivated' });
  });

  it('asks for human approval before a destructive action, and aborts on refusal', async () => {
    mount(BUTTON);
    const candidate = scanButtons(document)[0];
    const clicked = vi.fn();
    el('#deactivate').addEventListener('click', clicked);

    const declined = await executeCandidate(document, candidate, {}, { settleMs: 0, confirm: () => false });
    expect(declined).toMatchObject({ success: false, error: 'Human approval declined' });
    expect(clicked).not.toHaveBeenCalled();

    const approved = await executeCandidate(document, candidate, {}, { settleMs: 0, confirm: () => true });
    expect(approved.success).toBe(true);
    expect(clicked).toHaveBeenCalledOnce();
  });

  it('refuses a disabled control', async () => {
    mount(BUTTON);
    const candidate = scanButtons(document)[0];
    el<HTMLButtonElement>('#deactivate').disabled = true;
    const result = await executeCandidate(document, candidate, {}, { settleMs: 0 });
    expect(result).toMatchObject({ success: false, error: 'Control is disabled' });
  });
});

describe('toToolResponse', () => {
  it('wraps a result in MCP content and flags errors', () => {
    const ok = toToolResponse({ success: true, action: 'search_employees' });
    expect(ok.isError).toBe(false);
    expect(JSON.parse(ok.content[0].text)).toMatchObject({ success: true });

    const bad = toToolResponse({ success: false, action: 'x', error: 'gone' });
    expect(bad.isError).toBe(true);
  });
});

describe('a full page scan and execute', () => {
  it('discovers, then executes, without holding a reference to the element', async () => {
    mount(FORM);
    const { candidates } = discoverCapabilities(document);
    const candidate = candidates.find((entry) => entry.name === 'change_department')!;
    expect(candidate).toBeDefined();

    // Re-render the page as a framework would: same markup, brand new nodes.
    const html = document.body.innerHTML;
    document.body.innerHTML = '';
    document.body.innerHTML = html;
    captureSubmit(el<HTMLFormElement>('form'), (data) => {
      el('#status').textContent = `Department: ${data.department}`;
    });

    const result = await executeCandidate(document, candidate, { department: 'finance' }, { settleMs: 0 });
    expect(result.success).toBe(true);
  });
});
