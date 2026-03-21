// IHS
/**
 * Pugil Integration Bridge
 *
 * Pure functions that convert Vitest test results into TrialReportContent
 * artifacts for Council consumption. Lives in ordinatio-core because it
 * produces TrialReportContent (a core type). Zero Vitest dependency —
 * the reporter in @ordinatio/auth calls these functions with plain data.
 *
 * Data flow:
 *   Vitest results → PugilSuiteResult → buildTrialReport() → TrialReportContent
 *   TrialReportContent → createTrialArtifact() → CouncilArtifact (JSON file)
 *
 * DEPENDS ON: council/types (TrialReportContent, CouncilArtifact)
 * DEPENDS ON: council/artifact-helpers (createArtifact)
 */

import type { TrialReportContent, CouncilArtifact } from './types';
import { createArtifact } from './artifact-helpers';

// ---------------------------------------------------------------------------
// Types (Vitest-agnostic)
// ---------------------------------------------------------------------------

/** Category of test for Pugil classification */
export type PugilTestCategory = 'unit' | 'integration' | 'chaos' | 'adversarial' | 'concurrency';

/** A single test result */
export interface PugilTestResult {
  /** Test name (e.g. "should reject weak passwords") */
  readonly name: string;
  /** Source file path (relative, e.g. "lockout.test.ts") */
  readonly file: string;
  /** Whether the test passed */
  readonly passed: boolean;
  /** Duration in milliseconds */
  readonly durationMs: number;
  /** Failure message (only present on failure) */
  readonly error?: string;
}

/** Aggregated suite results from a full test run */
export interface PugilSuiteResult {
  /** Package or module name (e.g. "@ordinatio/auth") */
  readonly subject: string;
  /** Total number of tests */
  readonly totalTests: number;
  /** Number of passing tests */
  readonly passed: number;
  /** Number of failing tests */
  readonly failed: number;
  /** Total duration in milliseconds */
  readonly durationMs: number;
  /** Individual test results */
  readonly tests: readonly PugilTestResult[];
  /** Maps file name → Pugil test category */
  readonly categoryMap: Record<string, PugilTestCategory>;
}

// ---------------------------------------------------------------------------
// Assessment Logic
// ---------------------------------------------------------------------------

const MAX_ISSUE_LENGTH = 500;

/**
 * Determine overall assessment from pass/fail counts.
 * - All pass → 'passed'
 * - Any fail → 'failed'
 * - Zero tests → 'conditional' (nothing to assess)
 */
export function assessOverall(passed: number, failed: number): 'passed' | 'failed' | 'conditional' {
  if (passed + failed === 0) return 'conditional';
  if (failed > 0) return 'failed';
  return 'passed';
}

/**
 * Extract unique failure messages from test results.
 * Truncates long messages and deduplicates.
 */
export function extractIssues(tests: readonly PugilTestResult[]): string[] {
  const seen = new Set<string>();
  const issues: string[] = [];

  for (const test of tests) {
    if (!test.passed && test.error) {
      const truncated = test.error.length > MAX_ISSUE_LENGTH
        ? test.error.slice(0, MAX_ISSUE_LENGTH) + '...'
        : test.error;

      const key = `${test.name}: ${truncated}`;
      if (!seen.has(key)) {
        seen.add(key);
        issues.push(key);
      }
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Trial Report Builder
// ---------------------------------------------------------------------------

/**
 * Resolve the category for a test file.
 * Strips path prefixes to match against the category map.
 */
function resolveCategory(
  filePath: string,
  categoryMap: Record<string, PugilTestCategory>,
): PugilTestCategory {
  // Try exact match first
  if (categoryMap[filePath]) return categoryMap[filePath];

  // Try matching just the filename (strip directory path)
  const filename = filePath.split('/').pop() ?? filePath;
  if (categoryMap[filename]) return categoryMap[filename];

  // Default to 'unit'
  return 'unit';
}

/**
 * Convert a PugilSuiteResult into a TrialReportContent.
 * Maps each test to its category, computes assessment, extracts issues.
 */
export function buildTrialReport(suite: PugilSuiteResult): TrialReportContent {
  const tests = suite.tests.map((t) => ({
    name: t.name,
    type: resolveCategory(t.file, suite.categoryMap),
    passed: t.passed,
    details: t.passed
      ? `Passed in ${t.durationMs}ms`
      : (t.error ?? 'Failed (no error message)'),
  }));

  return {
    type: 'trial_report' as const,
    subject: suite.subject,
    tests,
    assessment: assessOverall(suite.passed, suite.failed),
    issues: extractIssues(suite.tests),
  };
}

// ---------------------------------------------------------------------------
// Artifact Creation
// ---------------------------------------------------------------------------

/**
 * Wrap a TrialReportContent in a CouncilArtifact.
 * Sets producedBy: 'pugil', type: 'trial_report'.
 */
export function createTrialArtifact(
  report: TrialReportContent,
  cycleId: string,
): CouncilArtifact {
  return createArtifact({
    cycleId,
    producedBy: 'pugil',
    type: 'trial_report',
    content: report,
  });
}
