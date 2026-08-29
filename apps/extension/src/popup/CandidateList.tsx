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

/**
 * One row markup for all five panel designs.
 *
 * Each design leads with something different — Instrument with the tool name,
 * Civic with a plain-language sentence, Native with the human title — so every
 * part is rendered and the stylesheet decides which parts that theme shows.
 * Keeping it to one component means the triage and approval logic cannot drift
 * between designs.
 */
export const CandidateList = ({ candidates, state, activeToolIds, onSelect }: Props) => (
  <>
    {groupByRisk(candidates).map(([risk, group]) => (
      <div key={risk}>
        <p className="group">
          <span className="dot" style={{ background: `var(--${risk})` }} />
          <span className={`tag ${risk}`}>{RISK_LABEL[risk]}</span>
          <span className="glabel">{RISK_LABEL[risk]}</span>
          <span className="n">· {group.length}</span>
        </p>
        <div className="rows">
        {group.map((candidate) => {
          const status = statusOf(candidate, state);
          const active = activeToolIds.includes(candidate.id);
          const locked = status === 'undecided' && candidate.risk === 'destructive';
          return (
            <button
              type="button"
              key={candidate.id}
              className={`row ${active ? 'active' : ''} ${status === 'rejected' ? 'rejected' : ''} ${
                candidate.suppressed ? 'held' : ''
              } ${candidate.risk === 'destructive' ? 'destructive' : ''}`}
              onClick={() => onSelect(candidate)}
              title={candidate.description}
            >
              <span className="stripe" style={{ background: `var(--${risk})` }} />
              <span className="state" aria-hidden="true">
                {locked ? '🔒' : statusGlyph[status]}
              </span>
              <span className={`tick ${status}`} aria-hidden="true" />
              <span className="body">
                <span className="title">
                  {candidate.title}
                  {locked ? ' 🔒' : ''}
                  {candidate.duplicateCount ? <span className="dup">×{candidate.duplicateCount}</span> : null}
                </span>
                <span className="nm">
                  {candidate.name}
                  {candidate.duplicateCount ? <span className="dup">×{candidate.duplicateCount}</span> : null}
                </span>
                <span className="ds">{shapeOf(candidate)}</span>
                <span className="desc">
                  {candidate.description} {candidate.confidence}% confident.
                </span>
              </span>
              <span className="cf">{candidate.confidence}%</span>
            </button>
          );
        })}
        </div>
      </div>
    ))}
  </>
);
