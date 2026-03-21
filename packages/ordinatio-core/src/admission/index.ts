// IHS
/**
 * Module Admission Pipeline (Book VI)
 *
 * Five mechanical gates every module must pass before activation.
 * The pipeline consumes Phase 2 construction tools and produces
 * structured admission decisions.
 *
 * Book VI §XII: "Covenant enforcement must be machine-readable.
 * Validation must be automatic."
 */

export * from './types';
export * from './structural-gate';
export * from './permission-gate';
export * from './conflict-gate';
export * from './governance-gate';
export * from './sandbox-gate';
export * from './admission-pipeline';
export * from './module-registry';
export * from './council-admission';
