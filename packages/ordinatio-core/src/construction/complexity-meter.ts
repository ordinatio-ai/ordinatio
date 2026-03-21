// IHS
/**
 * Complexity Meter (Book V — Construction Standards)
 *
 * Measures design complexity from a ModuleCovenant to produce
 * a ComplexityReport. Used by Nitor to compute BeautyDelta —
 * the measure of simplification after a purification cycle.
 *
 * BeautyDelta = before.complexityScore − after.complexityScore
 * A positive BeautyDelta means the system became simpler.
 *
 * DEPENDS ON: covenant/types, council/types, construction/types
 * USED BY: pre-disputation-audit, council purification cycles
 */

import type { ModuleCovenant } from '../covenant/types';
import type { ComplexityMetrics } from '../council/types';
import type { ComplexityReport } from './types';
import { COMPLEXITY_THRESHOLDS } from './types';

// ---------------------------------------------------------------------------
// Weight constants for complexity scoring
// ---------------------------------------------------------------------------

const CAP_TYPE_WEIGHT: Record<string, number> = {
  query: 1,
  mutation: 2,
  action: 3,
  composite: 4,
};

/** Estimated lines per structural element */
const LINES_PER_CAPABILITY = 50;
const LINES_PER_ENTITY = 30;
const LINES_PER_DEPENDENCY = 10;
const LINES_BASELINE = 50;

/** Weights for normalized score computation */
const SCORE_WEIGHTS = {
  capabilities: 0.30,
  cyclomaticComplexity: 0.25,
  dependencies: 0.20,
  entities: 0.15,
  events: 0.10,
} as const;

/** Reference values for normalization (based on email-engine, the largest covenant) */
const REFERENCE_MAX = {
  capabilities: 20,
  cyclomaticComplexity: 40,
  dependencies: 6,
  entities: 8,
  events: 10,
} as const;

// ---------------------------------------------------------------------------
// Measurement
// ---------------------------------------------------------------------------

/**
 * Measure complexity of a module from its covenant.
 */
export function measureComplexity(covenant: ModuleCovenant): ComplexityReport {
  const measuredAt = new Date();
  const { capabilities, domain, dependencies, invariants } = covenant;

  const capabilityCount = capabilities.length;
  const entityCount = domain.entities.length;
  const eventCount = domain.events.length;
  const dependencyCount = dependencies.length;
  const invariantCount = invariants.alwaysTrue.length + invariants.neverHappens.length;

  // Estimated lines from covenant structure
  const lines = LINES_BASELINE
    + (capabilityCount * LINES_PER_CAPABILITY)
    + (entityCount * LINES_PER_ENTITY)
    + (dependencyCount * LINES_PER_DEPENDENCY);

  // Cyclomatic complexity from capability type weights
  const cyclomaticComplexity = capabilities.reduce(
    (sum, cap) => sum + (CAP_TYPE_WEIGHT[cap.type] ?? 1),
    0,
  );

  const exportedSymbols = capabilityCount + entityCount + eventCount;

  const metrics: ComplexityMetrics = {
    lines,
    cyclomaticComplexity,
    dependencies: dependencyCount,
    exportedSymbols,
  };

  // Normalized complexity score (0-100)
  const rawScores = {
    capabilities: Math.min(capabilityCount / REFERENCE_MAX.capabilities, 1),
    cyclomaticComplexity: Math.min(cyclomaticComplexity / REFERENCE_MAX.cyclomaticComplexity, 1),
    dependencies: Math.min(dependencyCount / REFERENCE_MAX.dependencies, 1),
    entities: Math.min(entityCount / REFERENCE_MAX.entities, 1),
    events: Math.min(eventCount / REFERENCE_MAX.events, 1),
  };

  const complexityScore = Math.round(
    (rawScores.capabilities * SCORE_WEIGHTS.capabilities
      + rawScores.cyclomaticComplexity * SCORE_WEIGHTS.cyclomaticComplexity
      + rawScores.dependencies * SCORE_WEIGHTS.dependencies
      + rawScores.entities * SCORE_WEIGHTS.entities
      + rawScores.events * SCORE_WEIGHTS.events)
    * 100,
  );

  let assessment: ComplexityReport['assessment'];
  if (complexityScore <= COMPLEXITY_THRESHOLDS.simple) {
    assessment = 'simple';
  } else if (complexityScore <= COMPLEXITY_THRESHOLDS.moderate) {
    assessment = 'moderate';
  } else if (complexityScore <= COMPLEXITY_THRESHOLDS.complex) {
    assessment = 'complex';
  } else {
    assessment = 'excessive';
  }

  return {
    moduleId: covenant.identity.id,
    measuredAt,
    metrics,
    capabilityCount,
    invariantCount,
    eventCount,
    entityCount,
    dependencyCount,
    complexityScore,
    assessment,
  };
}

// ---------------------------------------------------------------------------
// BeautyDelta
// ---------------------------------------------------------------------------

/**
 * Compute BeautyDelta between two complexity reports.
 * Positive = improvement (simpler). Negative = regression (more complex).
 */
export function computeBeautyDelta(before: ComplexityReport, after: ComplexityReport): number {
  return before.complexityScore - after.complexityScore;
}

/**
 * Extract ComplexityMetrics (council/types format) from a ComplexityReport.
 */
export function toComplexityMetrics(report: ComplexityReport): ComplexityMetrics {
  return report.metrics;
}
