# Ordinatio

**Enterprise Execution Infrastructure** — 11 modular packages for building deterministic, auditable, agent-native business systems.

```bash
npm install @ordinatio/domus
```

---

## What Is Ordinatio?

Ordinatio is a platform of composable modules that handle the hard parts of enterprise software: email, tasks, entities, authentication, security, job execution, agent orchestration, and more. Every module follows the same contracts — intent declaration, proof artifacts, machine-readable recovery, and deterministic behavior.

One execution language across the whole system. Jobs, automations, and agents all speak the same operating model: intent → plan → execute → prove → recover.

## Packages

| Package | Description | Tests |
|---------|-------------|-------|
| [`@ordinatio/domus`](./packages/ordinatio-domus) | Orchestrator — event bus, factory, auto-wiring | 133 |
| [`@ordinatio/core`](./packages/ordinatio-core) | Governance — covenants, admission, construction standards | 559 |
| [`@ordinatio/email`](./packages/ordinatio-email) | Multi-provider email + OAEM protocol | 527 |
| [`@ordinatio/tasks`](./packages/ordinatio-tasks) | Agentic workflow engine | 168 |
| [`@ordinatio/entities`](./packages/ordinatio-entities) | Entity knowledge + active reasoning | 409 |
| [`@ordinatio/auth`](./packages/ordinatio-auth) | Lockout, password, session, CSRF | 369 |
| [`@ordinatio/settings`](./packages/ordinatio-settings) | System settings, AI config, preferences | 115 |
| [`@ordinatio/activities`](./packages/ordinatio-activities) | Activity feed + Operational Intuition | 372 |
| [`@ordinatio/security`](./packages/ordinatio-security) | 5-layer Security Control Plane | 500 |
| [`@ordinatio/jobs`](./packages/ordinatio-jobs) | Unified execution engine + DAG automations | 504 |
| [`@ordinatio/agent`](./packages/ordinatio-agent) | LLM-agnostic agent framework | 203 |

**Total: 3,859 tests across 11 packages.**

## Quick Start

```typescript
import { createDomus } from '@ordinatio/domus';

const app = await createDomus({
  databaseUrl: process.env.DATABASE_URL,
  modules: ['email', 'tasks', 'entities'],
});

// Modules communicate via event bus — automatic wiring
await app.email.syncEmails(accountId);
await app.tasks.createTask({ title: 'Follow up', entityType: 'email', entityId });

// Inspect the event mesh
const topology = app.bus.getTopology();

await app.shutdown();
```

## Architecture

Every module follows the same protocol:

- **Enhanced v2 error builder** — every error returns `{ code, ref, timestamp, module, description, severity, recoverable, diagnosis[], context }`
- **Event bus** — modules declare events they emit and subscribe to; Domus routes automatically
- **Callback injection** — no module imports your app's services; you provide callbacks
- **Minimal DB interfaces** — accepts any Prisma client, no hard dependency

## License

MIT
