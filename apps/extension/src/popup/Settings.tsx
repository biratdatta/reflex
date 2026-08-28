import type { ReflexSettings } from '../shared/types.js';

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
      <button type="button" className="ghost icon" onClick={onBack} title="Back">
        ←
      </button>
      <span className="brand">REFLEX</span>
      <span className="brand-sub">settings</span>
    </div>

    <div className="section">
      <h2>This site</h2>
      <p className="muted" style={{ margin: '0 0 8px' }}>
        <code>{origin}</code>
      </p>
      <label className="toggle">
        <input type="checkbox" checked={enabled} onChange={(event) => onSetEnabled(event.target.checked)} />
        <span>
          Reflex enabled here
          <small>Turning this off withdraws every registered tool immediately.</small>
        </span>
      </label>
      <button type="button" className="danger" onClick={onDisableAll}>
        Withdraw all tools on this site
      </button>
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
      <p className="muted" style={{ margin: 0, fontSize: 11 }}>
        Candidates scoring below this are not shown. 50% is the default; raising it hides guesses built on weaker
        metadata.
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

    <p className="footer">
      Discovery runs entirely in this browser. Reflex sends no page content anywhere, and approvals never cross from
      one origin to another.
    </p>
  </>
);
