import type { CapabilityCandidate, OriginState } from '@reflex/capability-model';
import { RISK_LABEL, groupByRisk, statusGlyph, type CandidateStatus } from './ui.js';

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

export const CandidateList = ({ candidates, state, activeToolIds, onSelect }: Props) => {
  if (!candidates.length) {
    return (
      <p className="empty">
        No capabilities discovered here yet. Reflex reads forms, buttons and accessibility metadata — pages built
        entirely from unlabelled elements give it nothing to work with.
      </p>
    );
  }

  return (
    <>
      {groupByRisk(candidates).map(([risk, group]) => (
        <div className="group" key={risk}>
          <p className="group-title">
            <span className={`dot ${risk}`} />
            {RISK_LABEL[risk]}
            <span className="muted">· {group.length}</span>
          </p>
          {group.map((candidate) => {
            const status = statusOf(candidate, state);
            const active = activeToolIds.includes(candidate.id);
            return (
              <button
                type="button"
                key={candidate.id}
                className={`candidate ${active ? 'active' : ''} ${status === 'rejected' ? 'rejected' : ''}`}
                onClick={() => onSelect(candidate)}
                title={candidate.description}
              >
                <span className="state" aria-hidden="true">
                  {/* The lock marks a destructive capability awaiting a decision;
                      once decided, the decision itself is the more useful signal. */}
                  {status === 'undecided' && candidate.risk === 'destructive' ? '🔒' : statusGlyph[status]}
                </span>
                <span className="body">
                  <span className="title">{candidate.title}</span>
                  <span className="tool">{candidate.name}</span>
                </span>
                <span className="conf">{candidate.confidence}%</span>
              </button>
            );
          })}
        </div>
      ))}
    </>
  );
};
