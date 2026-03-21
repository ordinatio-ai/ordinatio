# @ordinatio/activities

Operational activity logging with **Operational Intuition** — a novel engine that learns behavioral sequences from the activity stream and detects **missing beats**: expected follow-up actions that never arrived.

Most activity systems tell you what happened. This one tells you what *didn't* happen but *should have*.

Zero framework dependencies. Works with any Prisma-compatible database client.

**372 tests. 15 error codes. 31 source files. 64 activity action types.**

## Installation

```bash
npm install @ordinatio/activities
```

Or via the Ordinatio Domus orchestrator:

```bash
npx ordinatio add activities
```

## Quick Start

```typescript
import {
  createActivity,
  getActivitiesWithSticky,
  resolveActivity,
  createSecureActivityService,
  createAgentToolHandlers,
  computePulse,
  summarizeForAgent,
  ACTIVITY_ACTIONS,
} from '@ordinatio/activities';

// 1. Log an activity
const activity = await createActivity(db, {
  action: 'order.created',
  description: 'Order #1234 created for John Smith',
  orderId: 'order-1',
  clientId: 'client-1',
  userId: 'user-1',
  metadata: { garmentType: '3PC_SUIT', fabricCode: 'A754-21' },
});

// 2. Query with sticky items separated
const { stickyItems, recentActivities, totalRecent } =
  await getActivitiesWithSticky(db, { limit: 20, offset: 0 });

// 3. Resolve a sticky alert
await resolveActivity(db, 'activity-1', 'user-1');

// 4. Get the operational pulse (what's missing, what's unusual)
const pulse = computePulse(historicalActivities, recentActivities);
console.log(summarizeForAgent(pulse));
// Output:
// Operational Pulse (1,247 activities analyzed)
// Missing Beats (3):
//   ALARM: 1 significantly overdue
//   [ALARM] "client.measurements_updated" for client-42 (5.2d ago) — expected "client.fit_profile_created" within 2.1d

// 5. Use the tenant-scoped secure service
const service = createSecureActivityService(db, 'tenant-1');
await service.createActivity({
  action: 'order.created',
  description: 'Secured activity with validation',
});
```

## Architecture

```
@ordinatio/activities
|
|-- Core Layer
|   |-- activities.ts          # Create, query, resolve activities
|   |-- activity-actions.ts    # 64 action constants (order, placement, email, task, security, ...)
|   |-- activity-display-config.ts  # Display properties (label, severity, icon, color)
|   |-- activity-resolution.ts # Sticky resolution mapping + helpers
|   |-- types.ts               # Shared types + minimal ActivityDb interface
|   |-- errors.ts              # 15 error codes (ACTIVITY_100-302)
|
|-- Operational Intuition (Novel)
|   |-- intuition/
|       |-- types.ts           # LearnedSequence, MissingBeat, GhostProjection, OperationalPulse
|       |-- sequence-learner.ts # Mine A->B patterns from activity history
|       |-- missing-beats.ts   # Detect expected actions that haven't happened
|       |-- ghosts.ts          # Ghost projections (expected actions not yet overdue)
|       |-- entropy.ts         # Shannon entropy + bot storm detection
|       |-- resolution.ts      # Evidence-based resolution suggestions
|       |-- cadence.ts         # Learn daily/hourly rhythms, detect unusual silence
|       |-- intent-inference.ts # Infer active workflows from recent actions
|       |-- pulse.ts           # Single entry point combining all 7 subsystems
|
|-- Security Layer
|   |-- security.ts            # Action allowlists, metadata sanitization, tenant scoping
|
|-- Agent Tools
    |-- agent-tools.ts         # 8 tool definitions (7 observe + 1 act) + handler factory
```

## Modules

### 1. Core Activities

The foundation: create, query, and resolve activity log entries.

#### Creating Activities

```typescript
import { createActivity, ACTIVITY_ACTIONS } from '@ordinatio/activities';

const activity = await createActivity(db, {
  action: ACTIVITY_ACTIONS.PLACEMENT_FAILED,
  description: 'GoCreate rejected order — fabric out of stock',
  orderId: 'order-1',
  userId: 'system',
  system: true,
  metadata: { fabricCode: 'A754-21', errorCode: 'HTTPORDER_803' },
});
```

When you create an activity, the system automatically:
1. Looks up the display config (severity, icon, resolution requirement)
2. Auto-resolves related sticky items (e.g., `placement.completed` resolves `placement.awaiting_verification`)
3. Fires the `onActivityCreated` callback (if provided)

#### Sticky Items (Alerts)

Some activities require resolution — they "stick" in the feed until someone acknowledges them:

```typescript
// Sticky items are separated from regular activities
const { stickyItems, recentActivities } = await getActivitiesWithSticky(db, {
  limit: 20,
  orderId: 'order-1',
});

// Resolve a sticky item
await resolveActivity(db, stickyItems[0].id, 'user-1');
```

The resolution mapping is declarative:
- `placement.completed` auto-resolves `placement.verified` and `placement.awaiting_verification`
- `email.sync_completed` auto-resolves `email.sync_failed`
- `automation.completed` auto-resolves `automation.failed`

#### Activity Actions

64 action types organized by domain:

| Domain | Actions | Examples |
|--------|---------|----------|
| Order | 7 | `order.created`, `order.status_changed`, `order.duplicated` |
| Placement | 8 | `placement.pending`, `placement.completed`, `placement.failed` |
| Client | 6 | `client.created`, `client.fit_profile_created`, `client.note_added` |
| Email | 11 | `email.sync_completed`, `email.archived`, `email.template_created` |
| Task | 12 | `task.created`, `task.blocked`, `intent.satisfied` |
| Automation | 5 | `automation.triggered`, `automation.completed`, `automation.pattern_detected` |
| Security | 15 | `security.auth.login_success`, `security.api.csrf_failed`, `security.system.anomaly_detected` |
| Agent | 8 | `agent.memory_created`, `agent.pattern_detected`, `agent.knowledge_seeded` |
| Knowledge | 6 | `knowledge.value_set`, `knowledge.batch_completed` |
| Organization | 10 | `org.created`, `org.database_provisioned`, `org.switched` |
| Migration | 6 | `migration.started`, `migration.completed`, `migration.rolled_back` |
| OAEM | 4 | `oaem.capsule_received`, `oaem.action_executed` |

All action constants are available as `ACTIVITY_ACTIONS.ORDER_CREATED` etc. The `ActivityAction` union type provides compile-time safety.

#### Custom Actions

For enterprise/plugin actions not in the built-in list:

```typescript
import { createActivity } from '@ordinatio/activities';

// Pass allowUnknownActions to skip validation
const activity = await createActivity(db, {
  action: 'billing.invoice_sent',
  description: 'Invoice #5678 sent to client',
}, undefined, { allowUnknownActions: true });
```

### 2. Operational Intuition

**The novel feature.** The Operational Intuition engine learns what "normal" looks like from the activity stream, then detects when something that should have happened... didn't.

This is fundamentally different from error detection or alerting. Errors tell you when something went wrong. Intuition tells you when something that should have *happened* simply never arrived.

#### How It Works

```
                                Historical Activities (90 days)
                                           |
                            +--------------+--------------+
                            |              |              |
                    Sequence Learner  Cadence Learner  Intent Matcher
                            |              |              |
                      LearnedSequence   CadenceProfile  InferredIntent
                            |              |              |
                    Missing Beat      Cadence Break      Active
                     Detector          Detector          Intents
                            |              |              |
                            +--------------+--------------+
                                           |
                                   Operational Pulse
                                           |
                                    Agent Summary
```

#### Sequence Learning

The engine mines A->B patterns from historical activity data:

```typescript
import { learnSequences } from '@ordinatio/activities';

const sequences = learnSequences(activities);
// Returns:
// [
//   {
//     fromAction: 'client.measurements_updated',
//     toAction: 'client.fit_profile_created',
//     occurrences: 47,
//     medianDelayMs: 86400000,    // 1 day
//     p90DelayMs: 172800000,       // 2 days
//     confidence: 0.85,            // 85% of measurements lead to fit profiles
//     entityScoped: true,          // Same client
//   },
//   ...
// ]
```

Key properties:
- **Entity-scoped**: Sequences are mined per-client and per-order, so "client A's measurements were updated" only expects a fit profile for client A
- **Confidence-weighted**: Only sequences with sufficient occurrences and confidence generate missing beats
- **Zero configuration**: Learns from whatever activity data exists. No rules to write.

#### Missing Beat Detection

The heart of the engine. Given learned sequences and recent activities, it finds expected follow-ups that haven't arrived:

```typescript
import { detectMissingBeats } from '@ordinatio/activities';

const missingBeats = detectMissingBeats(activities, sequences);
// Returns:
// [
//   {
//     triggerActivity: { id: 'act-1', action: 'client.measurements_updated', ... },
//     expectedAction: 'client.fit_profile_created',
//     expectedWithinMs: 172800000,   // p90: 2 days
//     waitingMs: 432000000,          // Actually waiting: 5 days
//     overdueRatio: 2.5,            // 2.5x overdue
//     urgency: 'alarm',             // watch < nudge < alarm
//   }
// ]
```

Urgency classification uses an adjusted ratio that accounts for confidence:
- **watch** (adjusted ratio < 1.5): Slightly overdue, low confidence — keep an eye on it
- **nudge** (1.5 - 3.0): Meaningfully overdue — worth checking on
- **alarm** (> 3.0): Significantly overdue with high confidence — likely a dropped ball

#### Ghost Projection Engine

Predicts future missing beats *before* they become overdue — giving advance warning:

```typescript
import { projectGhosts } from '@ordinatio/activities';

const ghosts = projectGhosts(activities, sequences, now);
// [
//   {
//     triggerId: 'act-1',
//     expectedAction: 'client.fit_profile_created',
//     entityId: 'client-42',
//     entityType: 'client',
//     projectionTimestamp: Date,  // when it becomes overdue
//     countdownMs: 86400000,     // 24h remaining
//     confidence: 0.85,
//     urgency: 'MEDIUM',        // LOW > MEDIUM > HIGH
//   }
// ]
```

Ghosts are ephemeral — recomputed on every pulse. A ghost with countdown <= 0 is a missing beat, not a ghost.

#### Shannon Entropy & Bot Storm Detection

Measures action diversity and detects automated spam/stuck loops:

```typescript
import { calculateEntropy, detectBotStorm } from '@ordinatio/activities';

const entropy = calculateEntropy(activities);
// 0.0 = all identical, log2(N) = perfectly uniform

const { isBotStorm, entropy, dominantAction, burstRate } = detectBotStorm(activities);
// isBotStorm: true when low entropy + uniform timing intervals
```

#### Evidence-Based Resolution

Suggests what to do next based on historical success rates:

```typescript
import { suggestResolutions } from '@ordinatio/activities';

const suggestions = suggestResolutions('client.measurements_updated', sequences);
// [
//   { action: 'client.fit_profile_created', historicalRate: 0.67, confidence: 0.85 },
//   { action: 'order.created', historicalRate: 0.33, confidence: 0.4 },
// ]
```

#### Cadence Detection

Learns your operational rhythm and detects unusual silence:

```typescript
import { learnCadence, detectCadenceBreaks, overallCadenceStatus } from '@ordinatio/activities';

const profile = learnCadence(historicalActivities);
// profile.hourlyRate[14] = 3.2  → ~3 activities per hour at 2 PM
// profile.dailyRate[1] = 42     → ~42 activities on Mondays

const breaks = detectCadenceBreaks(recentActivities, profile);
// [{ period: 'hour-14', expected: 3.2, actual: 0, severity: 'silent' }]

const status = overallCadenceStatus(breaks);
// 'normal' | 'quiet' | 'unusual' | 'silent'
```

#### Intent Inference

Matches recent activity patterns against known workflows and learned sequences to predict what the user is working on:

```typescript
import { inferIntents } from '@ordinatio/activities';

const intents = inferIntents(recentActivities, sequences);
// [
//   {
//     label: 'Client Onboarding',
//     evidenceActions: ['client.created', 'client.measurements_updated'],
//     predictedNext: [
//       { action: 'client.fit_profile_created', confidence: 0.85, typicalDelayMs: 86400000 }
//     ],
//     entityContext: { clientId: 'client-42' },
//   }
// ]
```

6 built-in workflow patterns:
1. **Client Onboarding**: created -> measurements -> fit profile -> order
2. **Order Placement**: created -> status changed -> placement pending -> completed
3. **Order Recovery**: failed -> placement retried -> pending
4. **Email Follow-up**: replied -> task created -> completed
5. **Fit Profile Update**: measurements updated -> fit profile updated
6. **Automation Troubleshooting**: failed -> dead letter -> triggered

#### The Pulse (Single Entry Point)

`computePulse()` combines all seven subsystems into one snapshot:

```typescript
import { computePulse, summarizeForAgent, pulseNeedsAttention } from '@ordinatio/activities';

const pulse = computePulse(historicalActivities, recentActivities);

// Quick boolean check
if (pulseNeedsAttention(pulse)) {
  // At least one alarm, nudge, or unusual cadence
}

// Text summary optimized for LLM context windows
const summary = summarizeForAgent(pulse);
// "Operational Pulse (1,247 activities analyzed)
//  Missing Beats (3):
//    ALARM: 1 significantly overdue
//    [ALARM] "client.measurements_updated" for client-42 (5.2d ago) — expected ...
//  Cadence: NORMAL
//  Active Workflows (2):
//    Client Onboarding [client-42]
//      Next expected: client.fit_profile_created (85%)"
```

#### Configuration

All parameters have sensible defaults. Override as needed:

```typescript
const pulse = computePulse(historical, recent, new Date(), {
  minOccurrences: 5,          // Require 5+ observations (default: 3)
  minConfidence: 0.5,         // 50% confidence threshold (default: 0.3)
  maxSequenceDelayMs: 3 * 24 * 60 * 60 * 1000, // 3 day max (default: 7 days)
  learningWindowDays: 60,     // 60 days history (default: 90)
  detectionWindowDays: 7,     // 7 day detection window (default: 14)
  minActivitiesForLearning: 100, // Need 100+ activities (default: 50)
});
```

### 3. Security Layer

Production-grade hardening for activity creation.

#### Tenant-Scoped Secure Service

```typescript
import { createSecureActivityService } from '@ordinatio/activities';

const service = createSecureActivityService(db, 'tenant-1', callbacks, {
  strictActions: true,        // Reject unknown actions (default: true)
  customActions: ['billing.invoice_sent'], // Extend the allowlist
  maxMetadataBytes: 10240,    // 10KB metadata limit (default)
});

// All operations are automatically:
// 1. Validated against the action allowlist
// 2. Sanitized for XSS and prototype pollution
// 3. Rate-limited via callbacks
// 4. Tagged with _tenantId in metadata
await service.createActivity({
  action: 'order.created',
  description: 'Tenant-scoped activity',
  metadata: { orderId: 'o-1' },
});
```

#### Action Allowlist

```typescript
import { isKnownAction } from '@ordinatio/activities';

isKnownAction('order.created');           // true (in ACTIVITY_CONFIG)
isKnownAction('evil.action');             // false
isKnownAction('billing.custom', ['billing.custom']); // true (custom list)
```

#### Metadata Sanitization

```typescript
import { sanitizeMetadata } from '@ordinatio/activities';

// Rejects oversized metadata
sanitizeMetadata({ data: 'x'.repeat(20000) }, 10240);
// { valid: false, reason: 'Metadata exceeds 10240 byte limit ...' }

// Strips prototype pollution keys
sanitizeMetadata({ safe: 'ok', __proto__: { evil: true } }, 10240);
// { valid: true, sanitized: { safe: 'ok' } }

// Rejects XSS vectors
sanitizeMetadata({ html: '<script>alert("xss")</script>' }, 10240);
// { valid: false, reason: 'Metadata contains potentially dangerous content...' }
```

Dangerous patterns detected:
- `<script>` tags
- `javascript:` URIs
- Event handler attributes (`onerror`, `onload`, `onclick`, etc.)
- `data:text/html` URIs

#### Rate Limiting

```typescript
const service = createSecureActivityService(db, 'tenant-1', {
  shouldAllowCreation: async (input) => {
    const count = await getRecentCount(input.action);
    return count < 100; // Max 100 per minute
  },
});
```

### 4. Agent Tools

8 pre-built tool definitions for registration in agent tool registries, following the Ordinatio covenant pattern.

#### Tool Catalog

| Tool | Risk Level | Sensitivity | Approval | Description |
|------|-----------|-------------|----------|-------------|
| `getOperationalPulse` | observe | internal | No | Full pulse: missing beats, cadence, intents |
| `getPulseSummary` | observe | internal | No | Text summary for LLM context window |
| `checkPulseAttention` | observe | none | No | Quick boolean: needs attention? |
| `getMissingBeats` | observe | internal | No | Missing beats grouped by entity |
| `getUnresolvedAlerts` | observe | internal | No | Sticky items needing resolution |
| `getRecentActivities` | observe | internal | No | Paginated activity list |
| `getEntityActivities` | observe | internal | No | Activities for a specific order/client |
| `resolveAlert` | act | internal | No | Mark a sticky alert as resolved |

#### Using Agent Tools

```typescript
import { createAgentToolHandlers } from '@ordinatio/activities';

const handlers = createAgentToolHandlers(db);

// Get pulse (cached for 5 minutes)
const pulse = await handlers.getOperationalPulse(historical, recent);

// Get text summary for the agent
const summary = await handlers.getPulseSummary(historical, recent);

// Quick attention check
if (await handlers.checkPulseAttention(historical, recent)) {
  const beats = await handlers.getMissingBeats(historical, recent);
  // ... act on missing beats
}

// Resolve an alert
await handlers.resolveAlert('activity-1', 'agent-coo');

// Force cache invalidation after batch operations
handlers.invalidateCache();
```

## Database Interface

The package accepts any object matching the `ActivityDb` interface — no Prisma dependency:

```typescript
interface ActivityDb {
  activityLog: {
    create(args: { data: {...}; include: {...} }): Promise<ActivityWithRelations>;
    update(args: { where: { id: string }; data: {...}; include: {...} }): Promise<ActivityWithRelations>;
    updateMany(args: { where: {...}; data: {...} }): Promise<unknown>;
    findMany(args: { where?: {...}; include?: {...}; orderBy?: {...}; take?: number; skip?: number }): Promise<ActivityWithRelations[]>;
    count(args: { where?: {...} }): Promise<number>;
  };
  $transaction<T>(fn: (tx: ActivityDb) => Promise<T>): Promise<T>;
}
```

### Prisma Schema Fragment

```prisma
model ActivityLog {
  id                 String    @id @default(cuid())
  action             String
  description        String
  severity           String    @default("INFO")
  requiresResolution Boolean   @default(false)
  resolvedAt         DateTime?
  resolvedBy         String?
  system             Boolean   @default(false)
  metadata           Json?
  createdAt          DateTime  @default(now())

  userId             String?
  orderId            String?
  clientId           String?
  placementAttemptId String?

  user   User?   @relation(fields: [userId], references: [id])
  order  Order?  @relation(fields: [orderId], references: [id])
  client Client? @relation(fields: [clientId], references: [id])

  @@index([action])
  @@index([orderId])
  @@index([clientId])
  @@index([requiresResolution, resolvedAt])
  @@index([createdAt])
}
```

## Callbacks

Inject side effects without coupling:

```typescript
import type { ActivityCallbacks } from '@ordinatio/activities';

const callbacks: ActivityCallbacks = {
  onActivityCreated: async (activity) => {
    // Emit WebSocket event, update dashboard, etc.
    io.emit('activity:created', activity);
  },
  onActivityResolved: async (activity) => {
    // Log resolution, update alert counts, etc.
    console.log(`Alert ${activity.id} resolved by ${activity.resolvedBy}`);
  },
};

await createActivity(db, input, callbacks);
```

The secure service extends callbacks with:

```typescript
interface SecureActivityCallbacks extends ActivityCallbacks {
  shouldAllowCreation?: (input: CreateActivityInput) => Promise<boolean>;
  onPatternDetected?: (pattern: { name: string; details: string }) => Promise<void>;
}
```

## Error Registry

15 error codes following Rule 8 (unique timestamped refs):

| Range | Domain | Codes |
|-------|--------|-------|
| 100-104 | Create / List | `ACTIVITY_100` (unauth), `ACTIVITY_101` (invalid params), `ACTIVITY_102` (create failed), `ACTIVITY_103` (unknown action), `ACTIVITY_104` (fetch failed) |
| 200-204 | Resolve / Sticky | `ACTIVITY_200` (not found), `ACTIVITY_201` (resolve failed), `ACTIVITY_202` (auto-resolve failed), `ACTIVITY_203` (sticky query failed), `ACTIVITY_204` (count mismatch) |
| 300-302 | Filter / Pagination | `ACTIVITY_300` (invalid filter), `ACTIVITY_301` (order query failed), `ACTIVITY_302` (client query failed) |

```typescript
import { activityError, ACTIVITY_ERRORS } from '@ordinatio/activities';

const { code, ref } = activityError('ACTIVITY_102');
// { code: 'ACTIVITY_102', ref: 'ACTIVITY_102-20260307T143000' }
```

## Domus Integration

Registered as the 6th module in the Ordinatio Domus orchestrator:

```typescript
import { createDomus } from '@ordinatio/domus';

const domus = await createDomus({
  modules: ['email', 'tasks', 'entities', 'auth', 'settings', 'activities'],
  database: { url: process.env.DATABASE_URL },
});

// Activities API available
await domus.activities.createActivity(db, {
  action: 'order.created',
  description: 'Created via Domus',
});
```

## Testing

```bash
# Run all 372 tests
pnpm --filter @ordinatio/activities test:run

# Run specific test file
pnpm --filter @ordinatio/activities test:run src/__tests__/pulse.test.ts
```

### Test Distribution

| Test File | Tests | What It Covers |
|-----------|-------|----------------|
| `activities.test.ts` | 10 | Core CRUD, auto-resolution, callbacks |
| `activity-actions.test.ts` | 7 | Action constants, type coverage |
| `activity-display-config.test.ts` | 7 | Display config completeness |
| `activity-resolution.test.ts` | 8 | Resolution mapping, helpers |
| `errors.test.ts` | 14 | Error registry completeness |
| `sequence-learner.test.ts` | 8 | Pattern mining, entity scoping |
| `missing-beats.test.ts` | 11 | Overdue detection, urgency classification |
| `cadence.test.ts` | 11 | Rhythm learning, break detection |
| `intent-inference.test.ts` | 8 | Workflow matching, predictions |
| `pulse.test.ts` | 15 | Full pulse computation, summaries |
| `security.test.ts` | 20 | Allowlists, sanitization, tenant scoping |
| `agent-tools.test.ts` | 14 | Tool catalog, handlers, caching |
| `integration.test.ts` | 38 | End-to-end, edge cases, adversarial, pipeline |
| `ironclad-pulse.test.ts` | — | Pulse invariants, ghost projections, entropy, bot storms |
| `callback-errors.test.ts` | — | Callback failure resilience |
| `concurrency.test.ts` | — | Concurrent activity creation |
| `display-config-exhaustive.test.ts` | — | Display config covers all 64 actions |
| `large-scale.test.ts` | — | Performance with large activity volumes |
| `security-mob.test.ts` | — | Adversarial security scenarios |
| **Total** | **372** | |

## API Reference

### Core Functions

```typescript
// Create an activity (auto-resolves related sticky items)
createActivity(db, input, callbacks?, options?): Promise<ActivityWithRelations>

// Get activities with sticky/recent separation
getActivitiesWithSticky(db, options?): Promise<GetActivitiesResult>

// Resolve a sticky activity
resolveActivity(db, activityId, resolvedBy, callbacks?): Promise<ActivityWithRelations>

// Get activities for a specific order
getOrderActivities(db, orderId, limit?): Promise<ActivityWithRelations[]>

// Get activities for a specific client
getClientActivities(db, clientId, limit?): Promise<ActivityWithRelations[]>
```

### Intuition Functions

```typescript
// Learn A->B sequences from historical data
learnSequences(activities, config?): LearnedSequence[]

// Detect expected actions that haven't happened
detectMissingBeats(activities, sequences, now?, config?): MissingBeat[]

// Prioritize and deduplicate missing beats
prioritizeMissingBeats(beats, maxResults?): MissingBeat[]

// Project expected actions not yet overdue (ghosts)
projectGhosts(activities, sequences, now?, config?): GhostProjection[]

// Shannon entropy over action type distribution
calculateEntropy(activities): number

// Bot storm detection (low entropy + uniform timing)
detectBotStorm(activities, windowMs?): { isBotStorm, entropy, dominantAction, burstRate }

// Evidence-based resolution suggestions
suggestResolutions(triggerAction, sequences, minOccurrences?): ResolutionSuggestion[]

// Learn hourly/daily activity rhythms
learnCadence(activities): CadenceProfile

// Detect unusually quiet periods
detectCadenceBreaks(activities, profile, now?, lookbackHours?): CadenceBreak[]

// Overall cadence status
overallCadenceStatus(breaks): 'normal' | 'quiet' | 'unusual' | 'silent'

// Infer active workflows
inferIntents(activities, sequences, maxIntents?): InferredIntent[]

// Single entry point for agents
computePulse(historical, recent, now?, config?): OperationalPulse

// Text summary for LLM context
summarizeForAgent(pulse): string

// Quick attention check
pulseNeedsAttention(pulse): boolean

// Group missing beats by entity
getMissingBeatsByEntity(beats): Map<string, MissingBeat[]>
```

### Security Functions

```typescript
// Check if action is in the allowlist
isKnownAction(action, customActions?): boolean

// Sanitize metadata (size, XSS, prototype pollution)
sanitizeMetadata(metadata, maxBytes): { valid: boolean; sanitized: unknown; reason?: string }

// Create tenant-scoped secure service
createSecureActivityService(db, tenantId, callbacks?, config?): SecureActivityService
```

### Agent Tool Functions

```typescript
// Create handler implementations
createAgentToolHandlers(db): ActivityToolHandlers

// Tool catalog for registry
ACTIVITY_AGENT_TOOLS: Record<string, ActivityAgentTool>
```

## Pugil Integration

This package includes a Pugil reporter that generates Council-consumable `trial_report` artifacts from test results.

```bash
# Normal test run (no Pugil overhead)
pnpm --filter @ordinatio/activities test:run

# With Pugil trial report generation
PUGIL_ENABLED=true pnpm --filter @ordinatio/activities test:run

# With Council cycle integration
PUGIL_ENABLED=true PUGIL_CYCLE_ID=cycle-activities-v1 pnpm --filter @ordinatio/activities test:run
```

- **Config:** `src/pugil.config.ts` — maps test files to categories (unit, integration, adversarial, chaos, concurrency)
- **Reporter:** `src/pugil-reporter.ts` — Vitest custom reporter, writes to `pugil-reports/`
- **Types:** `PugilTestResult`, `PugilTestCategory` from `@ordinatio/core`
