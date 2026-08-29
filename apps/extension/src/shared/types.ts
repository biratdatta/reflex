export type {
  CandidateDecision,
  CandidateOverride,
  CapabilityCandidate,
  ElementFingerprint,
  Evidence,
  ExecutionResult,
  JSONSchema,
  JSONSchemaProperty,
  OriginState,
  PageSnapshot,
  ReadinessScore,
  RiskLevel,
} from '@reflex/capability-model';

/**
 * The panel's visual language. Five directions were mocked up and reviewed; all
 * five ship, because which one is right depends on who is doing the reviewing.
 */
export type PanelTheme = 'instrument' | 'quiet' | 'native' | 'civic' | 'ledger';

export const PANEL_THEMES: Array<{ id: PanelTheme; name: string; stance: string }> = [
  { id: 'instrument', name: 'Instrument', stance: 'A telemetry readout. Densest, monospace, built for scanning.' },
  { id: 'quiet', name: 'Quiet Product', stance: 'Restrained modern software. Calm spacing, one muted accent.' },
  { id: 'native', name: 'Native Chrome', stance: "The browser's own surfaces. Light, system type, tabs." },
  {
    id: 'civic',
    name: 'Civic',
    stance: 'Public-service software. Plain words lead, heavy type, solid tags. Light and dark.',
  },
  { id: 'ledger', name: 'Ledger', stance: 'An audit sheet. Brass on warm black, display numerals.' },
];

/**
 * Light or dark, or whatever the operating system says. Only the Civic design
 * offers both: the others are committed looks, and inverting them would make
 * them something else.
 */
export type PanelMode = 'system' | 'light' | 'dark';

export interface ReflexSettings {
  /** Which of the five panel designs to render. */
  panelTheme: PanelTheme;
  /** Light or dark, for the designs that offer both. */
  panelMode: PanelMode;
  /** Candidates below this score are not shown at all. */
  confidenceThreshold: number;
  /** Ask for confirmation in the page before a destructive tool actuates. */
  confirmDestructive: boolean;
  /** Rescan automatically when the page mutates. */
  autoRescan: boolean;
  /** Show the in-page tool console (stands in for a WebMCP client during a demo). */
  showAgentConsole: boolean;
  /** Install a local WebMCP host when the browser has none. */
  allowShim: boolean;
}

export const DEFAULT_SETTINGS: ReflexSettings = {
  panelTheme: 'civic',
  panelMode: 'system',
  confidenceThreshold: 50,
  confirmDestructive: true,
  autoRescan: true,
  showAgentConsole: true,
  allowShim: true,
};
