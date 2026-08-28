import { useCallback, useEffect, useMemo, useState } from 'react';
import { emptyOriginState, isAutoApprovable } from '@reflex/capability-model';
import type { CandidateOverride, CapabilityCandidate, OriginState, PageSnapshot } from '@reflex/capability-model';
import { activeTab, ensureInjected, isScannableUrl, sendToTab, type ExtensionMessage } from '../shared/messaging.js';
import { getSettings, setSettings } from '../shared/storage.js';
import { DEFAULT_SETTINGS, type ReflexSettings } from '../shared/types.js';
import { CandidateList, statusOf } from './CandidateList.js';
import { CandidateDetail } from './CandidateDetail.js';
import { Settings } from './Settings.js';
import { percent, relativeTime } from './ui.js';

type View = { screen: 'list' } | { screen: 'detail'; candidateId: string } | { screen: 'settings' };

export const App = () => {
  const [tabId, setTabId] = useState<number | null>(null);
  const [snapshot, setSnapshot] = useState<PageSnapshot | null>(null);
  const [state, setState] = useState<OriginState>(emptyOriginState());
  const [settings, setLocalSettings] = useState<ReflexSettings>(DEFAULT_SETTINGS);
  const [view, setView] = useState<View>({ screen: 'list' });
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | undefined>();

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

  useEffect(() => {
    void (async () => {
      setLocalSettings(await getSettings());

      // Opening the popup as a normal tab (?tabId=…) points it at another tab.
      // Useful when developing the UI, and how the e2e tests drive it.
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
    void dispatch({ type: 'REQUEST_SNAPSHOT' });
  }, [tabId, dispatch]);

  const candidates = snapshot?.candidates ?? [];
  const selected = useMemo(
    () => (view.screen === 'detail' ? candidates.find((entry) => entry.id === view.candidateId) : undefined),
    [view, candidates],
  );

  const safeCount = candidates.filter(
    (candidate) => isAutoApprovable(candidate.risk) && !state.approvedTools.includes(candidate.id),
  ).length;

  const updateSettings = async (patch: Partial<ReflexSettings>) => {
    const next = await setSettings(patch);
    setLocalSettings(next);
    // The content script watches storage and rescans; ask for the result.
    await dispatch({ type: 'RESCAN' }, { quiet: true });
  };

  const approve = async (candidate: CapabilityCandidate, override: CandidateOverride) => {
    await dispatch({ type: 'APPROVE_CANDIDATE', candidateId: candidate.id, override });
  };

  if (view.screen === 'settings') {
    return (
      <Settings
        settings={settings}
        origin={snapshot?.origin ?? '—'}
        enabled={state.enabled}
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
        onApprove={(override) => void approve(selected, override)}
        onReject={() => {
          void dispatch({ type: 'REJECT_CANDIDATE', candidateId: selected.id });
          setView({ screen: 'list' });
        }}
        onReset={() => void dispatch({ type: 'RESET_CANDIDATE', candidateId: selected.id })}
        onHighlight={() => void dispatch({ type: 'HIGHLIGHT_CANDIDATE', candidateId: selected.id }, { quiet: true })}
      />
    );
  }

  const readiness = snapshot?.readiness;
  const activeCount = snapshot?.activeToolIds.length ?? 0;

  return (
    <>
      <div className="topbar">
        <span className="brand">REFLEX</span>
        <span className="brand-sub">{activeCount > 0 ? `${activeCount} active` : 'no tools active'}</span>
        <span className="spacer" />
        <button
          type="button"
          className="ghost icon"
          title="Rescan this page"
          disabled={busy || tabId === null}
          onClick={() => void dispatch({ type: 'RESCAN' })}
        >
          ↻
        </button>
        <button type="button" className="ghost icon" title="Settings" onClick={() => setView({ screen: 'settings' })}>
          ⚙
        </button>
      </div>

      {error ? (
        <div className="section">
          <p className="notice error">{error}</p>
        </div>
      ) : null}

      {readiness ? (
        <div className="section">
          <h2>Agent readiness</h2>
          <div className="readiness">
            <span className="score">{readiness.score}%</span>
            <span className="label">
              {readiness.counts.candidates} capabilit{readiness.counts.candidates === 1 ? 'y' : 'ies'} discovered
              {snapshot?.scannedAt ? ` · scanned ${relativeTime(snapshot.scannedAt)}` : ''}
            </span>
          </div>
          <div className="meter">
            <span style={{ width: `${readiness.score}%` }} />
          </div>
          <div className="breakdown">
            <div>
              <span>Semantic controls</span>
              <b>{percent(readiness.breakdown.semanticControls)}</b>
            </div>
            <div>
              <span>Accessible names</span>
              <b>{percent(readiness.breakdown.ariaCoverage)}</b>
            </div>
            <div>
              <span>Form quality</span>
              <b>{percent(readiness.breakdown.formQuality)}</b>
            </div>
            <div>
              <span>Capability confidence</span>
              <b>{percent(readiness.breakdown.capabilityConfidence)}</b>
            </div>
          </div>
        </div>
      ) : null}

      {snapshot && !snapshot.webmcpAvailable ? (
        <div className="section">
          <p className="notice warn">
            No WebMCP host on this page. Turn on “provide a local host” in settings to register tools anyway.
          </p>
        </div>
      ) : null}

      {snapshot?.webmcpFlavor === 'reflex-shim' ? (
        <div className="section">
          <p className="notice info">
            This browser exposes no WebMCP host, so Reflex registered a local one. Approved tools are real and callable
            — through Reflex rather than through the browser.
          </p>
        </div>
      ) : null}

      {snapshot?.lastInvocation ? (
        <div className="section">
          <p className="notice info">
            {snapshot.lastInvocation.success ? '✓' : '✕'} <code>{snapshot.lastInvocation.toolName}</code> called{' '}
            {relativeTime(snapshot.lastInvocation.at)}
          </p>
        </div>
      ) : null}

      <div className="section">
        <h2>Discovered capabilities</h2>
        <CandidateList
          candidates={candidates}
          state={state}
          activeToolIds={snapshot?.activeToolIds ?? []}
          onSelect={(candidate) => setView({ screen: 'detail', candidateId: candidate.id })}
        />
      </div>

      {candidates.length > 0 ? (
        <div className="section">
          <div className="actions">
            <button
              type="button"
              className="primary"
              disabled={busy || safeCount === 0}
              onClick={() => void dispatch({ type: 'APPROVE_SAFE_TOOLS' })}
            >
              {safeCount > 0 ? `Enable ${safeCount} read-only tool${safeCount === 1 ? '' : 's'}` : 'Read-only tools enabled'}
            </button>
            <button
              type="button"
              disabled={busy || activeCount === 0}
              onClick={() => void dispatch({ type: 'DISABLE_ALL_TOOLS' })}
            >
              Withdraw all
            </button>
          </div>
          <p className="footer" style={{ padding: '10px 0 0' }}>
            Write, sensitive and destructive capabilities are never enabled in bulk — open one to review its evidence
            and enable it deliberately.
          </p>
        </div>
      ) : null}
    </>
  );
};
