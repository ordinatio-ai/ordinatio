# @ordinatio/domus

The Ordinatio home unit — one install to set up a production email engine, task workflow system, entity knowledge registry, or any combination. The domus handles everything: module installation, database setup, schema provisioning, default seeding, and automatic wiring between modules.

## Quick Start

```bash
npm install @ordinatio/domus
```

That's it. The setup wizard launches automatically after install — pick your modules, configure your database, and you're running:

```
  ┌─────────────────────────────┐
  │  Ordinatio — Domus Setup     │
  └─────────────────────────────┘

  Which modules do you need?
  [y/N] email — Multi-provider email + OAEM protocol: y
  [y/N] tasks — Agentic workflow engine: y
  [y/N] entities — Entity knowledge + agent intelligence: y
  [y/N] auth — Authentication security + CSRF protection: y

  Installing @ordinatio/email, @ordinatio/tasks, @ordinatio/entities, @ordinatio/auth...
  ✓ Modules installed

  Database setup:
  (1) Create a new PostgreSQL database
  (2) Use an existing database URL
  > 1
  Database name [ordinatio]: myapp
  ...

  ✓ Database "myapp" created
  ✓ Schema pushed (31 tables)
  ✓ Defaults seeded
  ✓ Config written to .ordinatio.json
```

Then use it in your code:

```typescript
import { createDomus } from '@ordinatio/domus';

const app = await createDomus();

// Email (with OAEM protocol built in)
await app.email.syncEmails(accountId);
const capsule = app.email.encodeCapsule({ spec: 'ai-instructions', ... });

// Tasks (auto-wired to email if both are active)
const task = await app.tasks.createTask({ title: 'Review proposal', priority: 'HIGH' });
await app.tasks.completeTask(task.id);

// Entities (knowledge, contacts, agent intelligence)
const contact = await app.entities.findOrCreateContact('jane@example.com', 'Jane Doe', 'manual');
await app.entities.setEntityFields('client', 'client-123', { preferred_fabric: 'wool' }, 'agent');
const health = await app.entities.computeEntityHealth?.('client', 'client-123');

// Auth (security hardening, CSRF)
const lockout = app.auth.checkLockout('user@example.com');
const strength = app.auth.validatePassword('MyP@ssw0rd!', { email: 'user@example.com' });
const csrfToken = app.auth.generateCsrfToken();

// Cleanup
await app.shutdown();
```

## Module Catalog

| Module | Package | What It Does |
|--------|---------|-------------|
| **email** | `@ordinatio/email` | Multi-provider email (Gmail, Outlook, IMAP/SMTP) + OAEM protocol |
| **tasks** | `@ordinatio/tasks` | Agentic-first workflow engine with dependencies, templates, intents |
| **entities** | `@ordinatio/entities` | Entity knowledge registry, agent intelligence, notes, contacts |
| **auth** | `@ordinatio/auth` | Account lockout, password validation, session security, CSRF protection |
| **settings** | `@ordinatio/settings` | System settings, AI provider config, user preferences |
| **activities** | `@ordinatio/activities` | Activity logging + Operational Intuition engine |
| **security** | `@ordinatio/security` | Security Control Plane — events, alerts, detection, policy, enforcement, integrity |

You don't install these manually — the wizard installs them for you when you select them.

## CLI Commands

### Setup Wizard (auto-runs on install)

The wizard runs automatically after `npm install @ordinatio/domus` in interactive terminals. It's skipped silently in CI, Docker, or if `.ordinatio.json` already exists.

To re-run manually:
```bash
npx ordinatio init
```

### `npx ordinatio add <module>`

Add a module to an existing domus:
```bash
npx ordinatio add entities
```

Installs the package, pushes new tables, seeds defaults, and shows auto-wiring info.

## `createDomus()` API

```typescript
const app = await createDomus({
  // All optional — reads from .ordinatio.json or env
  databaseUrl: process.env.DATABASE_URL,
  modules: ['email', 'tasks', 'entities', 'auth'],
  features: {
    OAEM_PROTOCOL: true,
    AUTO_TASK_FROM_EMAIL: true,
    AUTO_ARCHIVE_ON_COMPLETE: true,
    AUTO_CONTACT_FROM_EMAIL: true,
    AUTO_KNOWLEDGE_ON_TASK_COMPLETE: true,
    CSRF_PROTECTION: true,
    ACCOUNT_LOCKOUT: true,
  },
  callbacks: {
    onActivity: async (module, action, description) => {
      console.log(`[${module}] ${action}: ${description}`);
    },
  },
});
```

### Config Resolution

The factory resolves configuration in priority order:
1. Explicit `config` argument to `createDomus()`
2. `.ordinatio.json` in the current directory
3. `DATABASE_URL` environment variable

### DomusInstance

| Property | Type | Description |
|----------|------|-------------|
| `db` | `PrismaClient` | Connected database client |
| `email` | `DomusEmailApi` | Email operations (only if module active) |
| `tasks` | `DomusTasksApi` | Task operations (only if module active) |
| `entities` | `DomusEntitiesApi` | Entity knowledge, contacts, agent intelligence (only if module active) |
| `auth` | `DomusAuthApi` | Account lockout, password validation, session security, CSRF (only if module active) |
| `modules` | `string[]` | Active module names |
| `features` | `Record<string, boolean>` | Feature flags |
| `shutdown()` | `() => Promise<void>` | Disconnect and clean up |

## Auto-Wiring

When multiple modules are active, the domus wires them together automatically:

| From | To | Feature Flag | What Happens |
|------|----|-------------|--------------|
| email | tasks | `AUTO_TASK_FROM_EMAIL` | Synced emails auto-create follow-up tasks |
| tasks | email | `AUTO_ARCHIVE_ON_COMPLETE` | Completing a task archives its linked email |
| email | entities | `AUTO_CONTACT_FROM_EMAIL` | Synced emails auto-create contacts |
| tasks | entities | `AUTO_KNOWLEDGE_ON_TASK_COMPLETE` | Completing a task logs an agent interaction |

Auto-wiring is opt-in via feature flags. Disabled by default.

## `.ordinatio.json`

Generated by the setup wizard, consumed by `createDomus()`:

```json
{
  "databaseUrl": "postgresql://postgres@localhost:5432/myapp",
  "modules": ["email", "tasks", "entities", "auth"],
  "features": {
    "OAEM_PROTOCOL": true,
    "EMAIL_TEMPLATES": true,
    "EMAIL_MULTI_PROVIDER": true,
    "TASK_ENGINE_V2": true,
    "ENTITY_KNOWLEDGE": true,
    "CSRF_PROTECTION": true,
    "ACCOUNT_LOCKOUT": true,
    "AUTO_CONTACT_FROM_EMAIL": false,
    "AUTO_KNOWLEDGE_ON_TASK_COMPLETE": false
  }
}
```

## Pugil Integration

This package includes a Pugil reporter that generates Council-consumable `trial_report` artifacts from test results.

```bash
# Normal test run (no Pugil overhead)
pnpm --filter @ordinatio/domus test:run

# With Pugil trial report generation
PUGIL_ENABLED=true pnpm --filter @ordinatio/domus test:run

# With Council cycle integration
PUGIL_ENABLED=true PUGIL_CYCLE_ID=cycle-domus-v1 pnpm --filter @ordinatio/domus test:run
```

- **Config:** `src/pugil.config.ts` — maps test files to categories (unit, integration, adversarial, chaos, concurrency)
- **Reporter:** `src/pugil-reporter.ts` — Vitest custom reporter, writes to `pugil-reports/`
- **Types:** `PugilTestResult`, `PugilTestCategory` from `@ordinatio/core`

## License

MIT
