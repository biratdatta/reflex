export interface ReadinessBreakdown {
  /** Share of interactive controls that use semantic elements rather than div/span. */
  semanticControls: number;
  /** Share of interactive controls carrying an accessible name. */
  ariaCoverage: number;
  /** Share of form fields with a resolvable label and a name attribute. */
  formQuality: number;
  /** Mean confidence of surviving candidates. */
  capabilityConfidence: number;
  /** Share of candidates whose risk could be classified from keywords. */
  safetyClassification: number;
}

export interface ReadinessScore {
  /** 0–100. A product signal, not an industry standard. */
  score: number;
  breakdown: ReadinessBreakdown;
  counts: {
    interactiveControls: number;
    semanticControls: number;
    namedControls: number;
    formFields: number;
    labelledFormFields: number;
    candidates: number;
  };
}

export const READINESS_WEIGHTS: Record<keyof ReadinessBreakdown, number> = {
  semanticControls: 0.25,
  ariaCoverage: 0.25,
  formQuality: 0.2,
  capabilityConfidence: 0.2,
  safetyClassification: 0.1,
};
