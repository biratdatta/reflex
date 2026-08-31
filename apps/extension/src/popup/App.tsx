import { useCallback, useEffect, useMemo, useState } from 'react';
import { emptyOriginState, isAutoApprovable } from '@reflex/capability-model';
import type { OriginState, PageSnapshot } from '@reflex/capability-model';
import { activeTab, ensureInjected, isScannableUrl, sendToTab, type ExtensionMessage } from '../shared/messaging.js';
import { getSettings, setSettings } from '../shared/storage.js';
import { disablePersistence, enablePersistence, isPersistent } from '../shared/persistence.js';
import { DEFAULT_SETTINGS, type PanelTheme, type PanelMode, type ReflexSettings } from '../shared/types.js';
import { CandidateList, statusOf } from './CandidateList.js';
import { CandidateDetail } from './CandidateDetail.js';
import { Settings } from './Settings.js';
import { matchesFilter, percent, relativeTime } from './ui.js';

type View = { screen: 'list' } | { screen: 'detail'; candidateId: string } | { screen: 'settings' };

/**
 * Explain an empty list in one sentence. A bare "no capabilities" leaves the
 * reviewer wondering whether Reflex failed or the page simply has nothing.
 */
/** Civic leads with a sentence rather than a number. */
const readinessSentence = (score: number): string => {
  if (score >= 85) return 'Most of this page can be used by an agent.';
  if (score >= 60) return 'Some of this page can be used by an agent.';
  if (score >= 35) return 'Little of this page can be used by an agent.';
  return 'An agent can do almost nothing with this page.';
};

const emptyMessage = (
  counts: PageSnapshot['counts'] | undefined,
  filter: string,
  formQuality: number | undefined,
): string => {
  if (filter.trim()) return `Nothing matches “${filter.trim()}”.`;
  if (!counts || counts.total === 0) {
    return 'No capabilities discovered. Reflex reads forms, buttons and accessibility metadata — a page built entirely from unlabelled elements gives it nothing to work with.';
  }

  const reasons: string[] = [];
  if (counts.hiddenUnnameable > 0) reasons.push(`${counts.hiddenUnnameable} were labelled with counts`);
  if (counts.hiddenWeak > 0) reasons.push(`${counts.hiddenWeak} scored too low to trust`);
  if (counts.hiddenDuplicate > 0) reasons.push(`${counts.hiddenDuplicate} were indistinguishable duplicates`);
  if (formQuality === 0) reasons.push('and this page has no forms Reflex can read');

  const because = reasons.length ? ` — ${reasons.join(', ')}` : '';
  return `Nothing here is worth reviewing. ${counts.total} candidates were found and all were held back${because}.`;
};

export const App = () => {
  const [tabId, setTabId] = useState<number | null>(null);
  const [snapshot, setSnapshot] = useState<PageSnapshot | null>(null);
  const [state, setState] = useState<OriginState>(emptyOriginState());
  const [settings, setLocalSettings] = useState<ReflexSettings>(DEFAULT_SETTINGS);
  const [view, setView] = useState<View>({ screen: 'list' });
  const [filter, setFilter] = useState('');
  const [showHeld, setShowHeld] = useState(false);
  const [statusTab, setStatusTab] = useState<'all' | 'approved' | 'rejected'>('all');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [persistent, setPersistent] = useState(false);
  const [persistenceBusy, setPersistenceBusy] = useState(false);

  const dispatch = useCallback(
    async (message: ExtensionMessage, options: { quiet?: boolean } = {}) => {
      if (tabId === null) return;
      if (!options.quiet) setBusy(true);
      const response = await sendToTab(tabId, message);
      if (response.ok) {
        if (response.snapshot) setSnapshot(response.snapshot);
        if (response.state) setState(response.state);
        setError(undefined);
      } else {
        setError(response.error);
      }
      setBusy(false);
      return response;
    },
    [tabId],
  );

  /** The stylesheet keys every look off these two attributes. */
  const applyTheme = (theme: PanelTheme, mode: PanelMode) => {
    document.documentElement.dataset.panel = theme;
    // 'system' stamps nothing, leaving prefers-color-scheme to decide.
    if (mode === 'system') delete document.documentElement.dataset.mode;
    else document.documentElement.dataset.mode = mode;
  };

  useEffect(() => {
    void (async () => {
      const loaded = await getSettings();
      setLocalSettings(loaded);
      applyTheme(loaded.panelTheme, loaded.panelMode);

      // Opening the popup as a tab (?tabId=…) points it at another tab. Useful
      // when developing the UI, and how the e2e tests drive it.
      const override = Number(new URLSearchParams(window.location.search).get('tabId'));
      const tab = Number.isFinite(override) && override > 0 ? await chrome.tabs.get(override) : await activeTab();
      if (!tab?.id) {
        setError('No active tab.');
        setBusy(false);
        return;
      }
      if (!isScannableUrl(tab.url)) {
        setError('Reflex can only read ordinary web pages, not browser or extension pages.');
        setBusy(false);
        return;
      }

      const injected = await ensureInjected(tab.id);
      if (!injected.ok) {
        setError(`Could not attach to this page: ${injected.error}`);
        setBusy(false);
        return;
      }
      setTabId(tab.id);
    })();
  }, []);

  useEffect(() => {
    if (tabId === null) return;
    // RESCAN rather than REQUEST_SNAPSHOT: the page may have changed since the
    // content script last looked, and a stale list is worse than a slow one.
    void dispatch({ type: 'RESCAN' });
  }, [tabId, dispatch]);

  // Whether this site re-attaches on its own; asked once the origin is known.
  useEffect(() => {
    const origin = snapshot?.origin;
    if (!origin) return;
    void isPersistent(origin).then(setPersistent);
  }, [snapshot?.origin]);

  const togglePersistent = async (next: boolean) => {
    const origin = snapshot?.origin;
    if (!origin) return;
    setPersistenceBusy(true);
    try {
      if (next) {
        const granted = await enablePersistence(origin);
        setPersistent(granted);
        if (!granted) setError('Chrome declined the permission, so Reflex will keep attaching only when you open it.');
        else setError(undefined);
      } else {
        await disablePersistence(origin);
        setPersistent(false);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
    setPersistenceBusy(false);
  };

  const shown = snapshot?.candidates ?? [];
  const held = snapshot?.suppressed ?? [];
  const counts = snapshot?.counts;

  /** What the list renders: the triaged set, plus held-back rows on request. */
  const listed = useMemo(() => {
    const pool = showHeld ? [...shown, ...held] : shown;
    return pool
      .filter((candidate) => matchesFilter(candidate, filter))
      .filter((candidate) => {
        if (statusTab === 'approved') return state.approvedTools.includes(candidate.id);
        if (statusTab === 'rejected') return state.rejectedTools.includes(candidate.id);
        return true;
      });
  }, [shown, held, showHeld, filter, statusTab, state]);

  const selected = useMemo(
    () =>
      view.screen === 'detail'
        ? [...shown, ...held].find((entry) => entry.id === view.candidateId)
        : undefined,
    [view, shown, held],
  );

  const safeCount = shown.filter(
    (candidate) => isAutoApprovable(candidate.risk) && !state.approvedTools.includes(candidate.id),
  ).length;

  const updateSettings = async (patch: Partial<ReflexSettings>) => {
    const next = await setSettings(patch);
    setLocalSettings(next);
    applyTheme(next.panelTheme, next.panelMode);
    // Only a discovery-affecting change needs a rescan; a repaint does not.
    if (patch.panelTheme === undefined && patch.panelMode === undefined) {
      await dispatch({ type: 'RESCAN' }, { quiet: true });
    }
  };

  if (view.screen === 'settings') {
    return (
      <Settings
        settings={settings}
        origin={snapshot?.origin ?? '—'}
        enabled={state.enabled}
        persistent={persistent}
        persistenceBusy={persistenceBusy}
        onSetPersistent={(next) => void togglePersistent(next)}
        onChange={(patch) => void updateSettings(patch)}
        onSetEnabled={(enabled) => void dispatch({ type: 'SET_ORIGIN_ENABLED', enabled })}
        onDisableAll={() => void dispatch({ type: 'DISABLE_ALL_TOOLS' })}
        onBack={() => setView({ screen: 'list' })}
      />
    );
  }

  if (view.screen === 'detail' && selected) {
    return (
      <CandidateDetail
        candidate={selected}
        status={statusOf(selected, state)}
        active={(snapshot?.activeToolIds ?? []).includes(selected.id)}
        busy={busy}
        error={error}
        onBack={() => setView({ screen: 'list' })}
        onApprove={(override) =>
          void dispatch({ type: 'APPROVE_CANDIDATE', candidateId: selected.id, override })
        }
        onReject={() => {
          void dispatch({ type: 'REJECT_CANDIDATE', candidateId: selected.id });
          setView({ screen: 'list' });
        }}
        onReset={() => void dispatch({ type: 'RESET_CANDIDATE', candidateId: selected.id })}
        onHighlight={() =>
          void dispatch({ type: 'HIGHLIGHT_CANDIDATE', candidateId: selected.id }, { quiet: true })
        }
      />
    );
  }

  const readiness = snapshot?.readiness;
  const activeCount = snapshot?.activeToolIds.length ?? 0;
  const hiddenTotal = counts ? counts.hiddenWeak + counts.hiddenDuplicate + counts.hiddenUnnameable : 0;

  return (
    <>
      <div className="topbar">
        <span className="brand">REFLEX</span>
        <span className="brand-sub">
          {activeCount > 0 ? `${activeCount} active` : (snapshot?.origin ?? '').replace(/^https?:\/\//, '')}
        </span>
        <span className="spacer" />
        <button
          type="button"
          className="icon"
          title="Rescan this page"
          disabled={busy || tabId === null}
          onClick={() => void dispatch({ type: 'RESCAN' })}
        >
          ⟳
        </button>
        <button type="button" className="icon" title="Settings" onClick={() => setView({ screen: 'settings' })}>
          ⚙
        </button>
      </div>

      {error ? (
        <div className="section">
          <p className="note bad">{error}</p>
        </div>
      ) : null}

      <div className="tabs">
        {(
          [
            ['all', 'Capabilities'],
            ['approved', `Active (${state.approvedTools.length})`],
            ['rejected', 'Rejected'],
          ] as Array<['all' | 'approved' | 'rejected', string]>
        ).map(([id, label]) => (
          <button
            type="button"
            key={id}
            className={statusTab === id ? 'sel' : ''}
            onClick={() => setStatusTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {readiness ? (
        <div className="section">
          <h2>Agent readiness</h2>
          <div className="readiness">
            <span className="ring" aria-hidden="true">
              <svg viewBox="0 0 54 54" width="54" height="54">
                <circle className="ring-track" cx="27" cy="27" r="23" fill="none" strokeWidth="6" />
                <circle
                  className="ring-fill"
                  cx="27"
                  cy="27"
                  r="23"
                  fill="none"
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 23}
                  strokeDashoffset={2 * Math.PI * 23 * (1 - readiness.score / 100)}
                />
              </svg>
              <b>{readiness.score}%</b>
            </span>
            <span className="score">{readiness.score}%</span>
            <span className="label">
              {readiness.counts.interactiveControls} controls
              {snapshot?.scannedAt ? ` · ${relativeTime(snapshot.scannedAt)}` : ''}
            </span>
            <span className="say">{readinessSentence(readiness.score)}</span>
          </div>
          <div className="meter">
            <span style={{ width: `${readiness.score}%` }} />
          </div>
          <div className="breakdown">
            {(
              [
                ['semantic controls', readiness.breakdown.semanticControls],
                ['accessible names', readiness.breakdown.ariaCoverage],
                ['form quality', readiness.breakdown.formQuality],
                ['capability confidence', readiness.breakdown.capabilityConfidence],
              ] as Array<[string, number]>
            ).map(([label, value]) => (
              <div className={`metric ${value === 0 ? 'weak' : ''}`} key={label}>
                <span>{label}</span>
                <span className="mini" aria-hidden="true">
                  <span style={{ width: `${Math.max(value * 100, value > 0 ? 2 : 0)}%` }} />
                </span>
                <b>{percent(value)}</b>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {snapshot?.webmcpFlavor === 'reflex-shim' ? (
        <div className="section">
          <p className="note">
            No WebMCP host in this browser, so Reflex registered a local one. Approved tools are real and
            callable — through Reflex rather than through the browser.
          </p>
        </div>
      ) : null}

      {snapshot?.lastInvocation ? (
        <div className="section">
          <p className="note">
            {snapshot.lastInvocation.success ? '✓' : '✕'} {snapshot.lastInvocation.toolName} called{' '}
            {relativeTime(snapshot.lastInvocation.at)}
          </p>
        </div>
      ) : null}

      {counts && counts.total > 0 ? (
        <>
          <div className="triage">
            <input
              type="text"
              value={filter}
              placeholder={
                counts.shown > 0
                  ? `Filter ${counts.shown} capabilit${counts.shown === 1 ? 'y' : 'ies'}…`
                  : 'Filter held-back candidates…'
              }
              onChange={(event) => setFilter(event.target.value)}
            />
            <button
              type="button"
              className={`chip ${showHeld ? 'on' : ''}`}
              title="Include the candidates triage held back"
              onClick={() => setShowHeld((value) => !value)}
            >
              {showHeld ? 'All' : 'Strong'}
            </button>
          </div>

          <p className="tally">
            <b>{listed.length}</b> shown of <b>{counts.total}</b> found
            {hiddenTotal > 0 && !showHeld ? (
              <button type="button" onClick={() => setShowHeld(true)}>
                Show {hiddenTotal} held back
              </button>
            ) : null}
          </p>
        </>
      ) : null}

      <div className="section">
        <h2>Capabilities</h2>
        {listed.length === 0 ? (
          <p className="empty">{emptyMessage(counts, filter, readiness?.breakdown.formQuality)}</p>
        ) : (
          <CandidateList
            candidates={listed}
            state={state}
            activeToolIds={snapshot?.activeToolIds ?? []}
            onSelect={(candidate) => setView({ screen: 'detail', candidateId: candidate.id })}
          />
        )}
      </div>

      {shown.length > 0 ? (
        <>
          <div className="actions">
            <button
              type="button"
              disabled={busy || safeCount === 0}
              onClick={() => void dispatch({ type: 'APPROVE_SAFE_TOOLS' })}
            >
              {safeCount > 0 ? `Enable ${safeCount} read-only` : 'Read-only enabled'}
            </button>
            <button
              type="button"
              className="neutral slim"
              disabled={busy || activeCount === 0}
              title="Withdraw every registered tool on this site"
              onClick={() => void dispatch({ type: 'DISABLE_ALL_TOOLS' })}
            >
              Withdraw all
            </button>
          </div>
          <p className="foot">
            Write, sensitive and destructive capabilities are never enabled in bulk — open one to read its
            evidence and enable it deliberately.
          </p>
        </>
      ) : null}
    </>
  );
};
