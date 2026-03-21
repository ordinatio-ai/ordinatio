// ===========================================
// AGENT CHAT — ORCHESTRATOR
// ===========================================
// Core chat loop: send to LLM -> check for tool
// calls -> execute tools -> check approval gates
// -> loop until done or limit reached.
// All dependencies injected — no @/ imports.
// ===========================================

import type {
  AgentDb,
  AgentCallbacks,
  KeyProvider,
  ToolExecutor,
  OrchestratorConfig,
  AgentMessage,
  AgentResponse,
  AgentGuardrail,
  ProviderTrust,
} from '../types';
import { DEFAULT_ORCHESTRATOR_CONFIG } from '../types';
import { getRole } from '../registry/role-registry';
import { getToolsForRole, getTool } from '../registry/tool-registry';
import { agentError } from '../errors/errors';
import { canProviderAccessTool } from '../guardrails/provider-policy';
import { getAccessDenialMessage } from '../guardrails/access-denial';
import { isModuleEnabled } from '../guardrails/agent-guardrails';
import { estimateTokens } from '../memory/memory-formatter';
import { getProvider } from '../providers/provider-factory';
import { buildSystemPrompt, type PromptBuilderOptions } from './prompt-builder';
import type {
  ChatRequest,
  ChatResponse,
  ChatMessage,
  ToolCallDisplay,
  ApprovalRequest,
  PageContext,
} from './types';

// ---- Orchestrator Options ----

export interface OrchestrateOptions {
  db: AgentDb;
  request: ChatRequest;
  sessionToken: string;
  toolExecutor: ToolExecutor;
  keyProvider?: KeyProvider;
  callbacks?: AgentCallbacks;
  config?: OrchestratorConfig;
  guardrails?: AgentGuardrail[];
  trustMap?: Record<string, ProviderTrust>;
  promptOptions?: PromptBuilderOptions;
  /** Tool-to-gate mapping (e.g. { create_email_draft: 'Send email' }) */
  toolGateMap?: Record<string, string>;
}

/**
 * Main orchestrator: drives the agent conversation loop.
 *
 * Flow:
 * 1. Resolve role + tools
 * 2. Build system prompt (role + memory + page context)
 * 3. Convert ChatMessages -> AgentMessages
 * 4. Loop: LLM call -> tool execution -> approval check
 * 5. Return final response
 */
export async function orchestrateChat(
  options: OrchestrateOptions,
): Promise<ChatResponse> {
  const {
    db,
    request,
    sessionToken,
    toolExecutor,
    keyProvider,
    callbacks,
    guardrails = [],
    trustMap,
    promptOptions,
    toolGateMap = {},
  } = options;

  const cfg: Required<OrchestratorConfig> = {
    ...DEFAULT_ORCHESTRATOR_CONFIG,
    ...options.config,
  };

  const { role: roleId, messages, pageContext } = request;

  // 1. Resolve role
  const role = getRole(roleId);
  if (!role) {
    throw agentError('AGENT_851', { roleId });
  }

  // 2. Get tools for role
  let tools = getToolsForRole(roleId, {
    roleToolNames: role.toolNames,
    covenantModules: role.covenantModules,
    maxRisk: role.maxRisk,
    covenantProvider: promptOptions?.covenantProvider
      ? {
          getCapabilitiesForRole: promptOptions.covenantProvider.getCapabilitiesForRole,
        }
      : undefined,
  });
  const authorizedToolNames = tools.map((t) => t.name);

  // Apply guardrails filter
  if (guardrails.length > 0) {
    const { filterToolsByGuardrails } = await import('../guardrails/agent-guardrails');
    tools = filterToolsByGuardrails(tools, guardrails);
  }

  // 3. Check message length
  const totalContent = messages.map((m) => m.content).join('');
  if (estimateTokens(totalContent) > cfg.maxInputTokens) {
    throw agentError('AGENT_859', {
      estimatedTokens: estimateTokens(totalContent),
      maxTokens: cfg.maxInputTokens,
    });
  }

  // 3b. Log user message to search query system (fire-and-forget)
  const lastUserMessage = messages.filter((m) => m.role === 'user').pop();
  if (lastUserMessage?.content && callbacks?.logSearchQuery) {
    callbacks.logSearchQuery(lastUserMessage.content, pageContext?.entityType).catch(() => {});
  }

  // 4. Build system prompt
  const systemContext = await buildSystemPrompt(
    db,
    roleId,
    pageContext,
    callbacks,
    promptOptions,
  );

  // 5. Convert chat messages -> agent messages
  const agentMessages: AgentMessage[] = messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

  // 6. Orchestrator loop
  const state = {
    iteration: 0,
    startedAt: Date.now(),
    toolCallDisplays: [] as ToolCallDisplay[],
  };

  const provider = await getProvider({ keyProvider, roleId });

  while (state.iteration < cfg.maxIterations) {
    // Timeout check
    if (Date.now() - state.startedAt > cfg.timeoutMs) {
      throw agentError('AGENT_855', {
        elapsedMs: Date.now() - state.startedAt,
        iterations: state.iteration,
      });
    }

    state.iteration++;

    // Call LLM
    let response: AgentResponse;
    try {
      response = await provider.chat({
        messages: agentMessages,
        tools,
        role,
        systemContext,
      });
    } catch (error) {
      throw agentError('AGENT_852', {
        provider: provider.id,
        iteration: state.iteration,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // Case 1: end_turn — agent is done talking
    if (response.stopReason === 'end_turn' || response.toolCalls.length === 0) {
      return {
        message: {
          role: 'assistant',
          content: response.content,
          toolCalls: state.toolCallDisplays.length > 0 ? state.toolCallDisplays : undefined,
        },
        done: true,
      };
    }

    // Case 2: max_tokens — partial response
    if (response.stopReason === 'max_tokens') {
      return {
        message: {
          role: 'assistant',
          content: response.content + '\n\n*(Response truncated — try a more specific question)*',
          toolCalls: state.toolCallDisplays.length > 0 ? state.toolCallDisplays : undefined,
        },
        done: true,
      };
    }

    // Case 3: tool_use — execute tools
    agentMessages.push({
      role: 'assistant',
      content: response.content,
      toolCalls: response.toolCalls,
    });

    for (const toolCall of response.toolCalls) {
      // Check approval gates before executing
      const gate = checkApprovalGate(
        toolCall.name,
        toolCall.arguments,
        role.approvalGates,
        toolGateMap,
      );

      if (gate) {
        const approval: ApprovalRequest = {
          action: gate.action,
          reason: gate.reason,
          prompt: formatApprovalPrompt(gate.prompt, toolCall.arguments),
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          toolArgs: toolCall.arguments,
        };

        return {
          message: {
            role: 'assistant',
            content:
              response.content ||
              `I need your approval to proceed: **${gate.action}**\n\n${approval.prompt}`,
            toolCalls: state.toolCallDisplays.length > 0 ? state.toolCallDisplays : undefined,
            pendingApproval: approval,
          },
          done: false,
        };
      }

      // Check module guardrails
      const toolDef = getTool(toolCall.name);
      if (guardrails.length > 0 && toolDef) {
        if (!isModuleEnabled(toolDef.module, guardrails)) {
          const denialMsg = getAccessDenialMessage('module_disabled', { module: toolDef.module });
          state.toolCallDisplays.push({
            name: toolCall.name,
            status: 'error',
            summary: `Module disabled: ${toolDef.module}`,
          });
          agentMessages.push({
            role: 'tool_result',
            content: denialMsg,
            toolCallId: toolCall.id,
            toolName: toolCall.name,
          });
          continue;
        }
      }

      // Check data sensitivity policy
      const sensitivity = toolDef?.dataSensitivity ?? 'none';

      if (!canProviderAccessTool(provider.id, sensitivity, trustMap)) {
        const policyDenialMsg = getAccessDenialMessage('provider_policy', {
          provider: provider.id,
          sensitivity,
        });
        state.toolCallDisplays.push({
          name: toolCall.name,
          status: 'error',
          summary: `Blocked: ${provider.id} is not trusted for ${sensitivity}-level data`,
        });

        agentMessages.push({
          role: 'tool_result',
          content: policyDenialMsg,
          toolCallId: toolCall.id,
          toolName: toolCall.name,
        });

        // Log security event (fire-and-forget)
        if (callbacks?.logSecurityEvent) {
          callbacks.logSecurityEvent('AGENT_TOOL_BLOCKED_BY_POLICY', {
            toolName: toolCall.name,
            providerId: provider.id,
            sensitivity,
            roleId,
          }).catch(() => {});
        }

        continue;
      }

      // Log audit event for sensitive data access (fire-and-forget)
      if ((sensitivity === 'sensitive' || sensitivity === 'critical') && callbacks?.logSecurityEvent) {
        callbacks.logSecurityEvent('AGENT_SENSITIVE_DATA_TO_LLM', {
          toolName: toolCall.name,
          providerId: provider.id,
          sensitivity,
          roleId,
        }).catch(() => {});
      }

      // Governance audit (fire-and-forget)
      if (toolDef?.risk && toolDef.risk !== 'observe' && callbacks?.logGovernanceAudit) {
        callbacks.logGovernanceAudit(
          toolCall.name,
          toolDef.risk,
          roleId,
          toolCall.arguments,
        ).catch(() => {});
      }

      // Execute the tool
      const { result, display } = await toolExecutor.execute(
        toolCall.name,
        toolCall.arguments,
        { sessionToken, authorizedToolNames },
      );

      state.toolCallDisplays.push({
        name: display.tool,
        status: display.success ? 'success' : 'error',
        summary: display.summary,
      });

      // Add tool result to message history
      agentMessages.push({
        role: 'tool_result',
        content: result,
        toolCallId: toolCall.id,
        toolName: toolCall.name,
      });
    }

    // Continue the loop — send tool results back to LLM
  }

  // Max iterations reached
  throw agentError('AGENT_854', {
    iterations: state.iteration,
    toolCalls: state.toolCallDisplays.map((d) => d.name),
  });
}

// ===========================================
// APPROVAL GATE MATCHING
// ===========================================

/**
 * Check if a tool call triggers an approval gate.
 */
function checkApprovalGate(
  toolName: string,
  _args: Record<string, unknown>,
  gates: Array<{ action: string; reason: string; prompt: string }>,
  toolGateMap: Record<string, string>,
): { action: string; reason: string; prompt: string } | null {
  const gateAction = toolGateMap[toolName];
  if (!gateAction) return null;

  const gate = gates.find((g) => g.action === gateAction);
  return gate ?? null;
}

/**
 * Replace {param} placeholders in an approval prompt with actual values.
 */
function formatApprovalPrompt(
  template: string,
  args: Record<string, unknown>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    const value = args[key];
    return value !== undefined ? String(value) : match;
  });
}
