export interface ScenarioStep {
  keyword: 'GIVEN' | 'WHEN' | 'THEN' | 'AND';
  text: string;
}

export interface Scenario {
  name: string;
  steps: ScenarioStep[];
}

export interface Requirement {
  id: string;
  title: string;
  body: string;
  block: string;
  scenarios: Scenario[];
  decisionRefs: string[];
  start: number;
  end: number;
  line: number;
}

export interface Section {
  heading: string;
  content: string;
  start: number;
  end: number;
  line: number;
}

export interface Capability {
  name: string;
  prefix: string | null;
  retired: string[];
  purpose: string | null;
  sections: Section[];
  requirements: Requirement[];
  hasRequirementsHeading: boolean;
}

export interface Removal {
  id: string;
  reason: string | null;
  migration: string | null;
  line: number;
}

export interface Delta {
  capability: string;
  prefix: string | null;
  purpose: string | null;
  added: Requirement[];
  modified: Requirement[];
  removed: Removal[];
  addedSections: Section[];
  modifiedSections: Section[];
}
