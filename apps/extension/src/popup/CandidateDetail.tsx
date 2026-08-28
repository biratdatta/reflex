import { useState } from 'react';
import type { CandidateOverride, CapabilityCandidate, RiskLevel } from '@reflex/capability-model';
import { RISK_LABEL, RISK_NOTE, RISK_ORDER, confidenceLabel } from './ui.js';
import type { CandidateStatus } from './ui.js';

interface Props {
  candidate: CapabilityCandidate;
  status: CandidateStatus;
  active: boolean;
  busy: boolean;
  error?: string;
  onBack: () => void;
  onApprove: (override: CandidateOverride) => void;
  onReject: () => void;
  onReset: () => void;
  onHighlight: () => void;
}

const evidenceLabel: Record<string, string> = {
  'aria-label': 'ARIA label',
  'aria-labelledby': 'ARIA labelledby',
  'aria-description': 'ARIA description',
  'aria-describedby': 'ARIA describedby',
  label: 'Field label',
  'button-text': 'Button text',
  form: 'Form',
  input: 'Field',
  heading: 'Heading',
  role: 'Role',
};

export const CandidateDetail = ({
  candidate,
  status,
  active,
  busy,
  error,
  onBack,
  onApprove,
  onReject,
  onReset,
  onHighlight,
}: Props) => {
  const [name, setName] = useState(candidate.name);
  const [description, setDescription] = useState(candidate.description);
  const [risk, setRisk] = useState<RiskLevel>(candidate.risk);

  const edited = name !== candidate.name || description !== candidate.description || risk !== candidate.risk;
  const parameters = Object.entries(candidate.inputSchema.properties);
  const required = candidate.inputSchema.required ?? [];

  return (
    <>
      <div className="topbar">
        <button type="button" className="icon" onClick={onBack} title="Back to the list">
          ←
        </button>
        <span className="brand">REFLEX</span>
        <span className="spacer" />
        <button type="button" className="icon" onClick={onHighlight} title="Flash this element in the page">
          show on page
        </button>
      </div>

      <div className="section">
        <div className="detail-title">
          <span className="stripe" style={{ background: `var(--${risk})`, width: 3, alignSelf: 'stretch' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1>{candidate.title}</h1>
            <span className="toolname">{candidate.name}</span>
          </div>
        </div>
        <div className="detail-meta">
          <span className={`badge ${risk}`}>{RISK_LABEL[risk]}</span>
          <span className="dim">
            {candidate.confidence}% · {confidenceLabel(candidate.confidence)}
          </span>
          {candidate.duplicateCount ? (
            <span className="dim">· {candidate.duplicateCount} identical controls</span>
          ) : null}
          {active && <span className="badge read">✓ active</span>}
        </div>
        <p className="note" style={{ marginTop: 10 }}>
          {RISK_NOTE[risk]}
        </p>
        {candidate.confidenceReasons?.length ? (
          <div className="reasons" title="What this page failed to declare">
            {candidate.confidenceReasons.map((reason) => (
              <span key={reason}>{reason}</span>
            ))}
          </div>
        ) : null}
        {candidate.suppressed ? (
          <p className="note held" style={{ marginTop: 10 }}>
            Held back by triage: {candidate.suppressedReason}. You can still enable it.
          </p>
        ) : null}
        {candidate.duplicateCount ? (
          <p className="note warn" style={{ marginTop: 10 }}>
            This page has {candidate.duplicateCount} controls with the same name and shape, and gives no way to
            tell them apart. Enabling this registers the first one — use “show on page” to check which.
          </p>
        ) : null}
      </div>

      <div className="section">
        <h2>Generated tool</h2>
        <p className="dim" style={{ margin: '0 0 9px', fontSize: 10.5 }}>
          Inferred from the page. Correct anything that reads wrong before enabling it.
        </p>
        <label className="field">
          Tool name
          <input value={name} onChange={(event) => setName(event.target.value)} spellCheck={false} />
        </label>
        <label className="field">
          Description
          <textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} />
        </label>
        <label className="field">
          Risk
          <select value={risk} onChange={(event) => setRisk(event.target.value as RiskLevel)}>
            {RISK_ORDER.map((level) => (
              <option key={level} value={level}>
                {RISK_LABEL[level]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="section">
        <h2>Parameters</h2>
        {parameters.length === 0 ? (
          <p className="empty">No arguments — this capability is a single action.</p>
        ) : (
          <dl className="kv">
            {parameters.map(([key, property]) => (
              <div key={key} style={{ display: 'contents' }}>
                <dt>
                  <code>{key}</code>
                </dt>
                <dd>
                  {property.type}
                  {property.format ? ` · ${property.format}` : ''}
                  {required.includes(key) ? ' · required' : ''}
                  {property.enum ? <div className="dim">one of: {property.enum.join(', ')}</div> : null}
                  {property.description ? <div className="dim">{property.description}</div> : null}
                </dd>
              </div>
            ))}
          </dl>
        )}
        <pre className="schema">{JSON.stringify(candidate.inputSchema, null, 2)}</pre>
      </div>

      <div className="section">
        <h2>Evidence</h2>
        <ul className="evidence">
          {candidate.evidence.map((item, index) => (
            <li key={`${item.type}-${index}`}>
              <span className="type">{evidenceLabel[item.type] ?? item.type}</span>
              <div className="val">
                {item.value}
                {item.origin ? <span className="origin"> · {item.origin}</span> : null}
              </div>
            </li>
          ))}
        </ul>
        <dl className="kv">
          <dt>Selector</dt>
          <dd>
            <code>{candidate.elementSelector}</code>
          </dd>
          <dt>Source</dt>
          <dd>{candidate.source}</dd>
          {candidate.resultSelector ? (
            <>
              <dt>Returns</dt>
              <dd>
                text of <code>{candidate.resultSelector}</code>
              </dd>
            </>
          ) : null}
        </dl>
      </div>

      <div className="section">
        {error ? <p className="note bad">{error}</p> : null}
        {risk === 'destructive' ? (
          <p className="note warn">
            🔒 Destructive. Reflex asks you again, in the page, each time an agent calls this.
          </p>
        ) : null}
      </div>

      <div className="actions">
          <button type="button" className="bad" disabled={busy} onClick={onReject}>
            reject
          </button>
          {status === 'approved' && !edited ? (
            <button type="button" className="neutral" disabled={busy} onClick={onReset}>
              disable tool
            </button>
          ) : (
            <button
              type="button"
              disabled={busy || !name.trim()}
              onClick={() => onApprove({ name: name.trim(), description: description.trim(), risk })}
            >
              {status === 'approved' ? 'update tool' : 'enable tool'}
            </button>
          )}
      </div>
    </>
  );
};
