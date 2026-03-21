// IHS

// Council Types (Book II)
export type {
  OfficeId,
  Office,
  ArtifactType,
  ArtifactStatus,
  CouncilArtifact,
  ArtifactContent,
  PropositioContent,
  ObjectionesContent,
  VerdictContent,
  TrialReportContent,
  PurificationRecordContent,
  ComplexityMetrics,
  CanonRecordContent,
  PublicationContent,
  CycleOrchestrationContent,
  CycleStatus,
  CouncilCycle,
} from './types';

export { OFFICES } from './types';

// Orchestrator Types (Phase 4)
export type {
  ScholasticPhase,
  OfficeBrief,
  OfficeResult,
  OfficeExecutor,
  CycleType,
  CycleConfig,
  PhaseStatus,
  PhaseRecord,
  OrchestratorState,
  CycleOutcome,
  CycleResult,
} from './orchestrator-types';

export {
  SCHOLASTIC_PHASE_SEQUENCE,
  PHASE_TO_OFFICE,
  FULL_OFFICE_SEQUENCE,
  CYCLE_DEFAULTS,
} from './orchestrator-types';

// Artifact Helpers (Phase 4)
export {
  computeContentHash,
  verifyArtifactHash,
  createArtifact,
  supersede,
} from './artifact-helpers';

// Artifact Validator (Phase 4)
export type {
  ArtifactValidationIssue,
  ArtifactValidationResult,
} from './artifact-validator';

export {
  validateArtifactContent,
  hasValidType,
  getExpectedArtifactType,
} from './artifact-validator';

// Office Briefs (Phase 4)
export {
  OFFICE_INSTRUCTIONS,
  getOfficeForPhase,
  getPhaseSequence,
  buildOfficeBrief,
} from './office-briefs';

// Council Orchestrator (Phase 4)
export {
  runCycle,
  initializeState,
  executePhase,
  detectStall,
  freezeState,
  resumeWithAxiom,
  getCurrentOrchestratorPhase,
  isFinished,
  buildResult,
} from './council-orchestrator';

// Pugil Integration Bridge
export type {
  PugilTestResult,
  PugilSuiteResult,
  PugilTestCategory,
} from './pugil-bridge';

export {
  buildTrialReport,
  createTrialArtifact,
  assessOverall,
  extractIssues,
} from './pugil-bridge';
