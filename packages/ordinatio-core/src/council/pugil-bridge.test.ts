// IHS
import { describe, it, expect } from 'vitest';
import {
  assessOverall,
  extractIssues,
  buildTrialReport,
  createTrialArtifact,
} from './pugil-bridge';
import type { PugilTestResult, PugilSuiteResult } from './pugil-bridge';
import { verifyArtifactHash } from './artifact-helpers';
import { validateArtifactContent } from './artifact-validator';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTest(overrides: Partial<PugilTestResult> = {}): PugilTestResult {
  return {
    name: 'should work',
    file: 'lockout.test.ts',
    passed: true,
    durationMs: 12,
    ...overrides,
  };
}

function makeSuite(overrides: Partial<PugilSuiteResult> = {}): PugilSuiteResult {
  const tests = overrides.tests ?? [
    makeTest({ name: 'test-1', file: 'lockout.test.ts' }),
    makeTest({ name: 'test-2', file: 'adversarial.test.ts' }),
    makeTest({ name: 'test-3', file: 'temporal-chaos.test.ts' }),
  ];
  return {
    subject: '@ordinatio/auth',
    totalTests: tests.length,
    passed: tests.filter((t) => t.passed).length,
    failed: tests.filter((t) => !t.passed).length,
    durationMs: tests.reduce((sum, t) => sum + t.durationMs, 0),
    tests,
    categoryMap: {
      'lockout.test.ts': 'unit',
      'adversarial.test.ts': 'adversarial',
      'temporal-chaos.test.ts': 'chaos',
      'concurrency.test.ts': 'concurrency',
      'password.test.ts': 'unit',
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// assessOverall
// ---------------------------------------------------------------------------

describe('assessOverall', () => {
  it('returns passed when all tests pass', () => {
    expect(assessOverall(10, 0)).toBe('passed');
  });

  it('returns failed when any test fails', () => {
    expect(assessOverall(99, 1)).toBe('failed');
  });

  it('returns failed when all tests fail', () => {
    expect(assessOverall(0, 10)).toBe('failed');
  });

  it('returns conditional when no tests exist', () => {
    expect(assessOverall(0, 0)).toBe('conditional');
  });

  it('returns passed for 1/0', () => {
    expect(assessOverall(1, 0)).toBe('passed');
  });
});

// ---------------------------------------------------------------------------
// extractIssues
// ---------------------------------------------------------------------------

describe('extractIssues', () => {
  it('returns empty array for all-passing tests', () => {
    const tests = [makeTest(), makeTest({ name: 'another' })];
    expect(extractIssues(tests)).toEqual([]);
  });

  it('extracts failure messages', () => {
    const tests = [
      makeTest({ name: 'broken', passed: false, error: 'Expected 1, got 2' }),
    ];
    const issues = extractIssues(tests);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toBe('broken: Expected 1, got 2');
  });

  it('deduplicates identical failures', () => {
    const tests = [
      makeTest({ name: 'dup', passed: false, error: 'same error' }),
      makeTest({ name: 'dup', passed: false, error: 'same error' }),
    ];
    expect(extractIssues(tests)).toHaveLength(1);
  });

  it('keeps distinct failures from same-named tests with different errors', () => {
    const tests = [
      makeTest({ name: 'test', passed: false, error: 'error A' }),
      makeTest({ name: 'test', passed: false, error: 'error B' }),
    ];
    expect(extractIssues(tests)).toHaveLength(2);
  });

  it('truncates long error messages at 500 chars', () => {
    const longError = 'x'.repeat(600);
    const tests = [makeTest({ name: 'long', passed: false, error: longError })];
    const issues = extractIssues(tests);
    expect(issues[0]).toContain('...');
    // "long: " prefix (6) + 500 truncated + "..." (3) = 509
    expect(issues[0].length).toBe(6 + 500 + 3);
  });

  it('skips failures without error messages', () => {
    const tests = [makeTest({ name: 'silent', passed: false })];
    expect(extractIssues(tests)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// buildTrialReport
// ---------------------------------------------------------------------------

describe('buildTrialReport', () => {
  it('produces valid TrialReportContent with all-passing suite', () => {
    const suite = makeSuite();
    const report = buildTrialReport(suite);

    expect(report.type).toBe('trial_report');
    expect(report.subject).toBe('@ordinatio/auth');
    expect(report.assessment).toBe('passed');
    expect(report.issues).toEqual([]);
    expect(report.tests).toHaveLength(3);
  });

  it('maps file categories correctly', () => {
    const suite = makeSuite();
    const report = buildTrialReport(suite);

    const types = report.tests.map((t) => t.type);
    expect(types).toContain('unit');
    expect(types).toContain('adversarial');
    expect(types).toContain('chaos');
  });

  it('maps each test to the correct category from categoryMap', () => {
    const suite = makeSuite({
      tests: [
        makeTest({ name: 'unit-test', file: 'lockout.test.ts' }),
        makeTest({ name: 'chaos-test', file: 'temporal-chaos.test.ts' }),
        makeTest({ name: 'concurrency-test', file: 'concurrency.test.ts' }),
      ],
    });
    const report = buildTrialReport(suite);

    expect(report.tests[0].type).toBe('unit');
    expect(report.tests[1].type).toBe('chaos');
    expect(report.tests[2].type).toBe('concurrency');
  });

  it('defaults unmapped files to unit', () => {
    const suite = makeSuite({
      tests: [makeTest({ file: 'unknown-file.test.ts' })],
    });
    const report = buildTrialReport(suite);
    expect(report.tests[0].type).toBe('unit');
  });

  it('resolves category from filename when full path given', () => {
    const suite = makeSuite({
      tests: [makeTest({ file: 'src/adversarial.test.ts' })],
    });
    const report = buildTrialReport(suite);
    expect(report.tests[0].type).toBe('adversarial');
  });

  it('produces assessment=failed with failures', () => {
    const suite = makeSuite({
      tests: [
        makeTest({ name: 'pass', passed: true }),
        makeTest({ name: 'fail', passed: false, error: 'broken' }),
      ],
      passed: 1,
      failed: 1,
    });
    const report = buildTrialReport(suite);

    expect(report.assessment).toBe('failed');
    expect(report.issues).toHaveLength(1);
    expect(report.issues[0]).toContain('broken');
  });

  it('sets details to duration for passing tests', () => {
    const suite = makeSuite({
      tests: [makeTest({ durationMs: 42 })],
    });
    const report = buildTrialReport(suite);
    expect(report.tests[0].details).toBe('Passed in 42ms');
  });

  it('sets details to error message for failing tests', () => {
    const suite = makeSuite({
      tests: [makeTest({ passed: false, error: 'assertion failed' })],
      passed: 0,
      failed: 1,
    });
    const report = buildTrialReport(suite);
    expect(report.tests[0].details).toBe('assertion failed');
  });

  it('handles empty test array', () => {
    const suite = makeSuite({ tests: [], totalTests: 0, passed: 0, failed: 0 });
    const report = buildTrialReport(suite);

    expect(report.type).toBe('trial_report');
    expect(report.tests).toEqual([]);
    expect(report.assessment).toBe('conditional');
    expect(report.issues).toEqual([]);
  });

  it('passes validateArtifactContent validation', () => {
    const suite = makeSuite();
    const report = buildTrialReport(suite);
    const result = validateArtifactContent(report);

    expect(result.valid).toBe(true);
    expect(result.artifactType).toBe('trial_report');
    expect(result.issues).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// createTrialArtifact
// ---------------------------------------------------------------------------

describe('createTrialArtifact', () => {
  it('produces valid CouncilArtifact', () => {
    const report = buildTrialReport(makeSuite());
    const artifact = createTrialArtifact(report, 'cycle-auth-v1');

    expect(artifact.type).toBe('trial_report');
    expect(artifact.producedBy).toBe('pugil');
    expect(artifact.cycleId).toBe('cycle-auth-v1');
    expect(artifact.version).toBe(1);
    expect(artifact.status).toBe('submitted');
    expect(artifact.content).toEqual(report);
    expect(artifact.id).toContain('art-cycle-auth-v1-pugil-');
  });

  it('has valid contentHash', () => {
    const report = buildTrialReport(makeSuite());
    const artifact = createTrialArtifact(report, 'cycle-1');

    expect(artifact.contentHash).toBeTruthy();
    expect(typeof artifact.contentHash).toBe('string');
    expect(artifact.contentHash.length).toBe(64); // SHA-256 hex
  });

  it('passes verifyArtifactHash', () => {
    const report = buildTrialReport(makeSuite());
    const artifact = createTrialArtifact(report, 'cycle-1');

    expect(verifyArtifactHash(artifact)).toBe(true);
  });

  it('content passes validateArtifactContent', () => {
    const report = buildTrialReport(makeSuite());
    const artifact = createTrialArtifact(report, 'cycle-1');
    const result = validateArtifactContent(artifact.content);

    expect(result.valid).toBe(true);
  });

  it('has producedAt as Date', () => {
    const report = buildTrialReport(makeSuite());
    const artifact = createTrialArtifact(report, 'cycle-1');

    expect(artifact.producedAt).toBeInstanceOf(Date);
  });

  it('has empty references array', () => {
    const report = buildTrialReport(makeSuite());
    const artifact = createTrialArtifact(report, 'cycle-1');

    expect(artifact.references).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Full Roundtrip
// ---------------------------------------------------------------------------

describe('full roundtrip', () => {
  it('PugilSuiteResult → TrialReportContent → CouncilArtifact → valid + verified', () => {
    const suite: PugilSuiteResult = {
      subject: '@ordinatio/auth',
      totalTests: 369,
      passed: 367,
      failed: 2,
      durationMs: 4500,
      tests: [
        ...Array.from({ length: 367 }, (_, i) => makeTest({
          name: `passing-test-${i}`,
          file: i % 2 === 0 ? 'lockout.test.ts' : 'adversarial.test.ts',
        })),
        makeTest({ name: 'fail-1', file: 'concurrency.test.ts', passed: false, error: 'Race condition' }),
        makeTest({ name: 'fail-2', file: 'temporal-chaos.test.ts', passed: false, error: 'Clock drift' }),
      ],
      categoryMap: {
        'lockout.test.ts': 'unit',
        'adversarial.test.ts': 'adversarial',
        'concurrency.test.ts': 'concurrency',
        'temporal-chaos.test.ts': 'chaos',
      },
    };

    const report = buildTrialReport(suite);
    expect(report.type).toBe('trial_report');
    expect(report.assessment).toBe('failed');
    expect(report.issues).toHaveLength(2);
    expect(report.tests).toHaveLength(369);

    const artifact = createTrialArtifact(report, 'cycle-auth-hardening');
    expect(artifact.type).toBe('trial_report');
    expect(artifact.producedBy).toBe('pugil');

    // Integrity
    expect(verifyArtifactHash(artifact)).toBe(true);

    // Validation
    const validation = validateArtifactContent(artifact.content);
    expect(validation.valid).toBe(true);
    expect(validation.issues).toEqual([]);
  });

  it('all-passing suite produces clean artifact', () => {
    const suite = makeSuite();
    const report = buildTrialReport(suite);
    const artifact = createTrialArtifact(report, 'cycle-clean');

    expect(report.assessment).toBe('passed');
    expect(report.issues).toEqual([]);
    expect(verifyArtifactHash(artifact)).toBe(true);
    expect(validateArtifactContent(artifact.content).valid).toBe(true);
  });
});
