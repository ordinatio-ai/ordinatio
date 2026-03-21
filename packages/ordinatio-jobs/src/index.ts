// ===========================================
// ORDINATIO JOBS v2.0 — Unified Execution Engine
// ===========================================
// Jobs + Automation merged. One module handles
// everything from cron jobs to reactive DAG
// workflows with intent verification.
// ===========================================

// --- Core Job Execution ---
export * from './types';
export * from './errors';
export * from './job-registry';
export * from './state-machine';
export * from './idempotency';
export * from './recovery';
export * from './worker-validation';
export * from './side-effects';
export * from './dependency-resolver';

// --- Infrastructure ---
export * from './bullmq-adapter';
export * from './health';
export * from './cron-scheduler';

// --- DAG Execution Engine ---
export * from './automation/dag-types';
export * from './automation/dag-executor';
export * from './automation/dag-builder';
export * from './automation/dag-validator';

// --- Intent Layer ---
export * from './automation/intent-layer';

// --- Planning + Posture ---
export * from './automation/plan-automation';
export * from './automation/automation-posture';

// --- Trust + Simulation + Artifacts + Blueprints ---
export * from './automation/trust-gate';
export * from './automation/memory-artifact';
export * from './automation/simulation';
export * from './automation/blueprint';

// --- Hypermedia ---
export * from './automation/hypermedia';

// --- v2.1 Refinements ---
export * from './automation/refinements';

// --- Automation Engine (absorbed from @ordinatio/automation) ---
export * from './automation/trigger-registry';
export * from './automation/condition-evaluator';
export * from './automation/action-executor';
export * from './automation/execution';
export * from './automation/crud';
export * from './automation/queries';
export * from './automation/automation-types';
export * from './automation/db-types';
export { autoError, AUTO_ERRORS, AUTO_ERRORS_CORE, AUTO_ERRORS_ACTIONS, AutomationNotFoundError, ExecutionNotFoundError } from './automation/errors';
export * from './automation/resilience/index';
export { registerAction, getActionHandler, isActionRegistered, getRegisteredActions, clearActionRegistry } from './automation/actions/registry';
export type { ActionDependencies } from './automation/actions/types';
export * from './automation/queue-client';
