// ===========================================
// ORDINATIO AGENT — Shared Types
// ===========================================
// LLM-agnostic type definitions for the agent
// framework. These types NEVER import any LLM
// SDK. Apps register their own modules, tools,
// roles, and providers at startup.
// ===========================================

// ---- Tool Types ----

export interface AgentToolParam {
  name: string;
  type: string;
  required: boolean;
  description: string;
  allowedValues?: string[];
}

export interface AgentTool {
  /** Tool name (snake_case, used in function calls). */
  name: string;
  /** Human-readable description. */
  description: string;
  /** Which module this tool belongs to (app-defined, any string). */
  module: string;
  /** HTTP method. */
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** API endpoint path. */
  endpoint: string;
  /** Auth requirement. */
  auth: 'session_cookie' | 'api_key' | 'none';
  /** Request parameters. */
  params: AgentToolParam[];
  /** Example request body. */
  example: Record<string, unknown>;
  /** What the response looks like. */
  responseShape: string;
  /** When to use this tool. */
  whenToUse: string;
  /** Common mistakes to avoid. */
  pitfalls?: string[];
  /** Data sensitivity level for provider trust enforcement. */
  dataSensitivity?: 'none' | 'internal' | 'sensitive' | 'critical';
  /** Ordinatio capability ID (set when discovered via covenant). */
  capabilityId?: string;
  /** Ordinatio module ID (e.g., 'email-engine'). */
  covenantModuleId?: string;
  /** Risk level from covenant governance. */
  risk?: 'observe' | 'suggest' | 'act' | 'govern';
}

// ---- Playbook Types ----

export interface PlaybookStep {
  step: number;
  action: string;
  tool: string;
  params?: Record<string, string>;
  decision?: { condition: string; ifTrue: string; ifFalse: string };
}

export interface Playbook {
  name: string;
  role: string;
  trigger: string;
  outcome: string;
  steps: PlaybookStep[];
  pitfalls?: string[];
}

// ---- Role Types ----

export interface ApprovalGate {
  action: string;
  reason: string;
  prompt: string;
}

export interface AgentRole {
  id: string;
  name: string;
  description: string;
  goals: string[];
  constraints: string[];
  /** Module names this role can access (app-defined strings). */
  modules: string[];
  /** Tool names this role can access. */
  toolNames: string[];
  /** Actions requiring human approval before execution. */
  approvalGates: ApprovalGate[];
  /** Path to context discovery document (app-specific). */
  contextDocument: string;
  /** Covenant module mapping for runtime capability discovery. */
  covenantModules?: Record<string, string>;
  /** Max risk level for auto-execution. */
  maxRisk?: 'observe' | 'suggest' | 'act' | 'govern';
}

// ---- LLM Provider Types ----

export interface AgentMessage {
  role: 'user' | 'assistant' | 'tool_result';
  content: string;
  toolCallId?: string;
  toolName?: string;
  toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
}

export interface AgentResponse {
  content: string;
  toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens';
}

export interface LLMProvider {
  id: string;
  name: string;
  formatTools(tools: AgentTool[]): unknown[];
  formatSystemPrompt(role: AgentRole, context: string): unknown;
  chat(options: {
    messages: AgentMessage[];
    tools: AgentTool[];
    role: AgentRole;
    systemContext: string;
  }): Promise<AgentResponse>;
}

// ---- Dependency Injection Interfaces ----

/**
 * Minimal database interface for memory operations.
 * The app passes its Prisma client (or any implementation).
 */
export interface AgentDb {
  agentMemory: {
    create(args: { data: Record<string, unknown> }): Promise<Record<string, unknown>>;
    findMany(args: { where?: unknown; include?: unknown; orderBy?: unknown; take?: number }): Promise<Record<string, unknown>[]>;
    findUnique(args: { where: { id: string }; include?: unknown }): Promise<Record<string, unknown> | null>;
    delete(args: { where: { id: string } }): Promise<unknown>;
    deleteMany(args: { where: unknown }): Promise<{ count: number }>;
    updateMany(args: { where: unknown; data: unknown }): Promise<unknown>;
  };
  tag: {
    findUnique(args: { where: { name: string } }): Promise<{ id: string; name: string; color: string } | null>;
    create(args: { data: { name: string; color: string } }): Promise<{ id: string; name: string; color: string }>;
  };
  memoryTag: {
    create(args: { data: { memoryId: string; tagId: string } }): Promise<unknown>;
  };
  $transaction<T>(fn: (tx: AgentDb) => Promise<T>): Promise<T>;
}

/**
 * Callbacks for side effects. All optional, all best-effort.
 */
export interface AgentCallbacks {
  logActivity?: (action: string, description: string, metadata?: Record<string, unknown>) => Promise<void>;
  logSecurityEvent?: (eventType: string, details: Record<string, unknown>) => Promise<void>;
  logGovernanceAudit?: (capabilityId: string, risk: string, actorId: string, inputs: Record<string, unknown>) => Promise<void>;
  logSearchQuery?: (query: string, entityType?: string) => Promise<void>;
  getEntityContext?: (entityType: string, entityId: string, tokenBudget: number) => Promise<string | null>;
  getTimeline?: (entityType: string, entityId: string, limit: number) => Promise<Array<{ createdAt: Date; description: string }>>;
}

/**
 * Resolves API keys and provider settings without DB dependency.
 */
export interface KeyProvider {
  getProviderForRole?(roleId: string): Promise<string | null>;
  getGlobalProvider?(): Promise<string>;
  getApiKey?(providerId: string): Promise<string | null>;
}

/**
 * Abstract tool execution. Default: HttpToolExecutor (routes through API endpoints).
 */
export interface ToolExecutor {
  execute(
    toolName: string,
    args: Record<string, unknown>,
    context: { sessionToken: string; authorizedToolNames: string[] },
  ): Promise<{ result: string; display: ToolCallDisplay }>;
}

/** How a tool call is displayed in the UI. */
export interface ToolCallDisplay {
  tool: string;
  summary: string;
  success: boolean;
  data?: Record<string, unknown>;
}

/**
 * Injectable covenant source for capability discovery.
 */
export interface CovenantProvider {
  getCovenant(moduleId: string): unknown | undefined;
  getAllCovenants(): unknown[];
  getCapabilitiesForRole(roleModules: string[], maxRisk: string): unknown[];
  formatCapabilitiesForAgent(moduleIds: string[], maxRisk: string): string;
}

/**
 * Orchestrator configuration with sensible defaults.
 */
export interface OrchestratorConfig {
  maxIterations?: number;     // default: 10
  timeoutMs?: number;         // default: 60_000
  maxInputTokens?: number;    // default: 4000
  memoryTokenBudget?: number; // default: 2000
}

/** Default orchestrator configuration. */
export const DEFAULT_ORCHESTRATOR_CONFIG: Required<OrchestratorConfig> = {
  maxIterations: 10,
  timeoutMs: 60_000,
  maxInputTokens: 4000,
  memoryTokenBudget: 2000,
};

// ---- Provider Trust Types ----

/** Data sensitivity trust level. */
export type DataTrustLevel = 'none' | 'internal' | 'sensitive' | 'critical';

/** Trust configuration for a provider. */
export interface ProviderTrust {
  maxDataSensitivity: DataTrustLevel;
}

// ---- Memory Types ----

export type MemoryLayer = 'TEMPORARY' | 'DEEP';

export interface CreateMemoryInput {
  layer: MemoryLayer;
  role: string;
  source: string;
  summary: string;
  detail?: string;
  clientId?: string;
  orderId?: string;
  expiresAt?: Date;
  tags?: string[];
  createdBy: string;
}

export interface RecallFilters {
  role?: string;
  layer?: MemoryLayer;
  tags?: string[];
  clientId?: string;
  orderId?: string;
  limit?: number;
}

// ---- Guardrail Types ----

export interface AgentGuardrail {
  module: string;
  enabled: boolean;
}
