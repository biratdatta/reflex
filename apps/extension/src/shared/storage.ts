import { emptyOriginState, type CandidateOverride, type OriginState } from '@reflex/capability-model';
import { DEFAULT_SETTINGS, type ReflexSettings } from './types.js';

const ORIGIN_KEY = 'reflex.origins';
const SETTINGS_KEY = 'reflex.settings';

type OriginMap = Record<string, OriginState>;

const readAll = async (): Promise<OriginMap> => {
  const stored = await chrome.storage.local.get(ORIGIN_KEY);
  return (stored[ORIGIN_KEY] as OriginMap | undefined) ?? {};
};

/**
 * Approvals are scoped by origin, always. A tool approved on one site must
 * never come back to life on another.
 */
export const getOriginState = async (origin: string): Promise<OriginState> => {
  const all = await readAll();
  return { ...emptyOriginState(), ...(all[origin] ?? {}) };
};

export const setOriginState = async (origin: string, state: OriginState): Promise<void> => {
  const all = await readAll();
  all[origin] = state;
  await chrome.storage.local.set({ [ORIGIN_KEY]: all });
};

export const updateOriginState = async (
  origin: string,
  update: (state: OriginState) => OriginState,
): Promise<OriginState> => {
  const next = update(await getOriginState(origin));
  await setOriginState(origin, next);
  return next;
};

export const approveCandidate = (
  state: OriginState,
  candidateId: string,
  override?: CandidateOverride,
): OriginState => ({
  ...state,
  approvedTools: state.approvedTools.includes(candidateId)
    ? state.approvedTools
    : [...state.approvedTools, candidateId],
  rejectedTools: state.rejectedTools.filter((id) => id !== candidateId),
  overrides: override ? { ...state.overrides, [candidateId]: override } : state.overrides,
});

export const rejectCandidate = (state: OriginState, candidateId: string): OriginState => ({
  ...state,
  approvedTools: state.approvedTools.filter((id) => id !== candidateId),
  rejectedTools: state.rejectedTools.includes(candidateId)
    ? state.rejectedTools
    : [...state.rejectedTools, candidateId],
});

export const resetCandidate = (state: OriginState, candidateId: string): OriginState => {
  const overrides = { ...state.overrides };
  delete overrides[candidateId];
  return {
    ...state,
    approvedTools: state.approvedTools.filter((id) => id !== candidateId),
    rejectedTools: state.rejectedTools.filter((id) => id !== candidateId),
    overrides,
  };
};

export const getSettings = async (): Promise<ReflexSettings> => {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...((stored[SETTINGS_KEY] as Partial<ReflexSettings> | undefined) ?? {}) };
};

export const setSettings = async (settings: Partial<ReflexSettings>): Promise<ReflexSettings> => {
  const next = { ...(await getSettings()), ...settings };
  await chrome.storage.local.set({ [SETTINGS_KEY]: next });
  return next;
};

export const clearOrigin = async (origin: string): Promise<void> => {
  const all = await readAll();
  delete all[origin];
  await chrome.storage.local.set({ [ORIGIN_KEY]: all });
};
