// ===========================================
// AGENT CHAT — PROMPT BUILDER
// ===========================================
// Assembles the full system prompt for a chat
// session: role context + memory injection +
// page context + behavior instructions.
// Accepts AgentCallbacks for entity context.
// ===========================================

import type { AgentDb, AgentCallbacks, AgentRole, CovenantProvider } from '../types';
import { getRole } from '../registry/role-registry';
import { getMemoryContext } from '../memory/memory-formatter';
import { agentError } from '../errors/errors';
import type { PageContext } from './types';

// ---- Types ----

export interface PromptBuilderOptions {
  /** Agent display names map (e.g. { coo: 'Operations Assistant' }) */
  displayNames?: Record<string, string>;
  /** Covenant provider for capability discovery */
  covenantProvider?: CovenantProvider;
  /** Additional behavior instructions */
  behaviorInstructions?: string[];
}

/**
 * Build the full system prompt for an agent chat session.
 *
 * Combines:
 * 1. Role definition (from role-registry)
 * 2. Memory context (from memory-formatter)
 * 3. Page context (what the user is currently viewing)
 * 4. Chat behavior instructions
 * 5. Covenant capability discovery (if provider given)
 */
export async function buildSystemPrompt(
  db: AgentDb,
  roleId: string,
  pageContext?: PageContext,
  callbacks?: AgentCallbacks,
  options?: PromptBuilderOptions,
): Promise<string> {
  const role = getRole(roleId);
  if (!role) {
    throw agentError('AGENT_856', { roleId, reason: 'Role not found' });
  }

  const sections: string[] = [];

  // 1. Role identity
  sections.push(
    `You are the ${role.name} agent.`,
    '',
    '## Your Role',
    role.description,
    '',
    '## Goals',
    ...role.goals.map((g) => `- ${g}`),
    '',
    '## Constraints',
    ...role.constraints.map((c) => `- ${c}`),
  );

  // 2. Approval gates
  if (role.approvalGates.length > 0) {
    sections.push(
      '',
      '## Approval Gates',
      'The following actions require human approval. When you need to perform one,',
      'explain what you want to do and why. The user will approve or deny.',
      ...role.approvalGates.map(
        (gate) => `- **${gate.action}**: ${gate.reason}`,
      ),
    );
  }

  // 3. Covenant capability discovery
  if (options?.covenantProvider && role.covenantModules && Object.keys(role.covenantModules).length > 0) {
    try {
      const covenantModuleIds = Object.values(role.covenantModules);
      const maxRisk = role.maxRisk ?? 'govern';
      const capDoc = options.covenantProvider.formatCapabilitiesForAgent(covenantModuleIds, maxRisk);
      if (capDoc && !capDoc.includes('No capabilities available')) {
        sections.push('', capDoc);
      }
    } catch {
      // Covenant discovery is non-critical — continue without it
    }
  }

  // 4. Entity context via callback
  if (callbacks?.getEntityContext && pageContext?.entityType && pageContext?.entityId) {
    try {
      const tokenBudget = 2000;
      const contextText = await callbacks.getEntityContext(
        pageContext.entityType,
        pageContext.entityId,
        tokenBudget,
      );
      if (contextText) {
        sections.push('', contextText);
      }
    } catch {
      // Entity context is non-critical
    }
  }

  // 5. Memory context
  try {
    const memoryOpts: {
      role: string;
      clientId?: string;
      orderId?: string;
      tokenBudget: number;
    } = {
      role: roleId,
      tokenBudget: pageContext?.entityId ? 1000 : 2000,
    };

    if (pageContext?.entityType === 'client' && pageContext.entityId) {
      memoryOpts.clientId = pageContext.entityId;
    } else if (pageContext?.entityType === 'order' && pageContext.entityId) {
      memoryOpts.orderId = pageContext.entityId;
    }

    const memoryContext = await getMemoryContext(db, memoryOpts, callbacks);
    if (memoryContext.text) {
      sections.push('', memoryContext.text);
    }
  } catch {
    // Memory is non-critical — continue without it
    sections.push(
      '',
      '## Memory',
      '(Memory context unavailable this session)',
    );
  }

  // 6. Page context
  if (pageContext) {
    sections.push('', '## Current Context');
    sections.push(`The user is on: ${pageContext.path}`);
    if (pageContext.entityType && pageContext.entityId) {
      sections.push(`Viewing ${pageContext.entityType} ${pageContext.entityId}`);
    }
  }

  // 7. Chat behavior
  const defaultBehavior = [
    '- Keep responses concise and actionable',
    '- Use markdown formatting for readability',
    '- When you need data, use your tools — don\'t ask the user to look it up',
    '- When an action requires approval, explain what you want to do and why',
    '- If you detect a preference or pattern, use the `remember` tool to save it',
    '- If a tool fails, report the error clearly and suggest next steps',
  ];

  const extraBehavior = options?.behaviorInstructions ?? [];

  sections.push(
    '',
    '## Chat Behavior',
    ...defaultBehavior,
    ...extraBehavior,
  );

  return sections.join('\n');
}

/**
 * Get the display name for an agent role.
 */
export function getAgentDisplayName(
  roleId: string,
  displayNames?: Record<string, string>,
): string {
  if (displayNames?.[roleId]) {
    return displayNames[roleId];
  }
  const role = getRole(roleId);
  return role?.name ?? roleId;
}
