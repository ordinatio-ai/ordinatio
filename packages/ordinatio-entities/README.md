# @ordinatio/entities

Entity knowledge, agent intelligence, notes, and contacts — the knowledge layer for any Ordinatio application.

## What's in the box

| Module | Models | Purpose |
|--------|--------|---------|
| **Knowledge** | `EntityFieldDefinition`, `KnowledgeLedgerEntry`, `SearchQueryLog`, `SearchPattern` | Structured entity knowledge with immutable append-only ledger |
| **Knowledge+** | Time-travel, truth scoring, decay, branching, shadow graph, reflection, observer, ghost fields, health | Active knowledge reasoning — the module *thinks about what it knows* |
| **Agent** | `AgentInteraction`, `AgentSuggestion`, `AgentKnowledge`, `AgentPreference` | Agent intelligence: knowledge base, interaction analytics, proactive suggestions |
| **Notes** | `Note`, `NoteAttachment` | Entity-agnostic notes with attachments |
| **Contacts** | `Contact`, `ContactTag` | Contact CRUD with find-or-create for email sync |

12 Prisma models, 1 enum, 45 error codes, 409 tests.

## Installation

```bash
npm install @ordinatio/entities
```

Or via Domus:

```bash
npx ordinatio add entities
```

## Quick Start

### Standalone

```typescript
import { PrismaClient } from '@prisma/client';
import {
  getFieldDefinitions,
  createFieldDefinition,
  setEntityFields,
  getEntityFields,
  createNote,
  getAllContacts,
  createContact,
  logInteraction,
  queryKnowledge,
} from '@ordinatio/entities';

const db = new PrismaClient();

// --- Entity Knowledge ---
// Define what fields an entity type can have
await createFieldDefinition(db, {
  entityType: 'client',
  key: 'preferred_fabric',
  label: 'Preferred Fabric',
  dataType: 'text',
  category: 'preferences',
});

// Set field values (immutable ledger — old values are superseded, never deleted)
await setEntityFields(db, 'client', 'client-123', {
  preferred_fabric: 'Loro Piana cashmere',
  budget_range: '$5000-8000',
}, 'agent', 'interaction-456');

// Read current values
const fields = await getEntityFields(db, 'client', 'client-123');

// --- Notes ---
await createNote(db, {
  entityType: 'client',
  entityId: 'client-123',
  content: 'Prefers navy blue suits for business meetings.',
  source: 'AGENT',
});

// --- Contacts ---
const contact = await createContact(db, {
  email: 'john@example.com',
  name: 'John Doe',
  source: 'MANUAL',
});

// --- Agent Intelligence ---
await logInteraction(db, {
  userId: 'user-1',
  query: 'Show me overdue orders',
  toolsUsed: ['listOrders', 'getOverdueTasks'],
});

const knowledge = await queryKnowledge(db, {
  entity: 'fabric',
  field: 'type',
});
```

### With Domus

```typescript
import { createDomus } from '@ordinatio/domus';

const app = await createDomus({
  modules: ['entities'],
});

const fields = await app.entities.getEntityFields('client', 'client-123');
await app.entities.createNote({ entityType: 'client', entityId: 'client-123', content: '...' });
```

## API Reference

### Knowledge Module

| Function | Type | Description |
|----------|------|-------------|
| `getFieldDefinitions(db, entityType?, status?)` | Query | List field definitions |
| `getFieldDefinitionById(db, id)` | Query | Get a single field definition |
| `createFieldDefinition(db, input, callbacks?)` | Mutation | Create a field definition |
| `updateFieldDefinition(db, id, input, callbacks?)` | Mutation | Update a field definition |
| `getEntityFields(db, entityType, entityId)` | Query | Get current field values for an entity |
| `setEntityFields(db, entityType, entityId, fields, source, sourceId?, confidence?, setBy?, callbacks?)` | Mutation | Set field values (append-only ledger) |
| `getFieldHistory(db, entityType, entityId, fieldId?, limit?)` | Query | Get historical field values |
| `searchByFields(db, entityType, filters, limit?)` | Query | Search entities by field values |
| `logSearchQuery(db, input)` | Mutation | Log a search query (best-effort) |
| `getWeekOfYear(date)` | Pure | Calculate ISO week number |

### Knowledge+ (Active Reasoning)

| Function | Type | Description |
|----------|------|-------------|
| `getKnowledgeAt(db, entityType, entityId, timestamp)` | Query | Reconstruct entity state at a point in time |
| `getFieldValueAt(db, entityType, entityId, fieldKey, timestamp)` | Query | Single field value at a point in time |
| `getKnowledgeTimeline(db, entityType, entityId, from, to, limit?)` | Query | Timeline of all changes in a date range |
| `computeTruthScore(assertions, now?)` | Pure | Weighted truth score: T = Σ(C×R×T) / Σ(C×R) |
| `computeRecencyFactor(createdAt, now?, maxAgeDays?)` | Pure | Exponential recency decay (1.0 → 0) |
| `computeComplexityScore(fieldsUsed, fieldsAvailable, categoriesUsed, maxCategories)` | Pure | Entity knowledge completeness score |
| `computeEntityTruthScores(db, entityType, entityId)` | Query | Truth scores for all fields on an entity |
| `computeDecayedConfidence(confidence, createdAt, halfLifeDays, now?)` | Pure | Exponential confidence decay: C × 0.5^(age/halfLife) |
| `isStale(confidence, createdAt, halfLifeDays, threshold?, now?)` | Pure | Check if decayed confidence is below threshold |
| `getStaleFields(db, entityType, entityId, threshold?)` | Query | All stale fields for an entity |
| `formatStalenessWarnings(staleFields)` | Pure | Agent-friendly staleness warning strings |
| `shouldBranch(newConfidence, existingConfidence?, threshold?)` | Pure | Should this write trigger validation? |
| `setEntityFieldsWithBranching(db, entityType, entityId, fields, source, confidence, options?)` | Mutation | Set fields with human-in-the-loop validation |
| `findRelatedEntities(db, entityType, entityId, options?)` | Query | Discover implicit relationships via shared field values |
| `getEntityRelationships(db, entityType, entityId, limit?)` | Query | Get all relationships for an entity |
| `computeRelationshipStrength(sharedFields, totalFieldsOnSource)` | Pure | Relationship strength from shared fields |
| `detectConflicts(db, entityType, entityId, rules?)` | Query | Check entity for contradictions |
| `scanForConflicts(db, entityType, rules?, limit?)` | Query | Batch contradiction scan across all entities |
| `evaluateConflictRule(rule, fields)` | Pure | Evaluate a single conflict rule |
| `evaluateConstraint(constraint, entityFields)` | Pure | Evaluate a single field constraint |
| `checkConstraints(db, entityType, entityId)` | Query | Check all constraints for an entity |
| `fireObservers(db, entityType, entityId, writtenFields, callbacks?)` | Mutation | Fire constraint observers after writes |
| `predictGhostFields(db, entityType, entityId, options?)` | Query | Predict missing fields from co-occurrence |
| `writeGhostFields(db, entityType, entityId, predictions, callbacks?)` | Mutation | Write predicted values with low confidence |
| `buildCoOccurrenceMap(db, entityType, fieldKeyA, fieldKeyB, minOccurrences?)` | Query | Co-occurrence statistics between two fields |
| `computeOverallScore(completeness, freshness, conflictRate, truthAverage)` | Pure | Weighted composite health score |
| `computeEntityHealth(db, entityType, entityId, conflictRules?)` | Query | Full health report for one entity |
| `getEntityTypeHealth(db, entityType, options?)` | Query | Aggregate health across all entities of a type |

### Agent Module

| Function | Type | Description |
|----------|------|-------------|
| `queryKnowledge(db, input, seedProvider?)` | Query | Query agent knowledge base |
| `createKnowledgeEntry(db, input)` | Mutation | Add a knowledge entry |
| `updateKnowledgeEntry(db, id, input)` | Mutation | Update a knowledge entry |
| `deleteKnowledgeEntry(db, id)` | Mutation | Delete a knowledge entry |
| `ensureKnowledgeDefaults(db, seedProvider?)` | Mutation | Seed defaults (idempotent) |
| `resetKnowledgeDefaults(db, seedProvider?)` | Mutation | Reset to seed data |
| `getPreferences(db, input)` | Query | Get agent preferences |
| `setPreference(db, input)` | Mutation | Set a preference (upsert) |
| `deletePreference(db, id)` | Mutation | Delete a preference |
| `logInteraction(db, input)` | Mutation | Log an agent interaction |
| `markSatisfied(db, id, satisfied)` | Mutation | Mark interaction satisfaction |
| `getTopicDistribution(db, days?)` | Query | Topic distribution stats |
| `getRecentInteractions(db, userId, limit?)` | Query | Recent interactions |
| `getInteractionCount(db, days?)` | Query | Interaction count |
| `classifyIntent(query)` | Pure | Classify query intent |
| `extractTopic(query)` | Pure | Extract topic from query |
| `extractModules(toolNames)` | Pure | Map tools to modules |
| `analyzeAndSuggest(db)` | Mutation | Generate suggestions from patterns |
| `getSuggestions(db, status?)` | Query | Get suggestions |
| `dismissSuggestion(db, id, userId)` | Mutation | Dismiss a suggestion |
| `approveSuggestion(db, id)` | Mutation | Approve a suggestion |

### Notes Module

| Function | Type | Description |
|----------|------|-------------|
| `createNote(db, input, callbacks?)` | Mutation | Create a note with optional attachments |
| `updateNote(db, noteId, entityId, input, callbacks?)` | Mutation | Update a note |
| `getNotes(db, options)` | Query | List notes with cursor pagination |
| `deleteNote(db, noteId, entityId)` | Mutation | Delete a note |

### Contacts Module

| Function | Type | Description |
|----------|------|-------------|
| `getAllContacts(db, options?)` | Query | List contacts with filters |
| `getContactById(db, id)` | Query | Get a contact by ID |
| `getContactByEmail(db, email)` | Query | Find contact by email |
| `createContact(db, params, callbacks?)` | Mutation | Create a contact |
| `updateContact(db, id, data)` | Mutation | Update a contact |
| `deleteContact(db, id)` | Mutation | Delete a contact |
| `findOrCreateContact(db, email, name?, source?)` | Mutation | Find or create by email |

## Callback Injection

Mutations accept optional callbacks for app-specific side effects:

```typescript
import type { MutationCallbacks } from '@ordinatio/entities';

const callbacks: MutationCallbacks = {
  logActivity: async (action, description, data) => {
    // Wire to your activity/audit system
    await myActivityService.log(action, description, data);
  },
  emitEvent: async (type, data) => {
    // Wire to your event bus
    await myEventBus.emit(type, data);
  },
};

await createFieldDefinition(db, input, callbacks);
```

Notes support extended callbacks for structured knowledge extraction:

```typescript
import type { NoteKnowledgeCallbacks } from '@ordinatio/entities';

const noteCallbacks: NoteKnowledgeCallbacks = {
  logActivity: async (action, description) => { /* ... */ },
  setEntityFields: async (entityType, entityId, fields, source) => {
    // Auto-extract structured knowledge from notes
    await setEntityFields(db, entityType, entityId, fields, source);
  },
};

await createNote(db, { entityType: 'client', entityId: 'c1', content: '...' }, noteCallbacks);
```

## Error Codes

### KNOWLEDGE_300–361 (Entity Knowledge)

| Code | Description |
|------|-------------|
| `KNOWLEDGE_300` | Failed to list field definitions |
| `KNOWLEDGE_301` | Failed to create field definition |
| `KNOWLEDGE_302` | Failed to update field definition |
| `KNOWLEDGE_303` | Field definition not found |
| `KNOWLEDGE_304` | Failed to deactivate field definition |
| `KNOWLEDGE_305` | Failed to search by field values |
| `KNOWLEDGE_310` | Failed to get entity fields |
| `KNOWLEDGE_311` | Failed to set entity fields |
| `KNOWLEDGE_312` | Failed to get field history |
| `KNOWLEDGE_313` | Unknown field key |
| `KNOWLEDGE_314` | Failed to supersede old ledger entry |
| `KNOWLEDGE_320` | Failed to log search query |
| `KNOWLEDGE_321` | Failed to process search query log |
| `KNOWLEDGE_330` | Knowledge batch job failed |
| `KNOWLEDGE_331` | Failed to extract fields from notes |
| `KNOWLEDGE_332` | Failed to build temporal patterns |
| `KNOWLEDGE_340` | Failed to reconstruct knowledge at point in time |
| `KNOWLEDGE_341` | Invalid date range for timeline query |
| `KNOWLEDGE_342` | Failed to compute stale fields |
| `KNOWLEDGE_343` | Failed to write fields with branching |
| `KNOWLEDGE_344` | Validation callback failed during branching |
| `KNOWLEDGE_345` | Failed to discover entity relationships |
| `KNOWLEDGE_346` | Failed to detect contradictions |
| `KNOWLEDGE_347` | Failed to scan entities for contradictions |
| `KNOWLEDGE_348` | Failed to compute truth scores |
| `KNOWLEDGE_350` | Failed to evaluate field constraints |
| `KNOWLEDGE_351` | Observer callback failed |
| `KNOWLEDGE_352` | Invalid constraint definition |
| `KNOWLEDGE_355` | Failed to predict ghost fields |
| `KNOWLEDGE_356` | Failed to write ghost fields |
| `KNOWLEDGE_360` | Failed to compute entity health |
| `KNOWLEDGE_361` | Failed to compute entity type health |

### AGENTKNOW_400–412 (Agent Intelligence)

| Code | Description |
|------|-------------|
| `AGENTKNOW_400` | Failed to query knowledge |
| `AGENTKNOW_401` | Knowledge entry not found |
| `AGENTKNOW_402` | Failed to create knowledge entry |
| `AGENTKNOW_403` | Failed to update knowledge entry |
| `AGENTKNOW_404` | Failed to delete knowledge entry |
| `AGENTKNOW_405` | Failed to reset knowledge defaults |
| `AGENTKNOW_406` | Failed to get preferences |
| `AGENTKNOW_407` | Failed to set preference |
| `AGENTKNOW_408` | Failed to delete preference |
| `AGENTKNOW_409` | Failed to log interaction |
| `AGENTKNOW_410` | Failed to get suggestions |
| `AGENTKNOW_411` | Failed to dismiss suggestion |
| `AGENTKNOW_412` | Failed to approve suggestion |

## Prisma Schema

The standalone schema fragment is at `packages/ordinatio-domus/src/schema/entities.prisma` (12 models, 1 enum). Cross-domain foreign keys (to User, Client, Tag, EmailMessage) become plain `String?` for standalone use.

## Tests

```bash
pnpm --filter @ordinatio/entities test:run
# 409 tests across 20 files
```

## Pugil Integration

This package includes a Pugil reporter that generates Council-consumable `trial_report` artifacts from test results.

```bash
# Normal test run (no Pugil overhead)
pnpm --filter @ordinatio/entities test:run

# With Pugil trial report generation
PUGIL_ENABLED=true pnpm --filter @ordinatio/entities test:run

# With Council cycle integration
PUGIL_ENABLED=true PUGIL_CYCLE_ID=cycle-entities-v1 pnpm --filter @ordinatio/entities test:run
```

- **Config:** `src/pugil.config.ts` — maps test files to categories (unit, integration, adversarial, chaos, concurrency)
- **Reporter:** `src/pugil-reporter.ts` — Vitest custom reporter, writes to `pugil-reports/`
- **Types:** `PugilTestResult`, `PugilTestCategory` from `@ordinatio/core`
