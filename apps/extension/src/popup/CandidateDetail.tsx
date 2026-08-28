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
        <button type="button" className="ghost icon" onClick={onBack} title="Back to the list">
          ←
        </button>
        <span className="brand">REFLEX</span>
        <span className="spacer" />
        <button type="button" className="ghost" onClick={onHighlight} title="Flash this element in the page">
          Show on page
        </button>
      </div>

      <div className="section">
        <div className="detail-head">
          <div style={{ flex: 1 }}>
            <h1>{candidate.title}</h1>
            <code className="muted">{candidate.name}</code>
          </div>
        </div>
        <div className="detail-meta">
          <span className={`badge ${risk}`}>{RISK_LABEL[risk]}</span>
          <span className="muted">
            {candidate.confidence}% · {confidenceLabel(candidate.confidence)}
          </span>
          {active && <span className="badge read">✓ tool active</span>}
        </div>
        <p className="notice info" style={{ marginTop: 10 }}>
          {RISK_NOTE[risk]}
        </p>
      </div>

      <div className="section">
        <h2>Generated tool</h2>
        <p className="muted" style={{ margin: '0 0 8px' }}>
          Reflex inferred this from the page. Correct anything that reads wrong before you enable it.
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
                  {property.enum ? (
                    <div className="muted">one of: {property.enum.join(', ')}</div>
                  ) : null}
                  {property.description ? <div className="muted">{property.description}</div> : null}
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
              <div>
                {item.value}
                {item.origin ? <span className="muted"> · {item.origin}</span> : null}
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
        {error ? <p className="notice error">{error}</p> : null}
        {risk === 'destructive' ? (
          <p className="notice warn">
            🔒 Destructive. Reflex will ask you again, in the page, each time an agent calls this tool.
          </p>
        ) : null}
        <div className="actions">
          <button type="button" className="danger" disabled={busy} onClick={onReject}>
            Reject
          </button>
          {status === 'approved' && !edited ? (
            <button type="button" disabled={busy} onClick={onReset}>
              Disable tool
            </button>
          ) : (
            <button
              type="button"
              className="primary"
              disabled={busy || !name.trim()}
              onClick={() => onApprove({ name: name.trim(), description: description.trim(), risk })}
            >
              {status === 'approved' ? 'Update tool' : 'Enable tool'}
            </button>
          )}
        </div>
      </div>
    </>
  );
};
