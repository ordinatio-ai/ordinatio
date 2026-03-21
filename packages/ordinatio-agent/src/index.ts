// ===========================================
// @ordinatio/agent — BARREL EXPORT
// ===========================================
// LLM-agnostic agent framework. All registries
// start empty — apps register their own modules,
// tools, roles, and providers at startup.
// ===========================================

// ---- Types ----
export type {
  AgentToolParam,
  AgentTool,
  PlaybookStep,
  Playbook,
  ApprovalGate,
  AgentRole,
  AgentMessage,
  AgentResponse,
  LLMProvider,
  AgentDb,
  AgentCallbacks,
  KeyProvider,
  ToolExecutor,
  ToolCallDisplay,
  CovenantProvider,
  OrchestratorConfig,
  DataTrustLevel,
  ProviderTrust,
  MemoryLayer,
  CreateMemoryInput,
  RecallFilters,
  AgentGuardrail,
} from './types';

export { DEFAULT_ORCHESTRATOR_CONFIG } from './types';

// ---- Errors ----
export { agentError, AGENT_ERRORS } from './errors/errors';
export type { AgentErrorResult, AgentErrorEntry } from './errors/errors';

// ---- Providers ----
export {
  ClaudeProvider,
  OpenAICompatibleProvider,
  OpenAIProvider,
  GeminiProvider,
  DeepSeekProvider,
  MistralProvider,
  GrokProvider,
  getProvider,
  clearProviderCache,
} from './providers';
export type { OpenAICompatibleConfig } from './providers';

// ---- Registry: Tools ----
export {
  registerTool,
  registerTools,
  getTool,
  getToolsByModule,
  getToolsForRole,
  getAllTools,
  getToolsByModuleForRole,
  clearTools,
} from './registry/tool-registry';

// ---- Registry: Roles ----
export {
  registerRole,
  getRole,
  getAllRoles,
  getRoleNames,
  buildCompositeRole,
  clearRoles,
} from './registry/role-registry';

// ---- Guardrails ----
export {
  filterToolsByGuardrails,
  isModuleEnabled,
  guardrailsKey,
} from './guardrails/agent-guardrails';

export {
  canProviderAccessTool,
  getProviderMaxSensitivity,
} from './guardrails/provider-policy';

export {
  getAccessDenialMessage,
} from './guardrails/access-denial';
export type { AccessDenialReason } from './guardrails/access-denial';

// ---- Health ----
export {
  recordProviderResult,
  isProviderHealthy,
  getHealthyProvider,
  getProviderHealth,
  resetProviderHealth,
  resetAllProviderHealth,
} from './health/provider-health';
export type { ProviderHealthConfig } from './health/provider-health';

// ---- Memory ----
export {
  createMemory,
  recallMemories,
  getMemory,
  deleteMemory,
  expireStaleMemories,
} from './memory/memory-service';
export type { MemoryWithTags } from './memory/memory-service';

export {
  getMemoryContext,
  estimateTokens,
} from './memory/memory-formatter';
export type { MemoryContextOptions, MemoryContext } from './memory/memory-formatter';

export { MEMORY_TOOLS } from './memory/memory-tools';

// ---- Orchestrator ----
export { orchestrateChat } from './orchestrator/orchestrator';
export type { OrchestrateOptions } from './orchestrator/orchestrator';

export {
  toClaudeTools,
  toOpenAIFunctions,
  toGeminiFunctionDeclarations,
} from './orchestrator/tool-adapter';

export { HttpToolExecutor, resolveEndpoint } from './orchestrator/tool-executor';

export { buildSystemPrompt, getAgentDisplayName } from './orchestrator/prompt-builder';
export type { PromptBuilderOptions } from './orchestrator/prompt-builder';

export type {
  ChatRequest,
  ChatResponse,
  ChatMessage,
  PageContext,
  ApprovalRequest,
  OrchestratorState,
} from './orchestrator/types';
// Re-export ToolCallDisplay from orchestrator types under a distinct name
export type { ToolCallDisplay as OrchestratorToolCallDisplay } from './orchestrator/types';

// ---- Covenant Bridge ----
export {
  registerCovenant,
  getCovenant,
  getAllCovenants,
  getRegisteredModuleIds,
  getModuleCapabilities,
  getCapabilitiesByRisk,
  getCapabilitiesForRole,
  findCapability,
  formatCapabilitiesForAgent,
  clearCovenants,
  createCovenantProvider,
} from './covenant/covenant-bridge';
export type {
  MinimalCovenant,
  CovenantCapability,
  CovenantCapabilityInput,
  CovenantIdentity,
} from './covenant/covenant-bridge';

// ---- Cognition Layer (agent-specific, uses shared execution primitives from @ordinatio/jobs) ----
export * from './cognition/index';
