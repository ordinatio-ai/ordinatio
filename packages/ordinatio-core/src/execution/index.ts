// IHS
export type {
  ExecutionBounds,
  ExecutionStatus,
  ExecutionAction,
  ExecutionArtifact,
  TriggerType,
  ExecutionTrigger,
  ExecutionConsumption,
  ContinuationToken,
  ExecutionError,
} from './types';

export { DEFAULT_EXECUTION_BOUNDS } from './types';

// Intermittent Machine — Types (Book IV)
export type {
  AwakeningCategory,
  AwakeningPattern,
  AgentBrief,
  PlannedAction,
  AgentResult,
  AgentExecutor,
  CapabilityResolver,
  MachineConfig,
  MachinePhase,
  BudgetSnapshot,
  BudgetRemaining,
  ExceededBound,
  MachineState,
  MachineResult,
} from './machine-types';

export { AWAKENING_PATTERNS } from './machine-types';

// Intermittent Machine — Awakening Classification
export { classifyAwakening, isAwakeningRequired } from './awakening';

// Intermittent Machine — Budget Tracking
export {
  createBudgetSnapshot,
  recordLlmCall,
  recordAction,
  updateElapsed,
  checkBounds,
  getRemainingBudget,
  toConsumption,
  resolveBounds,
} from './budget';

// Intermittent Machine — Governance Evaluation
export {
  evaluateCapability,
  requiresApproval,
  findOverride,
  buildPauseContinuation,
} from './governance-eval';

// Intermittent Machine — Artifact Builder
export {
  generateExecutionId,
  phaseToStatus,
  buildExecutionArtifact,
  buildMachineResult,
} from './artifact-builder';

// Intermittent Machine — Main Engine
export {
  runMachine,
  initializeMachine,
  isTerminal,
  getMachinePhase,
  executeStep,
  failMachine,
  pauseMachine,
  resumeMachine,
} from './intermittent-machine';
