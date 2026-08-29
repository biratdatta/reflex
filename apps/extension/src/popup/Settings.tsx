import { PANEL_THEMES, type ReflexSettings } from '../shared/types.js';

interface Props {
  settings: ReflexSettings;
  origin: string;
  enabled: boolean;
  onChange: (patch: Partial<ReflexSettings>) => void;
  onSetEnabled: (enabled: boolean) => void;
  onDisableAll: () => void;
  onBack: () => void;
}

export const Settings = ({ settings, origin, enabled, onChange, onSetEnabled, onDisableAll, onBack }: Props) => (
  <>
    <div className="topbar">
      <button type="button" className="icon" onClick={onBack} title="Back">
        ←
      </button>
      <span className="brand">REFLEX</span>
      <span className="brand-sub">settings</span>
    </div>

    <div className="section">
      <h2>This site</h2>
      <p className="dim" style={{ margin: '0 0 9px' }}>{origin}</p>
      <label className="toggle">
        <input type="checkbox" checked={enabled} onChange={(event) => onSetEnabled(event.target.checked)} />
        <span>
          Reflex enabled here
          <small>Turning this off withdraws every registered tool immediately.</small>
        </span>
      </label>
      <button type="button" className="chip" onClick={onDisableAll}>
        Withdraw all tools on this site
      </button>
    </div>

    <div className="section">
      <h2>Panel design</h2>
      <p className="dim" style={{ margin: '0 0 9px', fontSize: 10.5, lineHeight: 1.5 }}>
        Five directions, all of them real. Which is right depends on who is reviewing: density for an
        engineer auditing their own app, gravity for someone deciding whether an agent may move money.
      </p>
      <div className="modes" role="group" aria-label="Light or dark">
        {(
          [
            ['system', 'System'],
            ['light', 'Light'],
            ['dark', 'Dark'],
          ] as Array<[ReflexSettings['panelMode'], string]>
        ).map(([id, label]) => (
          <button
            type="button"
            key={id}
            className={`chip ${settings.panelMode === id ? 'on' : ''}`}
            onClick={() => onChange({ panelMode: id })}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="dim" style={{ margin: '0 0 10px', fontSize: 10.5, lineHeight: 1.5 }}>
        Civic is the only design with both. The others are committed looks — inverting them would make
        them something else.
      </p>

      <div className="themes">
        {PANEL_THEMES.map((theme) => (
          <label key={theme.id} className={settings.panelTheme === theme.id ? 'sel' : ''}>
            <input
              type="radio"
              name="panel-theme"
              value={theme.id}
              checked={settings.panelTheme === theme.id}
              onChange={() => onChange({ panelTheme: theme.id })}
            />
            <span>
              <b>{theme.name}</b>
              <small>{theme.stance}</small>
            </span>
          </label>
        ))}
      </div>
    </div>

    <div className="section">
      <h2>Safety</h2>
      <label className="toggle">
        <input
          type="checkbox"
          checked={settings.confirmDestructive}
          onChange={(event) => onChange({ confirmDestructive: event.target.checked })}
        />
        <span>
          Confirm destructive calls in the page
          <small>Asks you before a destructive tool actuates, every time.</small>
        </span>
      </label>
      <label className="toggle">
        <input
          type="checkbox"
          checked={settings.autoRescan}
          onChange={(event) => onChange({ autoRescan: event.target.checked })}
        />
        <span>
          Rescan when the page changes
          <small>Keeps the tool list in step with what is actually on screen.</small>
        </span>
      </label>
    </div>

    <div className="section">
      <h2>Discovery</h2>
      <label className="field">
        Minimum confidence · {settings.confidenceThreshold}%
        <input
          type="range"
          min={0}
          max={95}
          step={5}
          value={settings.confidenceThreshold}
          onChange={(event) => onChange({ confidenceThreshold: Number(event.target.value) })}
        />
      </label>
      <p className="dim" style={{ margin: 0, fontSize: 10.5, lineHeight: 1.5 }}>
        The floor before triage. Triage then judges forms at 50% and buttons at 70%, because a form arrives with a
        schema and a button is two words of label.
      </p>
    </div>

    <div className="section">
      <h2>WebMCP</h2>
      <label className="toggle">
        <input
          type="checkbox"
          checked={settings.allowShim}
          onChange={(event) => onChange({ allowShim: event.target.checked })}
        />
        <span>
          Provide a local host when the browser has none
          <small>
            WebMCP is experimental and not in stable Chrome. With this on, Reflex installs a local
            <code> navigator.modelContext </code> so tools can still be listed and called.
          </small>
        </span>
      </label>
      <label className="toggle">
        <input
          type="checkbox"
          checked={settings.showAgentConsole}
          onChange={(event) => onChange({ showAgentConsole: event.target.checked })}
        />
        <span>
          Show the in-page tool console
          <small>A stand-in for a WebMCP client: lists active tools and calls them with JSON arguments.</small>
        </span>
      </label>
    </div>

    <p className="foot">
      Discovery runs entirely in this browser. Reflex sends no page content anywhere, and approvals never cross from
      one origin to another.
    </p>
  </>
);
