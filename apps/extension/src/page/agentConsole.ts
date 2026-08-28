import type { CapabilityCandidate, ExecutionResult, RiskLevel } from '@reflex/capability-model';

/**
 * A minimal in-page tool client.
 *
 * A real WebMCP-aware agent would discover these tools through the browser. No
 * shipping browser exposes WebMCP yet, so this panel plays the client's part:
 * it lists exactly what Reflex registered and calls it with JSON arguments.
 * It is a demo affordance, not part of the capability pipeline.
 */

export interface AgentConsoleHooks {
  invoke: (candidateId: string, input: Record<string, unknown>) => Promise<ExecutionResult>;
  flavor: () => string;
  isNative: () => boolean;
}

export interface AgentConsole {
  update: (candidates: CapabilityCandidate[]) => void;
  destroy: () => void;
}

const HOST_ID = 'reflex-agent-console';

const RISK_COLOR: Record<RiskLevel, string> = {
  read: '#6ee7b7',
  write: '#93c5fd',
  sensitive: '#fcd34d',
  destructive: '#fca5a5',
};

const CSS = `
  :host { all: initial; }
  .panel {
    position: fixed; right: 16px; bottom: 16px; width: 340px; max-height: 70vh;
    display: flex; flex-direction: column;
    background: #111821; color: #e6edf3; border: 1px solid #2b3646; border-radius: 10px;
    font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
    box-shadow: 0 16px 40px rgba(0,0,0,.45); z-index: 2147483000;
  }
  header { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid #2b3646; }
  header strong { font-size: 12px; letter-spacing: .08em; color: #6ee7b7; }
  header .flavor { font-size: 10px; color: #7d8da3; margin-left: auto; }
  .body { overflow: auto; padding: 6px 0; }
  .tool { border-bottom: 1px solid #1c2430; padding: 8px 12px; }
  .tool:last-child { border-bottom: none; }
  .tool button.name {
    all: unset; cursor: pointer; display: flex; gap: 6px; align-items: center; width: 100%;
    color: #e6edf3; font: inherit;
  }
  .dot { width: 7px; height: 7px; border-radius: 50%; flex: none; }
  .args { display: none; margin-top: 8px; }
  .tool.open .args { display: block; }
  textarea {
    width: 100%; min-height: 52px; background: #0b1017; color: #e6edf3;
    border: 1px solid #2b3646; border-radius: 6px; padding: 6px; font: inherit; resize: vertical;
  }
  .row { display: flex; gap: 6px; margin-top: 6px; align-items: center; }
  .run { all: unset; cursor: pointer; background: #1f6f4f; color: #eafff5; padding: 4px 10px; border-radius: 5px; }
  .schema { color: #7d8da3; font-size: 10px; margin-top: 4px; word-break: break-word; }
  pre.result { margin: 6px 0 0; padding: 6px; background: #0b1017; border: 1px solid #2b3646;
    border-radius: 6px; white-space: pre-wrap; word-break: break-word; max-height: 160px; overflow: auto; }
  pre.result.error { border-color: #7f1d1d; }
  .empty { padding: 14px 12px; color: #7d8da3; }
  .close { all: unset; cursor: pointer; color: #7d8da3; padding: 0 2px; }
  .note { padding: 8px 12px; color: #7d8da3; border-top: 1px solid #2b3646; font-size: 10px; }
`;

export const mountAgentConsole = (hooks: AgentConsoleHooks): AgentConsole => {
  document.getElementById(HOST_ID)?.remove();

  const host = document.createElement('div');
  host.id = HOST_ID;
  // A shadow root keeps the panel's styling out of the host page entirely.
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = CSS;
  const panel = document.createElement('div');
  panel.className = 'panel';
  shadow.append(style, panel);
  document.documentElement.append(host);

  let current: CapabilityCandidate[] = [];
  let dismissed = false;

  /**
   * Per-tool view state. Kept outside render() because a tool call changes the
   * page, which triggers a rescan and a re-render — losing the arguments you
   * typed and the result you just got would make the panel useless.
   */
  interface ToolView {
    open: boolean;
    args?: string;
    result?: { text: string; error: boolean };
  }
  const views = new Map<string, ToolView>();
  const viewOf = (id: string): ToolView => {
    const existing = views.get(id);
    if (existing) return existing;
    const created: ToolView = { open: false };
    views.set(id, created);
    return created;
  };

  const renderTool = (candidate: CapabilityCandidate): HTMLElement => {
    const view = viewOf(candidate.id);
    const wrapper = document.createElement('div');
    wrapper.className = 'tool';

    const button = document.createElement('button');
    button.className = 'name';
    button.type = 'button';
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = RISK_COLOR[candidate.risk];
    const label = document.createElement('span');
    label.textContent = candidate.name;
    button.append(dot, label);
    button.addEventListener('click', () => {
      view.open = !view.open;
      wrapper.classList.toggle('open', view.open);
    });

    const args = document.createElement('div');
    args.className = 'args';

    const keys = Object.keys(candidate.inputSchema.properties);
    const textarea = document.createElement('textarea');
    textarea.spellcheck = false;
    textarea.addEventListener('input', () => {
      view.args = textarea.value;
    });
    textarea.value = view.args ?? (keys.length
      ? JSON.stringify(
          Object.fromEntries(keys.map((key) => [key, exampleFor(candidate, key)])),
          null,
          2,
        )
      : '{}');

    const schema = document.createElement('div');
    schema.className = 'schema';
    schema.textContent = keys.length
      ? keys
          .map((key) => {
            const property = candidate.inputSchema.properties[key];
            const required = candidate.inputSchema.required?.includes(key) ? '*' : '';
            const enumeration = property.enum ? ` (${property.enum.join(' | ')})` : '';
            return `${key}${required}: ${property.type}${enumeration}`;
          })
          .join(' · ')
      : 'no arguments';

    const row = document.createElement('div');
    row.className = 'row';
    const run = document.createElement('button');
    run.className = 'run';
    run.type = 'button';
    run.textContent = `call ${candidate.name}`;
    const output = document.createElement('pre');
    output.className = 'result';
    output.hidden = true;

    run.addEventListener('click', async () => {
      let input: Record<string, unknown> = {};
      try {
        input = textarea.value.trim() ? (JSON.parse(textarea.value) as Record<string, unknown>) : {};
      } catch (error) {
        view.result = {
          text: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
          error: true,
        };
        output.hidden = false;
        output.classList.add('error');
        output.textContent = view.result.text;
        return;
      }
      run.textContent = 'running…';
      const result = await hooks.invoke(candidate.id, input);
      run.textContent = `call ${candidate.name}`;
      view.result = { text: JSON.stringify(result, null, 2), error: !result.success };
      output.hidden = false;
      output.classList.toggle('error', !result.success);
      output.textContent = view.result.text;
    });

    if (view.result) {
      output.hidden = false;
      output.classList.toggle('error', view.result.error);
      output.textContent = view.result.text;
    }
    if (view.open) wrapper.classList.add('open');

    row.append(run);
    args.append(schema, textarea, row, output);
    wrapper.append(button, args);
    return wrapper;
  };

  const render = (): void => {
    panel.replaceChildren();

    const header = document.createElement('header');
    const title = document.createElement('strong');
    title.textContent = 'REFLEX TOOLS';
    const count = document.createElement('span');
    count.textContent = String(current.length);
    const flavor = document.createElement('span');
    flavor.className = 'flavor';
    flavor.textContent = hooks.isNative() ? hooks.flavor() : `${hooks.flavor()} (local)`;
    const close = document.createElement('button');
    close.className = 'close';
    close.type = 'button';
    close.textContent = '✕';
    close.title = 'Hide this panel';
    close.addEventListener('click', () => {
      // Closing sticks: it should not spring back on the next re-render.
      dismissed = true;
      host.remove();
    });
    header.append(title, count, flavor, close);
    panel.append(header);

    const body = document.createElement('div');
    body.className = 'body';
    if (!current.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'No tools registered yet. Approve a capability in the Reflex popup.';
      body.append(empty);
    } else {
      for (const candidate of current) body.append(renderTool(candidate));
    }
    panel.append(body);

    const note = document.createElement('div');
    note.className = 'note';
    note.textContent = hooks.isNative()
      ? 'Tools are registered with this browser’s WebMCP host.'
      : 'No browser WebMCP host found — Reflex registered a local host so tools can still be called.';
    panel.append(note);
  };

  render();

  return {
    update: (candidates) => {
      current = candidates;
      // Forget the view state of tools that are no longer registered.
      const live = new Set(candidates.map((candidate) => candidate.id));
      for (const id of views.keys()) if (!live.has(id)) views.delete(id);
      if (dismissed) return;
      // Never re-attach over a newer console instance.
      if (!host.isConnected) {
        if (document.getElementById(HOST_ID)) return;
        document.documentElement.append(host);
      }
      render();
    },
    destroy: () => host.remove(),
  };
};

/** A plausible starting value, so the demo is one click rather than one paragraph of typing. */
const exampleFor = (candidate: CapabilityCandidate, key: string): unknown => {
  const property = candidate.inputSchema.properties[key];
  if (property.enum?.length) return property.enum[0];
  switch (property.type) {
    case 'boolean':
      return false;
    case 'number':
    case 'integer':
      return property.minimum ?? 0;
    case 'array':
      return property.items?.enum?.length ? [property.items.enum[0]] : [];
    default:
      if (property.format === 'email') return 'name@example.test';
      if (property.format === 'date') return new Date().toISOString().slice(0, 10);
      return '';
  }
};
