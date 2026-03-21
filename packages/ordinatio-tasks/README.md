# @ordinatio/tasks

Agentic-first operational workflow engine. Entity-agnostic tasks with dependencies, templates, intents, health monitoring, and full audit trails.

## Quick Start

### With Domus (recommended)

```bash
npm install @ordinatio/domus
# The setup wizard launches automatically — select 'tasks'
```

```typescript
import { createDomus } from '@ordinatio/domus';
const app = await createDomus();

const task = await app.tasks.createTask({
  title: 'Review client proposal',
  priority: 'HIGH',
  entityType: 'client',
  entityId: 'client_123',
  dueDate: new Date('2026-04-01'),
  createdBy: 'user_abc',
});

await app.tasks.completeTask(task.id, 'user_abc', 'Approved with minor changes');
```

### Standalone (callback injection)

```typescript
import { createTask, completeTask, getTask } from '@ordinatio/tasks';

const callbacks = {
  logActivity: async (action, description) => console.log(`[TASK] ${action}: ${description}`),
  emitEvent: async (type, data) => { /* your event system */ },
};

const task = await createTask(db, {
  title: 'Follow up with vendor',
  priority: 'MEDIUM',
  createdBy: 'user_123',
}, callbacks);
```

## Architecture

### Entity-Agnostic Tasks

Tasks link to any entity via `entityType`/`entityId` — no hardcoded foreign keys:

```typescript
// Link to an email
{ entityType: 'email', entityId: 'email_abc' }

// Link to a client
{ entityType: 'client', entityId: 'client_123' }

// Link to an order
{ entityType: 'order', entityId: 'order_456' }
```

### Priority & Status

**4 priority levels:** `URGENT` > `HIGH` > `MEDIUM` > `LOW`

**4 statuses:** `OPEN` → `IN_PROGRESS` → `BLOCKED` / `COMPLETED`

### Subtasks

Tasks can have parent/child relationships for breaking work into smaller pieces.

### Dependencies (4 types)

| Type | Meaning |
|------|---------|
| `FINISH_START` | B can't start until A finishes |
| `START_START` | B can't start until A starts |
| `FINISH_FINISH` | B can't finish until A finishes |
| `SOFT` | Advisory — no enforcement |

BFS circular dependency detection prevents invalid dependency graphs.

### Templates

Reusable workflow blueprints with task specs, subtasks, dependencies, and due-date offsets:

```typescript
const template = await createTemplate(db, {
  name: 'New Client Onboarding',
  definition: {
    tasks: [
      { title: 'Schedule fitting', priority: 'HIGH', dueDateOffset: 3 },
      { title: 'Send welcome email', priority: 'MEDIUM', dueDateOffset: 1 },
    ],
    dependencies: [{ from: 1, to: 0, type: 'FINISH_START' }],
  },
  createdBy: 'admin',
});

// Instantiate for a specific client
const tasks = await instantiateTemplate(db, {
  templateId: template.id,
  entityType: 'client',
  entityId: 'client_123',
  createdBy: 'admin',
});
```

### Task Intents

Outcome-driven goals with machine-readable success criteria:

```typescript
const intent = await createIntent(db, {
  title: 'Get client measurements',
  successCriteria: { type: 'field_populated', entity: 'client', field: 'measurements' },
  entityType: 'client',
  entityId: 'client_123',
  createdBy: 'admin',
});
```

6-status lifecycle: `PROPOSED` → `ACTIVE` → `IN_PROGRESS` → `BLOCKED` → `SATISFIED` / `FAILED`

### Health Engine

7 signal types for proactive monitoring:

| Signal | Detects |
|--------|---------|
| `overdue` | Tasks past their due date |
| `long_blocked` | Blocked for >48 hours |
| `approaching_deadline` | Due within 24 hours |
| `unassigned` | No one assigned |
| `no_criteria` | Missing success criteria |
| `dependency_risk` | Depends on blocked/overdue tasks |
| `unsatisfied_intent` | Active intents without progress |

### Agent Work Queue

Deterministic prioritization for AI agents:
`overdue` → `urgent` → `due soon` → `high` → `medium` → `low`

## API Reference

### Queries

| Function | Description |
|----------|-------------|
| `getTasks(db, options)` | List tasks with filters |
| `getTask(db, id)` | Get a single task |
| `getTaskCounts(db)` | Count by status |
| `getSubtasks(db, parentId)` | Get child tasks |
| `getAgentQueue(db, role?)` | Get prioritized work queue |
| `searchTasks(db, query)` | Full-text search |

### Mutations

| Function | Description |
|----------|-------------|
| `createTask(db, input, callbacks)` | Create a task |
| `updateTask(db, id, input, userId, callbacks)` | Update fields |
| `completeTask(db, id, userId?, callbacks)` | Mark complete |
| `startTask(db, id, userId, callbacks)` | Move to IN_PROGRESS |
| `blockTask(db, id, input, userId, callbacks)` | Block with reason |
| `unblockTask(db, id, userId, callbacks)` | Remove blocker |
| `assignTask(db, id, assigneeId, userId, callbacks)` | Assign to user |
| `deleteTask(db, id, callbacks)` | Delete a task |

### Dependencies

| Function | Description |
|----------|-------------|
| `addDependency(db, input)` | Create a dependency |
| `removeDependency(db, id)` | Remove a dependency |
| `checkDependenciesMet(db, taskId)` | Check if all deps satisfied |
| `detectCircularDependency(db, from, to)` | BFS cycle detection |

### Health

| Function | Description |
|----------|-------------|
| `getOverdueTasks(db)` | Tasks past due date |
| `getHealthSummary(db)` | Aggregate health report |
| `getHealthSignals(db)` | All health signals |

## Error Codes

35 error codes across two registries:

- **TASK_100-143**: Core task operations
- **INTENT_200-206**: Intent lifecycle

Every error includes: code, timestamped ref, module, description, severity, diagnosis steps.

## Callback Injection

The task engine uses callback injection for cross-cutting concerns:

```typescript
interface MutationCallbacks {
  logActivity?: (action: string, description: string, data?: Record<string, unknown>) => Promise<void>;
  emitEvent?: (type: string, data: unknown) => Promise<void>;
}
```

This keeps the package decoupled — no direct dependency on activity logging, event buses, or notification systems. The consuming app wires those in via callbacks.

## Testing

```bash
pnpm --filter @ordinatio/tasks test:run
# 168 tests
```

## Pugil Integration

This package includes a Pugil reporter that generates Council-consumable `trial_report` artifacts from test results.

```bash
# Normal test run (no Pugil overhead)
pnpm --filter @ordinatio/tasks test:run

# With Pugil trial report generation
PUGIL_ENABLED=true pnpm --filter @ordinatio/tasks test:run

# With Council cycle integration
PUGIL_ENABLED=true PUGIL_CYCLE_ID=cycle-tasks-v1 pnpm --filter @ordinatio/tasks test:run
```

- **Config:** `src/pugil.config.ts` — maps test files to categories (unit, integration, adversarial, chaos, concurrency)
- **Reporter:** `src/pugil-reporter.ts` — Vitest custom reporter, writes to `pugil-reports/`
- **Types:** `PugilTestResult`, `PugilTestCategory` from `@ordinatio/core`

## License

MIT
