// IHS
/**
 * Pugil Vitest Reporter
 *
 * Custom Vitest reporter that converts test results into Pugil trial_report
 * artifacts for Council consumption. Only activates when PUGIL_ENABLED=true.
 *
 * Usage:
 *   PUGIL_ENABLED=true pnpm --filter @ordinatio/security test:run
 *   PUGIL_ENABLED=true PUGIL_CYCLE_ID=cycle-security-v1 pnpm --filter @ordinatio/security test:run
 *
 * Output:
 *   pugil-reports/{timestamp}-trial-report.json
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { Reporter, TestModule, TestCase } from 'vitest/reporters';
import {
  buildTrialReport,
  createTrialArtifact,
} from '@ordinatio/core';
import type { PugilTestResult } from '@ordinatio/core';
import { PUGIL_CATEGORY_MAP, PUGIL_SUBJECT } from './pugil.config';

const REPORT_DIR = 'pugil-reports';

/**
 * Collect all test cases from a TestModule (recursively through suites).
 */
function collectTests(testModule: TestModule): PugilTestResult[] {
  const results: PugilTestResult[] = [];
  const filename = testModule.moduleId.split('/').pop() ?? testModule.moduleId;

  for (const testCase of testModule.children.allTests()) {
    const tc = testCase as TestCase;
    const result = tc.result();
    if (result.state === 'pending' || result.state === 'skipped') continue;

    const diag = tc.diagnostic();
    const passed = result.state === 'passed';

    let error: string | undefined;
    if (!passed && result.state === 'failed' && result.errors?.length) {
      error = result.errors.map((e) => e.message).join('; ');
    }

    results.push({
      name: tc.fullName,
      file: filename,
      passed,
      durationMs: diag?.duration ?? 0,
      ...(error ? { error } : {}),
    });
  }

  return results;
}

export default class PugilReporter implements Reporter {
  onTestRunEnd(testModules: ReadonlyArray<TestModule>) {
    if (process.env.PUGIL_ENABLED !== 'true') return;

    const allTests: PugilTestResult[] = [];

    for (const mod of testModules) {
      const tests = collectTests(mod);
      allTests.push(...tests);
    }

    const passed = allTests.filter((t) => t.passed).length;
    const failed = allTests.filter((t) => !t.passed).length;
    const totalDuration = allTests.reduce((sum, t) => sum + t.durationMs, 0);

    const report = buildTrialReport({
      subject: PUGIL_SUBJECT,
      totalTests: allTests.length,
      passed,
      failed,
      durationMs: totalDuration,
      tests: allTests,
      categoryMap: PUGIL_CATEGORY_MAP,
    });

    const cycleId = process.env.PUGIL_CYCLE_ID
      ?? `standalone-${Date.now()}`;

    const artifact = createTrialArtifact(report, cycleId);

    // Write artifact to pugil-reports/
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outDir = join(process.cwd(), REPORT_DIR);
    mkdirSync(outDir, { recursive: true });
    const outPath = join(outDir, `${timestamp}-trial-report.json`);
    writeFileSync(outPath, JSON.stringify(artifact, null, 2));

    // Console summary
    const assessment = report.assessment;
    console.log(
      `\n[Pugil] Trial report: ${assessment} — ${passed}/${allTests.length} tests passed`,
    );
    console.log(`[Pugil] Artifact written to ${outPath}`);
  }
}
