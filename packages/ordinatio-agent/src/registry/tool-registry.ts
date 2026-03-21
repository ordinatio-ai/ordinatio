// ===========================================
// AGENT FRAMEWORK — TOOL REGISTRY
// ===========================================
// Universal index of all agent tools. Empty at
// startup — apps register their own tools.
// Supports queries by role, module, or name.
// ===========================================

import type { AgentTool } from '../types';

// ===========================================
// REGISTRY STORE
// ===========================================

const toolMap = new Map<string, AgentTool>();

// ===========================================
// REGISTRATION
// ===========================================

/** Register a single tool. Overwrites if name already exists. */
export function registerTool(tool: AgentTool): void {
  toolMap.set(tool.name, tool);
}

/** Register multiple tools at once. Overwrites duplicates by name. */
export function registerTools(tools: AgentTool[]): void {
  for (const tool of tools) {
    toolMap.set(tool.name, tool);
  }
}

// ===========================================
// QUERY FUNCTIONS
// ===========================================

/** Look up a tool by name. */
export function getTool(name: string): AgentTool | undefined {
  return toolMap.get(name);
}

/** Get all tools belonging to a module. */
export function getToolsByModule(module: string): AgentTool[] {
  return Array.from(toolMap.values()).filter((t) => t.module === module);
}

/**
 * Get all tools accessible to a role.
 * Filters the registry by the role's toolNames list.
 * If a CovenantProvider is passed, also discovers covenant capabilities.
 */
export function getToolsForRole(
  roleId: string,
  options?: {
    roleToolNames?: string[];
    covenantModules?: Record<string, string>;
    maxRisk?: 'observe' | 'suggest' | 'act' | 'govern';
    covenantProvider?: {
      getCapabilitiesForRole(modules: string[], maxRisk: string): Array<{
        id: string;
        description: string;
        type: string;
        risk: 'observe' | 'suggest' | 'act' | 'govern';
        inputs: Array<{ name: string; type: string; required?: boolean; description: string }>;
        output: string;
        whenToUse: string;
        pitfalls?: string[];
      }>;
    };
  },
): AgentTool[] {
  const { roleToolNames, covenantModules, maxRisk, covenantProvider } = options ?? {};

  // Start with hardcoded tools
  const tools = new Map<string, AgentTool>();

  if (roleToolNames) {
    for (const name of roleToolNames) {
      const tool = toolMap.get(name);
      if (tool) tools.set(name, tool);
    }
  } else {
    // If no tool names provided, return all registered tools
    for (const [name, tool] of toolMap) {
      tools.set(name, tool);
    }
  }

  // Discover additional capabilities from covenants
  if (covenantModules && covenantProvider) {
    const moduleNames = Object.keys(covenantModules);
    const risk = maxRisk ?? 'govern';
    const capabilities = covenantProvider.getCapabilitiesForRole(moduleNames, risk);

    const riskToSensitivity: Record<string, AgentTool['dataSensitivity']> = {
      observe: 'none',
      suggest: 'internal',
      act: 'sensitive',
      govern: 'critical',
    };

    for (const cap of capabilities) {
      // Don't override existing hardcoded tools
      if (!tools.has(cap.id)) {
        tools.set(cap.id, {
          name: cap.id,
          description: cap.description,
          module: cap.id.split('.')[0],
          method: cap.type === 'query' ? 'GET' : 'POST',
          endpoint: '',
          auth: 'session_cookie',
          params: cap.inputs.map((input) => ({
            name: input.name,
            type: input.type,
            required: input.required ?? false,
            description: input.description,
          })),
          example: {},
          responseShape: cap.output,
          whenToUse: cap.whenToUse,
          pitfalls: cap.pitfalls,
          dataSensitivity: riskToSensitivity[cap.risk] ?? 'none',
          capabilityId: cap.id,
          risk: cap.risk,
        });
      }
    }
  }

  return Array.from(tools.values());
}

/** Get all registered tools. */
export function getAllTools(): AgentTool[] {
  return Array.from(toolMap.values());
}

/** Get tool names grouped by module for a role. */
export function getToolsByModuleForRole(
  roleToolNames: string[],
): Record<string, AgentTool[]> {
  const grouped: Record<string, AgentTool[]> = {};
  for (const name of roleToolNames) {
    const tool = toolMap.get(name);
    if (tool) {
      if (!grouped[tool.module]) {
        grouped[tool.module] = [];
      }
      grouped[tool.module].push(tool);
    }
  }
  return grouped;
}

/** Clear all registered tools (for testing). */
export function clearTools(): void {
  toolMap.clear();
}
