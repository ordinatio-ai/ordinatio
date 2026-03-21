// ===========================================
// OPERATIONAL INTUITION — Barrel Export
// ===========================================

export * from './types';
export { learnSequences } from './sequence-learner';
export { detectMissingBeats, prioritizeMissingBeats } from './missing-beats';
export { projectGhosts } from './ghosts';
export type { GhostProjection } from './ghosts';
export { calculateEntropy, detectBotStorm, ENTROPY_BOT_THRESHOLD, ENTROPY_HEALTHY_THRESHOLD } from './entropy';
export { suggestResolutions } from './resolution';
export type { ResolutionSuggestion } from './resolution';
export { learnCadence, detectCadenceBreaks, overallCadenceStatus } from './cadence';
export { inferIntents } from './intent-inference';
export {
  computePulse,
  summarizeForAgent,
  pulseNeedsAttention,
  getMissingBeatsByEntity,
} from './pulse';
