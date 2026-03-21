# @ordinatio/agent

LLM-agnostic agent framework for Node.js applications. Provides the orchestration infrastructure — provider abstraction, tool/role registries, memory, guardrails, and an execution loop — without opinions about what your agents do. You bring the tools, roles, and business logic. The framework handles everything else.

---

## What This Module Does

This is the framework layer for building AI agents. It answers: how do you connect to an LLM, give it tools, control what it can access, remember conversations, enforce approval gates, and run the conversation loop — without coupling to any specific LLM vendor, business domain, or application architecture?

The module ships with **zero tools** (except remember/recall/forget for memory) and **zero roles**. Your application registers its own tools and roles at startup. The framework provides the machinery.

| Question | How It's Answered |
|----------|-------------------|
| **Which LLM do I use?** | 6 built-in providers (Claude, OpenAI, Gemini, DeepSeek, Mistral, Grok) via `KeyProvider` callback. Per-role overrides. |
| **What can the agent do?** | Tool registry — apps register tools at startup. Covenant bridge for runtime capability discovery. |
| **Who is the agent?** | Role registry — apps register roles with goals, constraints, modules, approval gates. |
| **What is the agent NOT allowed to do?** | Guardrails (module toggles), provider trust policy (data sensitivity), approval gates (human checkpoints). |
| **How does the agent remember?** | 3-layer memory system (working/temporary/deep), tag-based retrieval, role-scoped, entity-linked. |
| **How does the conversation work?** | Orchestrator loop: resolve role → build prompt → LLM call → tool execution → approval check → repeat. |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                      @ordinatio/agent                             │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  ORCHESTRATOR (the execution loop)                         │  │
│  │                                                            │  │
│  │  1. Resolve role + tools (from registries)                 │  │
│  │  2. Build system prompt (role + memory + context)          │  │
│  │  3. Call LLM (via provider abstraction)                    │  │
│  │  4. Parse response (tool_use / end_turn / max_tokens)     │  │
│  │  5. Check approval gates (human checkpoint)                │  │
│  │  6. Execute tool (via ToolExecutor)                        │  │
│  │  7. Feed result back → repeat from step 3                 │  │
│  │  8. Return final response                                  │  │
│  └──────────────┬─────────────────────────────────────────────┘  │
│                 │                                                │
│  ┌──────────────▼───────┐  ┌─────────────────────┐              │
│  │  LLM PROVIDERS       │  │  REGISTRIES          │              │
│  │                      │  │                      │              │
│  │  Claude (Anthropic)  │  │  Tool Registry       │              │
│  │  OpenAI (GPT-4o)     │  │  (empty at startup)  │              │
│  │  Gemini (Google)     │  │                      │              │
│  │  DeepSeek            │  │  Role Registry       │              │
│  │  Mistral             │  │  (empty at startup)  │              │
│  │  Grok (xAI)          │  │                      │              │
│  │                      │  │  Covenant Bridge     │              │
│  │  Via KeyProvider     │  │  (injectable)        │              │
│  └──────────────────────┘  └─────────────────────┘              │
│                                                                  │
│  ┌──────────────────────┐  ┌─────────────────────┐              │
│  │  MEMORY SYSTEM       │  │  GUARDRAILS          │              │
│  │                      │  │                      │              │
│  │  3 layers:           │  │  Module toggles      │              │
│  │  working (<5 min)    │  │  Provider trust      │              │
│  │  temporary (expiring)│  │  Data sensitivity    │              │
│  │  deep (persistent)   │  │  Access denial msgs  │              │
│  │                      │  │                      │              │
│  │  Tag-based retrieval │  │  Approval gates      │              │
│  │  Role-scoped         │  │  (per-role)          │              │
│  │  Entity-linked       │  │                      │              │
│  │  Via AgentDb         │  │  Provider health     │              │
│  └──────────────────────┘  │  (circuit breaker)   │              │
│                            └─────────────────────┘              │
│                                                                  │
│  ┌──────────────────────┐                                       │
│  │  ERROR REGISTRY      │  43+ error codes (AGENT_800-862)      │
│  │  v2 diagnostics      │                                       │
│  └──────────────────────┘                                       │
└──────────────────────────────────────────────────────────────────┘
```

---

## How It Works (Concrete Example)

A user asks the COO agent: "What orders are pending placement?"

```
1. ORCHESTRATOR receives ChatRequest { role: 'coo', message: '...' }

2. RESOLVE ROLE
   └─ getRole('coo') → { modules: ['orders','email',...], toolNames: ['list_orders',...], approvalGates: [...] }

3. BUILD SYSTEM PROMPT
   ├─ Role identity: "You are the COO agent for 1701 Bespoke..."
   ├─ Goals: "Manage operations, triage emails, track orders..."
   ├─ Constraints: "Never send email without creating a draft first..."
   ├─ Approval gates: "Email sending requires human approval..."
   ├─ Memory context: (recent memories for this user/entity)
   └─ Entity context: (via AgentCallbacks.getEntityContext if available)

4. CALL LLM
   ├─ Provider: Claude (resolved via KeyProvider)
   ├─ Tools: formatted via toClaudeTools() (tool_use blocks)
   ├─ System prompt: assembled above
   └─ Response: { toolCalls: [{ name: 'list_orders', args: { status: 'TO_BE_PLACED' } }] }

5. CHECK APPROVAL GATES
   └─ 'list_orders' is NOT in approval gates → proceed

6. CHECK GUARDRAILS
   └─ 'orders' module is enabled → proceed

7. CHECK PROVIDER TRUST
   └─ list_orders.dataSensitivity = 'internal', claude trust = 'critical' → allowed

8. EXECUTE TOOL
   ├─ ToolExecutor.execute('list_orders', { status: 'TO_BE_PLACED' }, { sessionToken, authorizedTools })
   ├─ HttpToolExecutor → GET /api/orders?status=TO_BE_PLACED
   └─ Result: "3 orders pending: ORD-101, ORD-102, ORD-103"

9. FEED RESULT BACK → call LLM again with tool result

10. LLM RESPONSE: "There are 3 orders pending placement: ..."
    └─ stopReason: 'end_turn' → return to user
```

---

## Dependency Injection (4 Interfaces)

The framework never imports your app's services. You provide 4 interfaces:

### AgentDb — Memory Database

```typescript
interface AgentDb {
  agentMemory: { create, findMany, findUnique, delete, deleteMany, updateMany };
  tag: { findUnique, create };
  memoryTag: { create };
  $transaction<T>(fn: (tx: AgentDb) => Promise<T>): Promise<T>;
}
```

Pass your Prisma client — it satisfies this interface automatically.

### AgentCallbacks — Side Effects

```typescript
interface AgentCallbacks {
  logActivity?: (action, description, metadata?) => Promise<void>;
  logSecurityEvent?: (eventType, details) => Promise<void>;
  logGovernanceAudit?: (capabilityId, risk, actorId, inputs) => Promise<void>;
  logSearchQuery?: (query, entityType?) => Promise<void>;
  getEntityContext?: (entityType, entityId, tokenBudget) => Promise<string | null>;
  getTimeline?: (entityType, entityId, limit) => Promise<Array<{ createdAt; description }>>;
}
```

All optional, all best-effort. The orchestrator never crashes if a callback fails.

### KeyProvider — API Key Resolution

```typescript
interface KeyProvider {
  getProviderForRole?(roleId: string): Promise<string | null>;
  getGlobalProvider?(): Promise<string>;
  getApiKey?(providerId: string): Promise<string | null>;
}
```

Your app reads from settings/env/vault. The framework just asks for keys.

### ToolExecutor — How Tools Run

```typescript
interface ToolExecutor {
  execute(toolName, args, context: { sessionToken, authorizedToolNames }):
    Promise<{ result: string; display: ToolCallDisplay }>;
}
```

Default: `HttpToolExecutor` routes through your API endpoints. Override for testing or direct service calls.

---

## LLM Providers (6 Built-in)

| Provider | Model Default | SDK | Notes |
|----------|--------------|-----|-------|
| Claude | claude-sonnet-4-20250514 | `@anthropic-ai/sdk` | Tool use blocks, message grouping for multi-turn |
| OpenAI | gpt-4o | `openai` | Function calling format |
| Gemini | gemini-2.0-flash | `@google/generative-ai` | Gemini-specific message format |
| DeepSeek | deepseek-chat | OpenAI-compatible | `api.deepseek.com` |
| Mistral | mistral-large-latest | OpenAI-compatible | `api.mistral.ai` |
| Grok | grok-3 | OpenAI-compatible | `api.x.ai` |

All providers implement the same `LLMProvider` interface. The factory resolves which one to use via `KeyProvider`:

```typescript
const provider = await getProvider({ keyProvider, roleId: 'coo' });
// Checks: role-specific override → global setting → default (claude)
```

Provider cache is cleared when settings change (wired via Domus event bus: `settings.changed` → `clearProviderCache()`).

---

## Tool Registry

Empty at startup. Your app registers tools:

```typescript
import { registerTools } from '@ordinatio/agent';

registerTools([
  {
    name: 'list_orders',
    description: 'List orders with optional status filter',
    module: 'orders',
    method: 'GET',
    endpoint: '/api/orders',
    auth: 'session_cookie',
    params: [{ name: 'status', type: 'string', required: false, description: 'Filter by status' }],
    example: { status: 'TO_BE_PLACED' },
    responseShape: '{ orders: Order[] }',
    whenToUse: 'When the user asks about orders or order status',
    dataSensitivity: 'internal',
  },
  // ... more tools
]);
```

The only built-in tools are **remember**, **recall**, and **forget** (memory operations).

---

## Role Registry

Empty at startup. Your app registers roles:

```typescript
import { registerRole } from '@ordinatio/agent';

registerRole({
  id: 'coo',
  name: 'COO Agent',
  description: 'Operations manager for the business',
  goals: ['Triage vendor emails', 'Track order placement', 'Monitor fabric stock'],
  constraints: ['Never send email without creating a draft first', 'Always verify before updating order status'],
  modules: ['email', 'orders', 'clients', 'tasks', 'fabric'],
  toolNames: ['list_orders', 'get_order', 'search_clients', 'send_email', ...],
  approvalGates: [
    { action: 'send_email', reason: 'Drafts must be reviewed', prompt: 'Review this email draft before sending?' },
  ],
  contextDocument: '/lib/agents/COO_CONTEXT.md',
  covenantModules: { email: 'email-engine', clients: 'entity-registry' },
});
```

Use `buildCompositeRole('general', ['coo', 'bookkeeper'])` to merge multiple roles into one.

---

## Guardrails

### Module Toggles
Admin-configurable per-module access. Tools from disabled modules are filtered out. Memory, auth, and chat are always enabled.

### Provider Trust Policy
Each tool declares `dataSensitivity` (none/internal/sensitive/critical). Each provider has a trust level. The orchestrator blocks execution if the provider isn't trusted for the tool's sensitivity.

```typescript
// App overrides the default trust map:
const trustMap = {
  deepseek: { maxDataSensitivity: 'none' },     // DeepSeek: public data only
  claude: { maxDataSensitivity: 'critical' },     // Claude: full access
};
```

### Approval Gates
Defined per-role. Checked before tool execution. Returns a pending approval state to the UI for human decision.

---

## Memory System

Three layers:

| Layer | Lifetime | Use Case |
|-------|----------|----------|
| **WORKING** | < 5 minutes | Current conversation context (not persisted — handled by orchestrator message history) |
| **TEMPORARY** | Hours to days (expires) | Short-term notes ("client mentioned they'll be traveling next week") |
| **DEEP** | Permanent | Long-term knowledge ("client prefers slim fit, navy fabrics") |

Features:
- Tag-based retrieval (`recallMemories({ tags: ['fabric', 'preference'] })`)
- Role-scoped (bookkeeper sees different memories than COO)
- Entity-linked (memories attached to specific clients, orders)
- Token budget management (`estimateTokens()` keeps memory within LLM context limits)

```typescript
await createMemory(db, {
  layer: 'DEEP',
  role: 'coo',
  source: 'conversation',
  summary: 'Client prefers slim fit navy suits',
  clientId: 'client-123',
  tags: ['preference', 'fit', 'fabric'],
  createdBy: 'user-456',
});

const memories = await recallMemories(db, {
  role: 'coo',
  clientId: 'client-123',
  tags: ['preference'],
  limit: 10,
});
```

---

## Covenant Bridge (Capability Discovery)

Optional integration with `@ordinatio/core`'s Module Covenant system. When a `CovenantProvider` is passed, the tool registry can auto-discover capabilities at runtime instead of relying solely on hardcoded tool lists.

```typescript
import { registerCovenant, createCovenantProvider } from '@ordinatio/agent';

// Register covenants (from @ordinatio/core)
registerCovenant(emailEngineCovenant);
registerCovenant(taskEngineCovenant);

// Create a provider for the orchestrator
const covenantProvider = createCovenantProvider();

// Tools are now discoverable by role's covenantModules mapping
// Adding a new module = automatic agent tool discovery (zero code changes)
```

Risk-filtered: `getCapabilitiesForRole(['email-engine'], 'act')` returns only observe + suggest + act capabilities, not govern.

---

## Error Codes

43+ error codes (AGENT_800-862) using the enhanced v2 builder:

```typescript
agentError('AGENT_836', { role: 'coo', tool: 'send_email', reason: 'approval required' })
// → { code, ref, timestamp, module: 'AGENT', description, severity, recoverable, diagnosis[], context }
```

| Range | Category |
|-------|----------|
| 800-815 | Framework errors (provider resolution, role lookup, tool lookup) |
| 816-835 | Guardrail errors (module disabled, provider policy, trust) |
| 836-862 | Orchestration errors (timeouts, max iterations, tool execution, approval) |

---

## Domus Integration

Registered as the 9th module in `@ordinatio/domus`.

**Emits:** `agent.chat_completed`, `agent.tool_executed`, `agent.tool_blocked`, `agent.memory_created`, `agent.memory_expired`, `agent.provider_failed`, `agent.approval_requested`

**Subscribes to:**
- `security.trust_changed` → clears provider cache (trust level may affect provider selection)
- `settings.changed` → clears provider cache if LLM key or provider setting changed

---

## What This Module Does NOT Do

- **Define application-specific tools.** You register your own tools (API endpoints, parameters, sensitivity levels). The framework discovers and routes them.
- **Define application-specific roles.** You register roles with goals, constraints, and tool access. The framework enforces them.
- **Call your services directly.** Tools execute via the `ToolExecutor` interface. Default: HTTP calls to your API endpoints. No service imports.
- **Store API keys.** Keys come from `KeyProvider`. Your app decides where they live (database, env vars, vault).
- **Decide which LLM to use.** Your app configures provider selection per-role via settings. The framework resolves and caches.

---

## Test Suite: 91 Tests Across 9 Files

| File | Tests | What It Proves |
|------|-------|----------------|
| **smoke.test.ts** | 19 | Every subsystem exports correctly. Error builder returns v2 objects. Barrel export has no conflicts. Both registries start empty. Memory tools ship with 3 built-in tools. |
| **tool-registry.test.ts** | 11 | Starts empty. Register single/multiple. Overwrite duplicates. Filter by module. Filter by role toolNames. Clear. Preserves dataSensitivity and covenant metadata. |
| **role-registry.test.ts** | 12 | Starts empty. Register/retrieve. Overwrite duplicates. List all. `buildCompositeRole()` merges modules/tools/goals/constraints/gates, deduplicates. Preserves covenant mappings. |
| **guardrails.test.ts** | 16 | Keeps enabled modules, removes disabled. Always keeps memory/auth/chat. Default: enabled for unlisted. Provider trust: default all-trusted, restrictive map blocks, sensitivity hierarchy (none < internal < sensitive < critical), unknown providers trusted. Access denial messages for all reason types. |
| **provider-health.test.ts** | 6 | Starts healthy. Stays healthy after success. Unhealthy after consecutive failures. Recovers after success. Providers tracked independently. Reset all. |
| **covenant-bridge.test.ts** | 10 | Starts empty. Register/retrieve. Filter by risk level (observe-only, up-to-act, all). Format capabilities as text. Empty for no matches. `createCovenantProvider()` returns working interface. Clear. |
| **errors.test.ts** | 6 | V2 diagnostic object (all fields). Unknown code handling. Context inclusion/exclusion. Registry completeness (all entries have required fields). Unique codes. |
| **tool-adapter.test.ts** | 10 | Claude format (input_schema, required params). OpenAI format (function calling). Handles no params. Multiple tools. Allowed values in schema. Empty tools. |
| **memory-tools.test.ts** | 6 | 3 built-in tools (remember/recall/forget). All have dataSensitivity. All have required fields (name, description, endpoint, whenToUse, responseShape). Correct HTTP methods (POST/GET/DELETE). |

---

## File Inventory

**27 source files, 3,842 lines of hand-written code.**

### Types + Errors (3 files, 900 lines)
```
src/types.ts                          (263)  AgentTool, AgentRole, LLMProvider, AgentDb,
                                              AgentCallbacks, KeyProvider, ToolExecutor,
                                              CovenantProvider, OrchestratorConfig, MemoryLayer...
src/errors/error-registry.ts          (567)  43+ AGENT_ codes (800-862)
src/errors/errors.ts                  (70)   agentError() v2 builder
```

### Providers (9 files, 613 lines)
```
src/providers/provider-factory.ts     (101)  getProvider() with KeyProvider + caching
src/providers/claude-provider.ts      (149)  Anthropic SDK, tool_use blocks
src/providers/openai-compatible-provider.ts (133) Abstract base (configurable URL/model)
src/providers/gemini-provider.ts      (147)  Google Generative AI SDK
src/providers/openai-provider.ts      (20)   GPT-4o (extends base)
src/providers/deepseek-provider.ts    (21)   DeepSeek (extends base)
src/providers/mistral-provider.ts     (21)   Mistral (extends base)
src/providers/grok-provider.ts        (21)   Grok (extends base)
```

### Registries (2 files, 291 lines)
```
src/registry/tool-registry.ts        (158)  registerTool(s), getTool, getToolsForRole, by module
src/registry/role-registry.ts        (133)  registerRole, getRole, buildCompositeRole
```

### Guardrails (3 files, 188 lines)
```
src/guardrails/agent-guardrails.ts   (68)   filterToolsByGuardrails, isModuleEnabled
src/guardrails/provider-policy.ts    (82)   canProviderAccessTool (injectable trust map)
src/guardrails/access-denial.ts      (38)   getAccessDenialMessage
```

### Health (1 file, 153 lines)
```
src/health/provider-health.ts        (153)  Circuit breaker per provider
```

### Memory (4 files, 507 lines)
```
src/memory/memory-service.ts         (218)  CRUD with AgentDb + AgentCallbacks
src/memory/memory-formatter.ts       (174)  getMemoryContext, estimateTokens
src/memory/memory-tools.ts           (101)  3 built-in tools (remember/recall/forget)
src/memory/types.ts                  (14)   Re-exports
```

### Orchestrator (5 files, 956 lines)
```
src/orchestrator/orchestrator.ts     (384)  The execution loop (callback-driven)
src/orchestrator/prompt-builder.ts   (183)  Role + memory + context assembly
src/orchestrator/tool-executor.ts    (186)  ToolExecutor interface + HttpToolExecutor
src/orchestrator/tool-adapter.ts     (119)  toClaudeTools, toOpenAIFunctions, toGeminiTools
src/orchestrator/types.ts            (84)   ChatRequest, ChatResponse, OrchestratorState
```

### Covenant (1 file, 234 lines)
```
src/covenant/covenant-bridge.ts      (234)  Injectable covenant registry + CovenantProvider factory
```
