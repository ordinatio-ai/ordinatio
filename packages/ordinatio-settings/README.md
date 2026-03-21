# @ordinatio/settings

System settings, AI provider configuration, and per-user preferences for the Ordinatio platform.

**Package:** `@ordinatio/settings` | **Version:** 1.0.0 | **License:** MIT
**Tests:** 115 | **Error codes:** 25 (SETTINGS_100-401) | **Zero runtime dependencies**

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Installation](#installation)
3. [Module Structure](#module-structure)
4. [Core Settings](#core-settings)
5. [AI Settings](#ai-settings)
6. [User Preferences](#user-preferences)
7. [Database Interface](#database-interface)
8. [Prisma Schema](#prisma-schema)
9. [Validation](#validation)
10. [Error Registry](#error-registry)
11. [Callbacks](#callbacks)
12. [Domus Integration](#domus-integration)
13. [App-Layer Bridge (System 1701)](#app-layer-bridge-system-1701)
14. [Testing](#testing)
15. [API Reference](#api-reference)

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────┐
│  Your Application (Next.js, Express, etc.)           │
│                                                      │
│  ┌────────────────────────────────────────────────┐  │
│  │  App-Layer Bridge (optional)                   │  │
│  │  Wires callbacks for activity logging,         │  │
│  │  security events, etc.                         │  │
│  └─────────────────────┬──────────────────────────┘  │
│                        │ imports                      │
│  ┌─────────────────────▼──────────────────────────┐  │
│  │  @ordinatio/settings                           │  │
│  │                                                │  │
│  │  ┌──────────┐ ┌──────────┐ ┌───────────────┐  │  │
│  │  │ settings │ │ai-settings│ │user-preferences│  │  │
│  │  │          │ │           │ │               │  │  │
│  │  │ getSetting│ │getLLMProv.│ │getPreferences │  │  │
│  │  │ setSetting│ │getApiKey  │ │updatePrefs    │  │  │
│  │  │ getAll.. │ │getAISet.. │ │getReplyLayout │  │  │
│  │  └──────────┘ └──────────┘ └───────────────┘  │  │
│  │                                                │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐      │  │
│  │  │  types   │ │  errors  │ │validation│      │  │
│  │  └──────────┘ └──────────┘ └──────────┘      │  │
│  └─────────────────────┬──────────────────────────┘  │
│                        │ uses                         │
│  ┌─────────────────────▼──────────────────────────┐  │
│  │  Database (via SettingsDb / UserPreferenceDb)   │  │
│  │  Any Prisma client or compatible object         │  │
│  └────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

**Key design decisions:**

- **No Prisma dependency.** The package defines its own minimal DB interfaces (`SettingsDb`, `UserPreferenceDb`). Any object matching the interface works — Prisma, Drizzle, a test mock, anything.
- **No env var reads in core settings.** All configuration is passed as function arguments. The one exception is `ai-settings.ts`, which falls back to `process.env` for API keys (standard pattern for secret management).
- **Callback injection.** Mutation functions accept an optional `SettingsCallbacks` parameter for side effects (activity logging, event emission). The package never imports your app's logging framework.
- **Defaults built in.** Every setting key has a default value. `getSetting()` returns the default when no DB row exists — the system works with an empty database.

---

## Installation

### With @ordinatio/domus (recommended)

```bash
npm install @ordinatio/domus
# The setup wizard will ask which modules to install
```

### Standalone

```bash
npm install @ordinatio/settings
```

The package has zero runtime dependencies. `zod` is a peer dependency used only for validation schemas.

---

## Module Structure

```
packages/ordinatio-settings/
├── src/
│   ├── index.ts              # Barrel export
│   ├── types.ts              # DB interfaces, type definitions
│   ├── settings.ts           # Core settings CRUD (10 keys)
│   ├── ai-settings.ts        # LLM provider configuration (6 providers)
│   ├── user-preferences.ts   # Per-user preferences (reply layout)
│   ├── errors.ts             # 25 error codes (SETTINGS_100-401)
│   ├── validation.ts         # Zod schemas
│   └── __tests__/
│       ├── settings.test.ts          # 27 tests
│       └── user-preferences.test.ts  # 13 tests
├── settings.prisma           # Schema fragment (2 models, 1 enum)
├── package.json
├── vitest.config.ts
└── README.md
```

---

## Core Settings

The core settings module provides a key-value store backed by a `SystemSettings` database table.

### Setting Keys

There are 10 built-in setting keys, defined in the `SETTINGS_KEYS` constant:

| Key | Default | Purpose |
|-----|---------|---------|
| `admin_feed_enabled` | `'true'` | Show/hide admin activity feed |
| `llm_provider` | `'claude'` | Global LLM provider selection |
| `llm_provider_bookkeeper` | `''` | Override LLM for Bookkeeper agent role |
| `llm_provider_coo` | `''` | Override LLM for COO agent role |
| `anthropic_api_key` | `''` | Anthropic Claude API key |
| `openai_api_key` | `''` | OpenAI API key |
| `gemini_api_key` | `''` | Google Gemini API key |
| `deepseek_api_key` | `''` | DeepSeek API key |
| `mistral_api_key` | `''` | Mistral API key |
| `xai_api_key` | `''` | xAI Grok API key |

### Functions

```typescript
import { getSetting, setBooleanSetting, getAllSettings, SETTINGS_KEYS } from '@ordinatio/settings';

// Read a single setting (returns default if not in DB)
const provider = await getSetting(db, SETTINGS_KEYS.LLM_PROVIDER);
// => 'claude'

// Read a boolean setting
const feedEnabled = await getBooleanSetting(db, SETTINGS_KEYS.ADMIN_FEED_ENABLED);
// => true

// Write a setting (upsert — creates if missing, updates if exists)
await setSetting(db, SETTINGS_KEYS.LLM_PROVIDER, 'openai', 'Active LLM provider');

// Write a boolean setting (stored as 'true'/'false' string)
await setBooleanSetting(db, SETTINGS_KEYS.ADMIN_FEED_ENABLED, false);

// Get all settings as a flat object (defaults merged with DB values)
const all = await getAllSettings(db);
// => { admin_feed_enabled: 'true', llm_provider: 'claude', ... }
```

### How defaults work

`getSetting()` always returns a string — never `null` or `undefined`:

1. Check DB for a row with the given key
2. If found, return `row.value`
3. If not found, return the built-in default from `DEFAULTS`
4. If no default exists, return `''`

This means the system is functional with an empty `SystemSettings` table.

---

## AI Settings

The AI settings module manages LLM provider configuration. It builds on top of core settings — the same `SystemSettings` table stores API keys and provider selections.

### 6 Supported Providers

| Provider ID | Display Name | Setting Key | Env Var Fallback |
|-------------|-------------|-------------|------------------|
| `claude` | Anthropic Claude | `anthropic_api_key` | `ANTHROPIC_API_KEY` |
| `openai` | OpenAI GPT | `openai_api_key` | `OPENAI_API_KEY` |
| `gemini` | Google Gemini | `gemini_api_key` | `GEMINI_API_KEY` |
| `deepseek` | DeepSeek | `deepseek_api_key` | `DEEPSEEK_API_KEY` |
| `mistral` | Mistral AI | `mistral_api_key` | `MISTRAL_API_KEY` |
| `grok` | xAI Grok | `xai_api_key` | `XAI_API_KEY` |

### API Key Resolution Priority

When resolving an API key, the system checks:

1. **Database** — `SystemSettings` row with the provider's `settingKey`
2. **Environment variable** — `process.env[envVar]`
3. **Empty string** — provider is unconfigured

### Per-Role Provider Overrides

Each agent role can use a different LLM provider. If no override is set for a role, it falls back to the global `llm_provider` setting.

```typescript
import { getLLMProvider, getRoleProvider, setRoleProvider } from '@ordinatio/settings';

// Global provider
const global = await getLLMProvider(db);     // => 'claude'

// Role-specific override (null = no override, use global)
const coo = await getRoleProvider(db, 'coo'); // => 'openai' or null

// Set a role override
await setRoleProvider(db, 'bookkeeper', 'gemini');

// Clear a role override (revert to global)
await setRoleProvider(db, 'bookkeeper', '');
```

### Key Masking

API keys are masked for safe display in the UI:

```typescript
import { maskApiKey } from '@ordinatio/settings';

maskApiKey('sk-ant-api03-abcdef...wxyz5678');
// => 'sk-ant...5678'

maskApiKey('short-key');   // <= 12 chars
// => '****-key'

maskApiKey('');
// => ''
```

### AI Settings Bundle

`getAISettings()` returns everything the Settings UI page needs in one call:

```typescript
import { getAISettings } from '@ordinatio/settings';

const settings = await getAISettings(db);
// => {
//   provider: 'claude',                    // Active global provider
//   providers: [                           // All 6 providers with status
//     { id: 'claude', name: 'Anthropic Claude', maskedKey: 'sk-ant...5678', configured: true, placeholder: 'sk-ant-api03-...' },
//     { id: 'openai', name: 'OpenAI GPT', maskedKey: '', configured: false, placeholder: 'sk-proj-...' },
//     ...
//   ],
//   roleOverrides: {                       // Per-role overrides (only set ones)
//     coo: 'openai',
//   },
// }
```

---

## User Preferences

Per-user preferences stored in the `UserPreference` table.

### Reply Layout

The only preference currently stored is `replyLayout`, which controls how the email reply composer opens:

| Value | Behavior |
|-------|----------|
| `MODAL` (default) | Traditional modal dialog over the email |
| `SPLIT_HORIZONTAL` | Email on top, reply editor on bottom |
| `SPLIT_VERTICAL` | Email on left, reply editor on right |
| `POPOUT` | Opens reply in a new browser window |

### Functions

```typescript
import { getPreferences, updatePreferences, getReplyLayout } from '@ordinatio/settings';

// Get preferences (auto-creates with defaults if first access)
const prefs = await getPreferences(db, userId);
// => { id: 'clx...', userId: 'usr_123', replyLayout: 'MODAL', createdAt: ..., updatedAt: ... }

// Update preferences
await updatePreferences(db, userId, { replyLayout: 'SPLIT_HORIZONTAL' });

// Shortcut: get just the reply layout
const layout = await getReplyLayout(db, userId);
// => 'SPLIT_HORIZONTAL'
```

**Auto-creation:** `getPreferences()` creates a default `UserPreference` record the first time a user's preferences are requested. No seed data needed.

---

## Database Interface

The package defines two minimal interfaces instead of depending on Prisma:

### SettingsDb

Used by `settings.ts` and `ai-settings.ts`:

```typescript
interface SettingsDb {
  systemSettings: {
    findUnique(args: {
      where: { key: string }
    }): Promise<{ key: string; value: string; description?: string | null } | null>;

    upsert(args: {
      where: { key: string };
      create: { key: string; value: string; description?: string };
      update: { value: string; description?: string };
    }): Promise<{ key: string; value: string }>;

    findMany(args?: {
      take?: number
    }): Promise<Array<{ key: string; value: string }>>;
  };
}
```

### UserPreferenceDb

Used by `user-preferences.ts`:

```typescript
interface UserPreferenceDb {
  userPreference: {
    findUnique(args: { where: { userId: string } }): Promise<UserPreference | null>;
    create(args: { data: { userId: string; replyLayout: ReplyLayout } }): Promise<UserPreference>;
    upsert(args: {
      where: { userId: string };
      update: { replyLayout?: ReplyLayout };
      create: { userId: string; replyLayout: ReplyLayout };
    }): Promise<UserPreference>;
  };
}
```

**Any Prisma client with `systemSettings` and `userPreference` models will satisfy these interfaces automatically.** You can also pass a plain object for testing:

```typescript
const mockDb: SettingsDb = {
  systemSettings: {
    findUnique: async () => ({ key: 'llm_provider', value: 'claude' }),
    upsert: async (args) => ({ key: args.where.key, value: args.create.value }),
    findMany: async () => [],
  },
};
```

---

## Prisma Schema

The `settings.prisma` fragment defines the database models:

```prisma
model SystemSettings {
  key         String    @id          // Setting key (unique identifier)
  value       String    @db.Text     // Setting value (stored as text)
  description String?               // Human-readable description
  updatedAt   DateTime  @updatedAt   // Last modified timestamp
}

model UserPreference {
  id          String      @id @default(cuid())
  userId      String      @unique     // One preference record per user
  replyLayout ReplyLayout @default(MODAL)
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt
}

enum ReplyLayout {
  MODAL
  SPLIT_HORIZONTAL
  SPLIT_VERTICAL
  POPOUT
}
```

**Note:** `SystemSettings.key` is the `@id` — there is no separate `id` column. The key itself is the primary key.

When used with `@ordinatio/domus`, this schema fragment is automatically merged with the main schema during `prisma db push`.

---

## Validation

Zod schemas for validating API request bodies:

```typescript
import { SettingKeySchema, UpdateSettingSchema } from '@ordinatio/settings';

// Validate a setting key
SettingKeySchema.parse('llm_provider');          // ok
SettingKeySchema.parse('invalid_key');           // throws ZodError

// Validate an update request
UpdateSettingSchema.parse({ key: 'llm_provider', value: 'openai' });    // ok
UpdateSettingSchema.parse({ key: 'llm_provider', value: true });        // ok (coerced to 'true')
UpdateSettingSchema.parse({ key: 'llm_provider', value: 42 });          // ok (coerced to '42')
```

The `UpdateSettingSchema` accepts `string | boolean | number` for the value field and auto-coerces to string via `.transform(String)`.

---

## Error Registry

25 error codes across 4 categories, following the System 1701 Error Reference System (Rule 8):

| Code | HTTP | Severity | Description |
|------|------|----------|-------------|
| **SETTINGS_100** | 401 | warn | Unauthenticated request to settings endpoint |
| **SETTINGS_101** | 500 | error | Failed to retrieve system settings from database |
| **SETTINGS_102** | 500 | error | Failed to update a system setting |
| **SETTINGS_103** | 429 | warn | Rate limit exceeded for settings update |
| **SETTINGS_104** | 500 | error | Failed to read individual setting by key |
| **SETTINGS_200** | 400 | warn | Settings update request body validation failed |
| **SETTINGS_201** | 400 | warn | Setting key is not in the allowed enum list |
| **SETTINGS_202** | 400 | warn | AI settings update validation failed |
| **SETTINGS_203** | 400 | warn | Invalid LLM provider ID supplied |
| **SETTINGS_204** | 400 | warn | Invalid boolean value for boolean setting |
| **SETTINGS_300** | 401 | warn | Unauthenticated request to AI settings endpoint |
| **SETTINGS_301** | 500 | error | Failed to retrieve AI settings |
| **SETTINGS_302** | 500 | error | Failed to save AI setting or clear provider cache |
| **SETTINGS_400** | 500 | error | Failed to retrieve user preferences |
| **SETTINGS_401** | 500 | error | Failed to update user preferences |

Each error entry includes `file`, `function`, `httpStatus`, `severity`, `recoverable`, `description`, and `diagnosis[]` (troubleshooting steps).

### Usage

```typescript
import { settingsError, SETTINGS_ERRORS } from '@ordinatio/settings';

try {
  const value = await getSetting(db, key);
} catch (err) {
  const { code, ref } = settingsError('SETTINGS_104');
  // code: 'SETTINGS_104'
  // ref:  'SETTINGS_104-20260307T143000'  (timestamped for log correlation)

  const meta = SETTINGS_ERRORS.SETTINGS_104;
  // meta.description: 'Failed to read individual setting by key.'
  // meta.diagnosis: ['Database error in findUnique()...', ...]

  console.error(`[${ref}] ${meta.description}`, err);
  return Response.json({ error: meta.description, ref }, { status: meta.httpStatus });
}
```

---

## Callbacks

Mutation functions accept an optional `SettingsCallbacks` parameter. This is how the consuming application wires in side effects (activity logging, security events, analytics) without the package knowing about those systems.

```typescript
interface SettingsCallbacks {
  onSettingChanged?: (key: string, value: string, userId?: string) => Promise<void>;
  onPreferenceChanged?: (userId: string, changes: Record<string, unknown>) => Promise<void>;
}
```

### Example: Activity logging

```typescript
import { setSetting, SETTINGS_KEYS } from '@ordinatio/settings';

await setSetting(db, SETTINGS_KEYS.LLM_PROVIDER, 'openai', 'Active provider', {
  onSettingChanged: async (key, value) => {
    await createActivity(db, {
      action: 'SETTING_CHANGED',
      severity: 'info',
      metadata: { key, value },
      userId: session.user.id,
    });
  },
});
```

### When callbacks are called

| Function | Callback | When |
|----------|----------|------|
| `setSetting()` | `onSettingChanged` | After successful DB upsert |
| `setBooleanSetting()` | `onSettingChanged` | After successful DB upsert (value is `'true'` or `'false'`) |
| `setAISetting()` | `onSettingChanged` | After successful DB upsert (via `setSetting`) |
| `setRoleProvider()` | `onSettingChanged` | After successful DB upsert (via `setAISetting`) |
| `updatePreferences()` | `onPreferenceChanged` | After successful DB upsert |

Read-only functions (`getSetting`, `getBooleanSetting`, `getAllSettings`, `getAISettings`, `getPreferences`, `getReplyLayout`) never invoke callbacks.

---

## Domus Integration

When used with `@ordinatio/domus`, the settings module is automatically registered and wired:

```typescript
import { createDomus } from '@ordinatio/domus';

const domus = await createDomus({
  databaseUrl: process.env.DATABASE_URL,
  modules: ['settings'],  // or include alongside other modules
});

// Use the pre-wired API (db is already injected)
const provider = await domus.settings.getSetting('llm_provider');
await domus.settings.setSetting('llm_provider', 'openai');
const aiSettings = await domus.settings.getAISettings();
const prefs = await domus.settings.getPreferences(userId);
```

### DomusSettingsApi

The Domus factory exposes this interface:

```typescript
interface DomusSettingsApi {
  getSetting: (key: string) => Promise<string>;
  getBooleanSetting: (key: string) => Promise<boolean>;
  setSetting: (key: string, value: string, description?: string) => Promise<void>;
  setBooleanSetting: (key: string, value: boolean, description?: string) => Promise<void>;
  getAllSettings: () => Promise<Record<string, string>>;
  getAISettings: () => Promise<unknown>;
  getPreferences: (userId: string) => Promise<unknown>;
  updatePreferences: (userId: string, data: Record<string, unknown>) => Promise<unknown>;
  raw: unknown;  // Access the raw module for advanced usage
}
```

### Seed Data

When the Domus setup wizard runs, the settings module seeds two default rows:

| Key | Value | Description |
|-----|-------|-------------|
| `admin_feed_enabled` | `true` | Enable admin activity feed |
| `llm_provider` | `claude` | Active LLM provider |

The seed function is idempotent — it checks `systemSettings.count()` and skips if rows already exist.

---

## App-Layer Bridge (System 1701)

In System 1701, the settings module is consumed through a thin bridge at `apps/web/src/services/settings/index.ts`. The bridge is pure re-exports — no wrapping or callback injection needed for most functions:

```typescript
// apps/web/src/services/settings/index.ts
export {
  getSetting, getBooleanSetting, setSetting, setBooleanSetting, getAllSettings, SETTINGS_KEYS,
  getLLMProvider, getRoleProvider, setRoleProvider, getApiKey, setAISetting, getAISettings,
  maskApiKey, ALL_PROVIDER_IDS, PROVIDER_CONFIG,
  getPreferences, updatePreferences, getReplyLayout,
  settingsError, SETTINGS_ERRORS,
  SettingKeySchema, UpdateSettingSchema,
} from '@ordinatio/settings';
```

### Backward Compatibility

The old service files still exist as thin re-exports so existing imports continue to work:

| Old Import Path | Now Re-exports From |
|----------------|---------------------|
| `@/services/settings.service` | `@/services/settings` (bridge) |
| `@/services/ai-settings.service` | `@/services/settings` (bridge) |
| `@/services/user-preferences.service` | `@/services/settings` (bridge) |
| `@/lib/settings/errors` | `@ordinatio/settings` (direct) |
| `@/lib/validation/settings.schema` | `@ordinatio/settings` (direct) |

No consumer files needed import path changes.

---

## Testing

```bash
# Run all 115 tests
pnpm --filter @ordinatio/settings test:run

# Watch mode
pnpm --filter @ordinatio/settings test
```

### Test Coverage

| File | Tests | What's Covered |
|------|-------|----------------|
| `settings.test.ts` | 27 | getSetting defaults, setSetting upsert, boolean settings, getAllSettings merge, AI settings (maskApiKey, PROVIDER_CONFIG, getLLMProvider, getRoleProvider, getApiKey, getAISettings bundle), error registry (all 25 codes, timestamped refs), validation schemas |
| `user-preferences.test.ts` | 13 | getPreferences auto-create, updatePreferences upsert, getReplyLayout, callback invocation |

Tests use mock `SettingsDb` / `UserPreferenceDb` objects — no database required.

### System 1701 Integration Tests

In System 1701, additional tests verify the bridge and API routes:

```bash
# Service tests (14 settings + 12 preferences)
pnpm --filter web vitest run src/services/settings.service.test.ts
pnpm --filter web vitest run src/services/user-preferences.service.test.ts

# Mob tests (30 adversarial tests)
pnpm --filter web vitest run src/test/mob/settings/

# AI settings page component tests (8)
pnpm --filter web vitest run src/app/dashboard/settings/ai/page.test.tsx
```

---

## API Reference

### Core Settings

| Function | Signature | Returns |
|----------|-----------|---------|
| `getSetting` | `(db: SettingsDb, key: SettingKey) => Promise<string>` | Setting value or default |
| `getBooleanSetting` | `(db: SettingsDb, key: SettingKey) => Promise<boolean>` | `true` if value is `'true'` |
| `setSetting` | `(db: SettingsDb, key: SettingKey, value: string, description?: string, callbacks?: SettingsCallbacks) => Promise<void>` | — |
| `setBooleanSetting` | `(db: SettingsDb, key: SettingKey, value: boolean, description?: string, callbacks?: SettingsCallbacks) => Promise<void>` | — |
| `getAllSettings` | `(db: SettingsDb) => Promise<Record<string, string>>` | All settings (defaults + DB) |

### AI Settings

| Function | Signature | Returns |
|----------|-----------|---------|
| `getLLMProvider` | `(db: SettingsDb) => Promise<string>` | Provider ID (e.g., `'claude'`) |
| `getRoleProvider` | `(db: SettingsDb, roleId: string) => Promise<string \| null>` | Override or `null` |
| `setRoleProvider` | `(db: SettingsDb, roleId: string, providerId: string, callbacks?: SettingsCallbacks) => Promise<void>` | — |
| `getApiKey` | `(db: SettingsDb, provider: ProviderId) => Promise<string>` | Raw API key or `''` |
| `setAISetting` | `(db: SettingsDb, key: string, value: string, callbacks?: SettingsCallbacks) => Promise<void>` | — |
| `getAISettings` | `(db: SettingsDb) => Promise<AISettings>` | Full AI config for UI |
| `maskApiKey` | `(key: string) => string` | Masked key (pure function) |

### User Preferences

| Function | Signature | Returns |
|----------|-----------|---------|
| `getPreferences` | `(db: UserPreferenceDb, userId: string) => Promise<UserPreference>` | Prefs (auto-created if missing) |
| `updatePreferences` | `(db: UserPreferenceDb, userId: string, data: { replyLayout?: ReplyLayout }, callbacks?: SettingsCallbacks) => Promise<UserPreference>` | Updated prefs |
| `getReplyLayout` | `(db: UserPreferenceDb, userId: string) => Promise<ReplyLayout>` | Layout enum value |

### Constants

| Export | Type | Description |
|--------|------|-------------|
| `SETTINGS_KEYS` | `Record<string, SettingKey>` | All 10 setting key constants |
| `ALL_PROVIDER_IDS` | `ProviderId[]` | `['claude', 'openai', 'gemini', 'deepseek', 'mistral', 'grok']` |
| `PROVIDER_CONFIG` | `Record<ProviderId, ProviderConfig>` | Static config per provider |
| `SETTINGS_ERRORS` | `Record<string, ErrorEntry>` | 25 error definitions |

### Types

| Type | Description |
|------|-------------|
| `SettingsDb` | Minimal DB interface for settings operations |
| `UserPreferenceDb` | Minimal DB interface for user preferences |
| `SettingKey` | Union of all valid setting key strings |
| `ReplyLayout` | `'MODAL' \| 'SPLIT_HORIZONTAL' \| 'SPLIT_VERTICAL' \| 'POPOUT'` |
| `ProviderId` | `'claude' \| 'openai' \| 'gemini' \| 'deepseek' \| 'mistral' \| 'grok'` |
| `ProviderConfig` | `{ settingKey, envVar, name, placeholder }` |
| `ProviderInfo` | `{ id, name, maskedKey, configured, placeholder }` |
| `AISettings` | `{ provider, providers: ProviderInfo[], roleOverrides }` |
| `UserPreference` | `{ id, userId, replyLayout, createdAt, updatedAt }` |
| `SettingsCallbacks` | `{ onSettingChanged?, onPreferenceChanged? }` |
| `SettingKeyValue` | Zod inferred type from `SettingKeySchema` |
| `UpdateSettingInput` | Zod inferred type from `UpdateSettingSchema` |

---

## Pugil Integration

This package includes a Pugil reporter that generates Council-consumable `trial_report` artifacts from test results.

```bash
# Normal test run (no Pugil overhead)
pnpm --filter @ordinatio/settings test:run

# With Pugil trial report generation
PUGIL_ENABLED=true pnpm --filter @ordinatio/settings test:run

# With Council cycle integration
PUGIL_ENABLED=true PUGIL_CYCLE_ID=cycle-settings-v1 pnpm --filter @ordinatio/settings test:run
```

- **Config:** `src/pugil.config.ts` — maps test files to categories (unit, integration, adversarial, chaos, concurrency)
- **Reporter:** `src/pugil-reporter.ts` — Vitest custom reporter, writes to `pugil-reports/`
- **Types:** `PugilTestResult`, `PugilTestCategory` from `@ordinatio/core`

## License

MIT
