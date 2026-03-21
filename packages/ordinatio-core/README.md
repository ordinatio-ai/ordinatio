# @ordinatio/core

Shared types, covenants, construction standards, admission pipeline, council orchestrator, intermittent machine, and Pugil integration bridge for the Ordinatio architecture.

This is the foundational package that all other `@ordinatio/*` packages depend on for shared type definitions, architectural primitives, and governance infrastructure.

**559 tests. Zero runtime dependencies.**

## What's in the box

| Module | Location | Purpose |
|--------|----------|---------|
| **Covenants** | `src/covenants/` | 17 module covenants (12 Canonical + 5 Ecclesial), capability registry, covenant types |
| **Construction Standards** | `src/construction/` | Book V codified: covenant validator, Builder's Questions, boundary checker, complexity meter, pre-disputation audit, module scaffolder |
| **Admission Pipeline** | `src/admission/` | Book VI codified: 5 mechanical gates (structural, permission, conflict, governance, sandbox), pipeline orchestrator, module registry, council admission workflow |
| **Council Orchestrator** | `src/council/` | Book II codified: Scholastic Method engine, 8 Offices, artifact helpers (SHA-256), artifact validator, office briefs, stall detection, freeze/resume |
| **Intermittent Machine** | `src/execution/` | Book IV codified: wake-on-event execution, awakening classification, budget tracking, governance evaluation, pause/resume via ContinuationToken |
| **Pugil Bridge** | `src/council/pugil-bridge.ts` | Converts Vitest test results into `TrialReportContent` artifacts for Council consumption |

## Installation

```bash
npm install @ordinatio/core
```

## Pugil Integration Bridge

The Pugil bridge converts test suite results into Council-consumable `trial_report` artifacts. Used by all `@ordinatio/*` packages that implement Pugil reporters.

```typescript
import {
  buildTrialReport,
  createTrialArtifact,
  assessOverall,
  extractIssues,
} from '@ordinatio/core';
import type { PugilTestResult, PugilSuiteResult, PugilTestCategory } from '@ordinatio/core';

// Build a trial report from test results
const report = buildTrialReport(suiteResult);

// Create an artifact for Council consumption
const artifact = createTrialArtifact(report, cycleId);
```

**Test categories:** `unit`, `integration`, `chaos`, `adversarial`, `concurrency`

## Testing

```bash
pnpm --filter @ordinatio/core test:run
# 559 tests
```

## Documentation

- [Ordinatio Founding Documents](../../docs/ordinatio/README.md)
- [Construction Standards](../../docs/ordinatio/CONSTRUCTION_STANDARDS.md)
- [Admission Pipeline](../../docs/ordinatio/ADMISSION_PIPELINE.md)
- [Council Orchestrator](../../docs/ordinatio/COUNCIL_ORCHESTRATOR.md)
- [Intermittent Machine](../../docs/ordinatio/INTERMITTENT_MACHINE.md)

## Pugil Integration

This package includes a Pugil reporter that generates Council-consumable `trial_report` artifacts from test results.

```bash
# Normal test run (no Pugil overhead)
pnpm --filter @ordinatio/core test:run

# With Pugil trial report generation
PUGIL_ENABLED=true pnpm --filter @ordinatio/core test:run

# With Council cycle integration
PUGIL_ENABLED=true PUGIL_CYCLE_ID=cycle-core-v1 pnpm --filter @ordinatio/core test:run
```

- **Config:** `src/pugil.config.ts` — maps test files to categories (unit, integration, adversarial, chaos, concurrency)
- **Reporter:** `src/pugil-reporter.ts` — Vitest custom reporter, writes to `pugil-reports/`
- **Types:** `PugilTestResult`, `PugilTestCategory` from `@ordinatio/core`

## License

MIT
