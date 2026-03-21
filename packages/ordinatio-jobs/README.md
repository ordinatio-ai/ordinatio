# @ordinatio/jobs v2.0

Unified execution engine for agents and enterprises. Handles everything from a simple cron job to a complex reactive DAG workflow with intent verification, simulation, trust-aware execution, and machine-readable recovery.

Not a background job system. Not an automation tool. A **deterministic execution layer** where every job and automation declares what it's trying to achieve, proves it succeeded, and tells agents exactly what to do when it fails.

---

## What This Module Does

Two systems, one engine:

**Jobs** — "Run this thing reliably." The caller decides what to do. The engine provides: type registry with full contracts (intent, safety, side effects), cron scheduling, queue posture, state machine, idempotency, recovery classification, policy gates, and worker validation.

**Automations** — "When this happens, decide what to do and do it." The system decides based on triggers, conditions, and action graphs. The engine provides: event-driven triggering, 14-comparator condition evaluation, DAG execution (branching, parallel, wait states, approvals), intent verification, simulation, trust gating, memory artifacts, and reusable blueprints.

A job is an automation with one trigger (manual) and no conditions. An automation is a job that decides its own execution path. Same foundation, different entry points.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        @ordinatio/jobs v2.0                             │
│                     Unified Execution Engine                            │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  LAYER 1: DECISION (when + whether)                             │   │
│  │  Trigger registry · Condition evaluator · Intent matching        │   │
│  │  planAutomation() preflight · Semantic idempotency              │   │
│  └──────────────────────────────┬──────────────────────────────────┘   │
│                                 │                                       │
│  ┌──────────────────────────────▼──────────────────────────────────┐   │
│  │  LAYER 2: ORCHESTRATION (what + how)                            │   │
│  │  DAG executor (branch, parallel, wait, approval, retry, fallback)│  │
│  │  Blueprints · Simulation · Trust gate · Memory artifacts         │   │
│  └──────────────────────────────┬──────────────────────────────────┘   │
│                                 │                                       │
│  ┌──────────────────────────────▼──────────────────────────────────┐   │
│  │  LAYER 3: EXECUTION (run + recover)                             │   │
│  │  State machine · Idempotency · Recovery · Side effects           │   │
│  │  Queue posture · Cron scheduler · Circuit breaker · Rate limiter │   │
│  │  Dead letter · Worker validation · Policy gate                   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Core Capabilities

### Job System (Layer 3)
- **Job Type Registry** — register types with full contracts (intent, definition of done, side effects, safety flags, risk level, replay policy)
- **State Machine** — 8 canonical statuses (pending → running → completed/failed/dead_letter/quarantined), valid transition enforcement
- **Idempotency** — in-memory store with TTL, replay policies (allow/deny/merge)
- **Recovery** — failure classification → RecoveryPlan on every error (retry/modify_payload/request_human/abort/wait)
- **Policy Gate** — pluggable evaluator (allow/deny/escalate with trust tiers)
- **Worker Validation** — enforce structured results, error classification, side effect bounds
- **Cron Scheduler** — named crons with health tracking (healthy/degraded/failing)
- **Queue Posture** — load level, stuck detection, failure trends, recommendations

### Automation System (Layers 1-2)
- **Trigger Registry** — 20+ event types, config filtering, idempotency, rate limiting
- **Condition Evaluator** — AND/OR groups, 14 comparators, template variables, table lookups
- **DAG Executor** — 8 node types (action, condition, parallel_fork, parallel_join, wait, approval, transform, terminal), 10 edge types, continuation tokens for pause/resume
- **Intent Layer** — every automation declares intent, definition of done, acceptable paths, failure boundary, human escalation policy
- **planAutomation()** — preflight analysis: side effects, risk, approvals, conditions, recovery strategy
- **Automation Posture** — 7 health states, plain-language summaries, recommendations, hypermedia
- **Trust Gate** — risk-level-to-trust-tier mapping, blocks high-risk actions at insufficient trust
- **Simulation Mode** — "what would this have done over 30 days?" with projections, risk, confidence
- **Blueprints** — reusable templates with variable resolution
- **Memory Artifacts** — compact execution summaries for agent reasoning
- **Hypermedia** — `_state`, `_actions`, `_constraints`, `_recovery` on every response

### Resilience (9 subsystems)
- Idempotency (time-window + semantic)
- Retry with exponential backoff
- Circuit breaker (per-automation)
- Timeout enforcement (5 min default)
- Dead letter queue
- Rate limiting (per-automation)
- Monitoring (pluggable event hooks)
- Graceful shutdown (drain in-flight)
- State store (optional Redis backing)

---

## DAG Execution Engine

The heart of v2. Replaces sequential action chains with directed acyclic graphs.

### 8 Node Types

| Node | Purpose |
|------|---------|
| `action` | Execute an automation action (CREATE_CONTACT, SEND_EMAIL, etc.) |
| `condition` | Branch based on evaluation — if/else with any comparator |
| `parallel_fork` | Split into parallel branches |
| `parallel_join` | Wait for branches to converge (all / any / n-of-m) |
| `wait` | Pause until external event or condition met (with timeout) |
| `approval` | Human approval checkpoint (with auto-approve timeout) |
| `transform` | Map/filter data between actions |
| `terminal` | Explicit end node (success or failure) |

### 10 Edge Types

| Edge | When It's Followed |
|------|-------------------|
| `default` / `on_success` | Node succeeded — normal flow |
| `on_failure` | Node failed — error handling path |
| `on_timeout` | Wait/approval timed out |
| `on_condition_true` / `on_condition_false` | Condition branching |
| `on_approval` / `on_denial` | Approval result |
| `retry` | Retry the source node with backoff |
| `fallback` | Alternative path when primary fails |

### DAG Builder (Fluent API)

```typescript
const dag = dagBuilder('check-sender')
  .condition('check-sender', 'isExistingClient', 'EQUALS', 'true')
  .edge('check-sender', 'link-email', 'on_condition_true')
  .edge('check-sender', 'create-contact', 'on_condition_false')
  .action('link-email', 'LINK_EMAIL_TO_CLIENT')
  .action('create-contact', 'CREATE_CONTACT', { email: '{{from}}' })
  .edge('link-email', 'add-tag', 'default')
  .edge('create-contact', 'add-tag', 'default')
  .action('add-tag', 'ADD_TAG_TO_CONTACT', { tagName: 'Lead' })
  .action('create-task', 'CREATE_TASK', { title: 'Follow up: {{subject}}' })
  .terminal('done', 'success')
  .build();
```

### Backward Compatibility

Old sequential action chains are auto-converted to linear DAGs via `legacyToDAG()`. Zero migration required.

---

## Error Codes

**127 total** across two namespaces:

| Namespace | Range | Count | Category |
|-----------|-------|-------|----------|
| `JOBS_` | 100-152 | 20 | Queue ops, connection, cron, registry, worker, recovery |
| `AUTO_` | 100-507 | 107 | CRUD, triggers, testing, health, actions, resilience |

Both use the **enhanced v2 builder** — full diagnostic objects with runtime context:

```typescript
jobsError('JOBS_110', { host: 'localhost', port: 6379 })
// → { code, ref, timestamp, module: 'JOBS', description, severity, recoverable, diagnosis[], context }

autoError('AUTO_500', { automationId: 'auto-123', failureRate: 0.6 })
// → { code, ref, timestamp, module: 'AUTOMATION', description, severity, recoverable, diagnosis[], context }
```

---

## Test Suite: 475 Tests Across 27 Files

### Layer 3: Core Job Execution (192 tests)

| File | Tests | What It Proves |
|------|-------|----------------|
| **state-machine.test.ts** | 39 | Valid/invalid transitions for all 8 statuses. `pending → completed` blocked (must run first). `quarantined` never auto-transitions. `completed` is terminal with zero outgoing edges. Self-transitions blocked. Every non-terminal can reach quarantined. Auto-retry blocking for quarantined + completed. |
| **job-registry.test.ts** | 23 | Registration with full v1.1 agentic contract. Duplicate rejection (JOBS_130). Incomplete contract rejection (JOBS_132 — missing intent, empty DoD, no spec, no safety flags). Empty/whitespace type names rejected. `planJob()` returns valid plans, catches validation errors, includes dependencies, runs policy evaluation with trust tiers. Deregistration and cleanup. |
| **cron-scheduler.test.ts** | 24 | Cron parsing, duplicate rejection (JOBS_120), enable/disable, manual trigger, concurrent trigger blocking (second returns false while first runs). Scheduler start/stop. Callbacks on fire/failure. Posture tracking: healthy → degraded (1 failure) → failing (3+ failures). Last success tracking. Hypermedia actions (trigger/enable/disable) based on state. |
| **recovery.test.ts** | 23 | Connection errors → retry. Timeout → retry. 503 → retry. Rate limit → wait. Auth (401/403) → request_human. Validation → modify_payload. Not found → modify_payload. Conflict → abort. Unknown → abort + human required. `safeToRetry=false` overrides retry to request_human. Retry delay from job definition. Error code extraction from messages. Non-Error values and null/undefined handled. Every plan has all required fields. `isValidRecoveryPlan()` rejects nulls, empty objects, invalid nextAction, empty reasonCode. |
| **idempotency.test.ts** | 17 | Store: starts empty, records with TTL, expires after window, manual remove, clear, cleanup on access, stores results. `checkIdempotency()`: first execution allowed + recorded, empty key always allowed. Deny policy: blocks within window, allows after expiry, allows different keys. Allow policy: always allows. Merge policy: returns previous result. Short/long dedupe windows. |
| **policy-truth-table.test.ts** | 21 | Full decision matrix: risk (low/medium/high/critical) × trust (0/1/2) → allow/deny/escalate. Org isolation (cross-org → deny). Irreversible + no approval → escalate. Irreversible + approval → allow. Reversible → allow. Missing trust tier defaults to 0. No evaluator → no policy result. Policy deny does not prevent plan generation. |
| **health.test.ts** | 19 | Stuck job counting (threshold-based). Stuck job filtering. `queueNeedsAttention()`: disconnected, failed > 0, stuck > 0, quarantined > 0, waiting > threshold. Posture summary: disconnected state, load level, basic counts, stuck/quarantined/dead letter/delayed in summary, recommended action. |
| **dependency-resolver.test.ts** | 21 | No dependencies → valid. Satisfied deps → valid. Missing deps detected. Self-reference cycle. A→B→A cycle. Transitive A→B→C→A cycle. Diamond (acyclic) accepted. Missing + circular reported together. Dependency satisfaction checking (all/some/none completed). Unsatisfied dependency listing. Full graph cycle detection. |
| **errors.test.ts** | 11 | Timestamped ref generation. Context inclusion/exclusion. Full v2 diagnostic object returned (timestamp, module, description, severity, recoverable, diagnosis, context). Unknown code handled gracefully. All 20 JOBS_ codes have required fields. Unique codes. Quarantine (JOBS_152) is non-recoverable + critical. |
| **worker-validation.test.ts** | 10 | Valid success accepted. Valid failure with recovery accepted. Missing recovery on failure rejected. Missing errorClassification rejected. Side effects exceeding declared rejected. Side effects within declared accepted. Quarantine without humanInterventionRequired rejected. Structurally invalid recovery plan rejected. Multiple violations accumulated. |
| **side-effects.test.ts** | 11 | Actual subset of declared passes. External calls matched. Empty actual passes. Undeclared writes detected. Undeclared external calls detected. Multiple undeclared reported. Mixed writes + external calls work. Irreversible partial failure detection (irreversible + failed + side effects occurred). Reversible not flagged. No side effects not flagged. Success not flagged. |
| **bullmq-adapter.test.ts** | 6 | Redis connection building: host/port/password, empty password omitted, undefined password omitted, custom maxRetriesPerRequest, default null, db number. |

### Layer 3: Advanced Job Suites (65 tests)

| File | Tests | What It Proves |
|------|-------|----------------|
| **adversarial.test.ts** | 23 | Enormous payloads (100KB strings, 10K arrays). 50-level nesting. 7 malicious strings (XSS, SQL injection, null bytes, template injection, process.exit, \_\_proto\_\_, constructor.prototype). Numeric extremes (Infinity, NaN, MAX_SAFE_INTEGER+1, negative zero). Prototype pollution (\_\_proto\_\_ doesn't corrupt registry). Unexpected types (null, undefined, array, string, number as payload). Empty/whitespace type name rejection. |
| **concurrency.test.ts** | 7 | Simultaneous job registration: exactly one succeeds, others get JOBS_130. Different types register concurrently. Simultaneous cron registration: one succeeds. Cron trigger blocks while running. Idempotency under concurrency: deny policy allows first only, allow policy allows all, different keys never interfere. |
| **chaos.test.ts** | 12 | Policy evaluator that throws. Cron handler crash: scheduler continues, other crons still fire, consecutiveFailures increments, nextRun still scheduled. Validator that throws: planJob returns invalid. Validator returning undefined: still valid. Callback that throws: bus isolates (cron fires/fails callbacks never propagate). Empty error message classified. Non-Error object classified. Undefined error classified. Multi-pattern match: first pattern wins. Registry consistent after failed registration. Cron consistent after crash (resets on success). |
| **hypermedia.test.ts** | 11 | JobPlan: execute action for valid, fix_payload for invalid, request_approval for approval-required, no request_approval for auto-approved, no execute for unknown type. CronPosture: trigger when not running, disable when enabled, enable when disabled. All actions have intent fields. QueuePosture: summary contains name and load level. |

### Layer 2: DAG Execution (39 tests)

| File | Tests | What It Proves |
|------|-------|----------------|
| **dag-validator.test.ts** | 20 | Valid linear DAG accepted. Empty DAG rejected. Missing entry node. Duplicate node IDs. Self-loops. Edges to nonexistent nodes. A→B→A cycle detected. Diamond graph (acyclic) accepted. Orphan node warning. Condition with no true branch → error. Condition with both branches → valid. Wait with no timeout → error. Approval with no approval path → error. Join with no strategy → error. n_of_m with no n → error. Action with no actionType → error. Stats: node/edge/action/terminal counts, parallel/wait/approval flags, max depth. Legacy-to-DAG: empty → terminal, sequential → linear DAG, continueOnError preserved. |
| **dag-executor.test.ts** | 19 | Single action execution. Action ordering (STEP_1 → STEP_2 → STEP_3). Data context passing (output from action A visible to action B via \_lastOutput). Legacy DAG execution. **Failure handling:** stops on failure when continueOnError=false, continues when true. Follows on_failure edge. Retries node when retry edge + maxRetries. **Branching:** follows true branch, follows false branch, nested dot-notation field access. **Wait/approval:** pauses at wait node with continuation token, pauses at approval node. **Transform:** maps data between actions. **Terminal:** success terminal → completed, failure terminal → failed. **Logging:** entries recorded per node. **Parallel:** fork/join executes both branches then continues. **Complex scenario:** lead capture (check sender → branch → create or link → tag → task). |

### Layer 1: Automation Intelligence (119 tests)

| File | Tests | What It Proves |
|------|-------|----------------|
| **intent-layer.test.ts** | 32 | **Validation:** accepts complete intent, rejects empty description, empty DoD, missing DoD check description, empty acceptable paths, missing failure boundary, zero maxConsecutiveFailures, missing escalation policy, no escalation triggers. **DoD evaluation:** all checks pass → satisfied, one fails → not satisfied with reason, record_exists via callback, record_exists fails without callback, count_check via callback, custom check via callback, nested field access, empty checks → vacuously true. **Failure boundary:** under limits → not breached, consecutive failures → breached, windowed failures → breached, fatal pattern → immediate breach + isFatal, non-matching error → not breached. **Escalation:** high risk, repeated failure (2+), single failure (no), intent unsatisfied, intent satisfied (no), no conditions met (no), approval timeout, unknown state, trust insufficient. |
| **automation-posture.test.ts** | 31 | **Health:** healthy (no issues), paused (not active), circuit_open, rate_limited, backlogged (queue > 50), failing (5+ consecutive), degraded (2-4 consecutive), degraded (dead letter > 0). **Recommendations:** investigate when failing, review dead letter when degraded, scale when backlogged, no recommendation when healthy. **Summary:** includes name + health, 24h stats, consecutive failures, dead letter count, unsatisfied intent warning, zero executions. **Stats:** average duration, zero total → zero avg. **Hypermedia:** pause when active, reactivate when paused, retry_dead_letter when DLQ > 0, inspect_failures when failing, always includes test + simulate. **Constraints:** lists active constraints, empty when healthy. **Recovery:** includes recovery plan when failing, none when healthy. **Utilities:** summarize returns summary string, needsAttention true when not healthy. |
| **plan-automation.test.ts** | 18 | Valid plan for DAG + intent. Invalid for bad DAG. Invalid for bad intent. Side effects: CREATE/UPDATE → writes, SEND_EMAIL/CALL_WEBHOOK → external calls + irreversible. Risk: low for safe, medium for email, high for delete, critical via node override. Approval detection from approval nodes. No approval when no approval nodes. Condition dry-run: pass and fail with trace. Recovery strategy: detects failure/fallback/retry edges + maxRetries. Policy evaluation: runs evaluator, deny reflected in result. Hypermedia: execute + simulate for valid, fix for invalid. |
| **trust-gate.test.ts** | 15 | Low risk allowed at tier 0. High risk blocked at tier 0, allowed at tier 1. Critical blocked at tier 1, allowed at tier 2. Critical always requires approval. Approval nodes require approval. Risk inferred from action type (DELETE → high, SEND_EMAIL → medium). Custom trust policy. Hypermedia: escalate + request_approval when blocked, execute when allowed. Denial reason provided. `getMaxRiskLevel()` returns highest across all nodes. |
| **simulation.test.ts** | 17 | Counts fires for matching events. Filters by trigger type. Limits events analyzed. Zero for no matches. Condition evaluation (passes, filters). Deduplication (same entity + same hour). Affected entity tracking (counts repeats). Default simulator projects all success. Custom simulator with failure reasons. Risk: low for small volume, medium/high for large volume, flags irreversible at scale. Confidence: higher with more data, 0-1 range. Daily breakdown grouped by date. |
| **memory-artifact.test.ts** | 8 | Successful execution: intentSatisfied, no failures, changes tracked, summary contains name + "successfully". Failed execution: intentSatisfied false, failure messages, summary contains "failed". DoD results: passed/failed checks listed. Waiting execution: summary contains "paused", next steps mention "awaiting". Unsatisfied completion: next steps mention "definition of done". Trigger reason preserved. `summarizeArtifact()`: compact string with changes, failures, next steps. |
| **blueprint.test.ts** | 18 | **Registry:** register + retrieve, undefined for unknown, list all, filter by category, clear. **Validation:** passes when all provided, passes with defaults, fails when required missing, fails for invalid email, invalid number, invalid select option. **Instantiation:** resolves template variables in DAG configs, uses defaults when not provided, preserves non-template values, preserves intent unchanged, resolves condition templates, resolves trigger config templates. |

### Integration (8 tests)

| File | Tests | What It Proves |
|------|-------|----------------|
| **hypermedia-automation.test.ts** | 8 | **Execution:** completed → view_artifact + rerun, failed + retry recommended → retry, failed + human needed → escalate + constraint, waiting → resume + cancel + paused-at constraint, recovery plan included. **Automation:** active → pause/test/simulate/plan/history/posture/edit, paused → reactivate/delete + constraint. **Dead letter:** retry + discard + inspect + human required. |

### Smoke (11 tests)

| File | Tests | What It Proves |
|------|-------|----------------|
| **automation-smoke.test.ts** | 11 | Trigger registry exports. Condition evaluator exports. Action executor exports. Action registry exports. Automation CRUD exports. Error builder returns v2 object (code, ref, timestamp, module, description, severity, recoverable, diagnosis, context). Resilience modules export. Automation types export. Queue client exports. Jobs + automation coexist without export conflicts. Both error builders return v2 objects with different module names. |

---

## File Inventory

**55 source files, 12,352 lines of hand-written code, 475 tests across 27 test files.**

### Core Job Execution (11 files, 2,329 lines)
```
src/types.ts                    (545)  All shared types: JobTypeDefinition, JobState, RecoveryPlan,
                                        WorkerContract, QueuePosture, CronPosture, PolicyResult...
src/errors.ts                   (346)  20 error codes (JOBS_100-152) + v2 builder
src/job-registry.ts             (228)  Registration, validation, planJob(), policy gate
src/state-machine.ts            (74)   8 statuses, valid transitions, terminal detection
src/idempotency.ts              (150)  In-memory store with TTL, replay policies
src/recovery.ts                 (115)  Failure classification → RecoveryPlan
src/worker-validation.ts        (68)   Worker contract enforcement
src/side-effects.ts             (44)   Declared vs actual validation
src/dependency-resolver.ts      (137)  BFS cycle detection, satisfaction checking
src/health.ts                   (172)  Queue posture, stuck detection, LLM summaries
src/cron-scheduler.ts           (242)  Named crons, health tracking, posture
```

### Infrastructure (1 file, 208 lines)
```
src/bullmq-adapter.ts           (208)  BullMQ QueueClient implementation
```

### Automation Core — Absorbed from @ordinatio/automation (15 files, 4,289 lines)
```
src/automation/trigger-registry.ts      (387)  Central event emitter
src/automation/condition-evaluator.ts   (356)  AND/OR, 14 comparators, templates
src/automation/action-executor.ts       (118)  Legacy sequential executor
src/automation/execution.ts             (249)  Execution lifecycle
src/automation/crud.ts                  (208)  Transactional CRUD
src/automation/queries.ts               (192)  Query operations
src/automation/automation-types.ts      (95)   Create/Update input types
src/automation/db-types.ts              (235)  Enums, DB interface, callbacks
src/automation/errors.ts                (793)  107 error codes (AUTO_100-507) + v2 builder
src/automation/queue-client.ts          (165)  BullMQ queue integration
src/automation/actions/                 (12 files, 2,423 lines)
src/automation/resilience/              (10 files, 1,462 lines)
```

### DAG Engine — New in v2 (4 files, 1,350 lines)
```
src/automation/dag-types.ts      (348)  8 node types, 10 edge types, execution state,
                                         continuation tokens, action handler interface
src/automation/dag-executor.ts   (441)  Pure execution engine — branch, parallel, wait,
                                         approval, retry, fallback, transform
src/automation/dag-validator.ts  (328)  Cycle detection, reachability, orphans, node validation
src/automation/dag-builder.ts    (233)  Fluent API + legacyToDAG() backward compat
```

### Automation Intelligence — New in v2 (7 files, 1,790 lines)
```
src/automation/intent-layer.ts        (373)  Intent, DoD, failure boundary, escalation
src/automation/plan-automation.ts     (324)  Preflight analysis
src/automation/automation-posture.ts  (248)  7 health states, summaries, hypermedia
src/automation/trust-gate.ts          (153)  Risk-to-trust mapping, policy
src/automation/simulation.ts          (317)  Historical replay, projections, confidence
src/automation/blueprint.ts           (246)  Templates, variables, instantiation
src/automation/memory-artifact.ts     (200)  Compact execution summaries
src/automation/hypermedia.ts          (129)  _state, _actions, _constraints, _recovery
```

---

## Domus Integration

Registered as a module in `@ordinatio/domus` with 16 event declarations:

**Emits:**
`job.completed`, `job.failed`, `job.quarantined`, `job.dead_lettered`, `cron.fired`, `cron.failed`, `automation.triggered`, `automation.completed`, `automation.failed`, `automation.dead_letter`, `automation.paused`, `automation.approval_needed`, `automation.intent_satisfied`, `automation.intent_unsatisfied`, `automation.circuit_open`, `automation.simulated`

**Subscribes to:**
`security.trust_changed`, `security.quarantine`

---

## Pugil Integration

All 27 test files mapped to Pugil categories:

| Category | Files | Tests |
|----------|-------|-------|
| `unit` | 16 | 311 |
| `integration` | 7 | 94 |
| `adversarial` | 2 | 44 |
| `concurrency` | 1 | 7 |
| `chaos` | 1 | 12 |

```bash
PUGIL_ENABLED=true PUGIL_CYCLE_ID=cycle-jobs-v2 pnpm --filter @ordinatio/jobs test:run
```

---

## Simulation Mode Note

Built March 19, 2026. The simulation engine queries historical events and projects outcomes without executing actions. The default action simulator returns `{ wouldSucceed: true }` for all actions. **Refine by October 19, 2026** — add app-specific simulators that estimate real success/failure rates based on current data state.
