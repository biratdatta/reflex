import type { CapabilityCandidate, OriginState } from '@reflex/capability-model';
import { RISK_LABEL, groupByRisk, shapeOf, statusGlyph, type CandidateStatus } from './ui.js';

export const statusOf = (candidate: CapabilityCandidate, state: OriginState): CandidateStatus => {
  if (state.approvedTools.includes(candidate.id)) return 'approved';
  if (state.rejectedTools.includes(candidate.id)) return 'rejected';
  return 'undecided';
};

interface Props {
  candidates: CapabilityCandidate[];
  state: OriginState;
  activeToolIds: string[];
  onSelect: (candidate: CapabilityCandidate) => void;
}

export const CandidateList = ({ candidates, state, activeToolIds, onSelect }: Props) => (
  <>
    {groupByRisk(candidates).map(([risk, group]) => (
      <div key={risk}>
        <p className="group">
          <span className="dot" style={{ background: `var(--${risk})` }} />
          {RISK_LABEL[risk]}
          <span className="n">· {group.length}</span>
        </p>
        {group.map((candidate) => {
          const status = statusOf(candidate, state);
          const active = activeToolIds.includes(candidate.id);
          return (
            <button
              type="button"
              key={candidate.id}
              className={`row ${active ? 'active' : ''} ${status === 'rejected' ? 'rejected' : ''} ${
                candidate.suppressed ? 'held' : ''
              }`}
              onClick={() => onSelect(candidate)}
              title={candidate.description}
            >
              <span className="stripe" style={{ background: `var(--${risk})` }} />
              <span className="state" aria-hidden="true">
                {status === 'undecided' && candidate.risk === 'destructive' ? '🔒' : statusGlyph[status]}
              </span>
              <span className="body">
                <span className="nm">
                  {candidate.name}
                  {candidate.duplicateCount ? <span className="dup">×{candidate.duplicateCount}</span> : null}
                </span>
                <span className="ds">{shapeOf(candidate)}</span>
              </span>
              <span className="cf">{candidate.confidence}%</span>
            </button>
          );
        })}
      </div>
    ))}
  </>
);
