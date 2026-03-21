// ===========================================
// AGENT CHAT — TOOL EXECUTOR
// ===========================================
// Default HttpToolExecutor: executes AgentTool
// definitions by making internal HTTP requests
// to existing API routes. Accepts appUrl as
// constructor parameter.
// ===========================================

import type { AgentTool, ToolExecutor, ToolCallDisplay } from '../types';
import { getTool } from '../registry/tool-registry';
import { agentError } from '../errors/errors';

// ===========================================
// HTTP TOOL EXECUTOR (DEFAULT)
// ===========================================

export class HttpToolExecutor implements ToolExecutor {
  private appUrl: string;

  constructor(appUrl?: string) {
    this.appUrl = appUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  }

  async execute(
    toolName: string,
    args: Record<string, unknown>,
    context: { sessionToken: string; authorizedToolNames: string[] },
  ): Promise<{ result: string; display: ToolCallDisplay }> {
    // 1. Verify tool exists
    const tool = getTool(toolName);
    if (!tool) {
      const err = agentError('AGENT_853', {
        toolName,
        reason: 'Tool not found in registry',
      });
      return {
        result: JSON.stringify({ error: err.description }),
        display: { tool: toolName, summary: 'Tool not found', success: false },
      };
    }

    // 2. Verify role authorization
    if (!context.authorizedToolNames.includes(toolName)) {
      const err = agentError('AGENT_857', {
        toolName,
        authorizedTools: context.authorizedToolNames,
      });
      return {
        result: JSON.stringify({ error: err.description }),
        display: { tool: toolName, summary: 'Not authorized for this role', success: false },
      };
    }

    // 3. Build URL with parameter substitution
    const url = resolveEndpoint(tool, args);

    // 4. Execute internal HTTP request
    try {
      const headers: Record<string, string> = {
        Cookie: `better-auth.session_token=${context.sessionToken}`,
      };

      let body: string | undefined;
      if (tool.method !== 'GET') {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(args);
      }

      const response = await fetch(`${this.appUrl}${url}`, {
        method: tool.method,
        headers,
        body,
      });

      const data = await response.json();

      if (!response.ok) {
        const err = agentError('AGENT_853', {
          toolName,
          status: response.status,
          url,
          responseBody: truncateForLog(JSON.stringify(data)),
        });
        console.error(`[${err.ref}] Tool ${toolName} returned ${response.status}`);
        return {
          result: JSON.stringify({
            error: `Tool returned HTTP ${response.status}`,
            details: data,
          }),
          display: { tool: toolName, summary: `HTTP ${response.status}`, success: false },
        };
      }

      return {
        result: JSON.stringify(data),
        display: {
          tool: toolName,
          summary: summarizeToolResult(toolName, data),
          success: true,
        },
      };
    } catch (error) {
      const err = agentError('AGENT_853', {
        toolName,
        url,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      console.error(`[${err.ref}] Tool ${toolName} execution failed:`, error);
      return {
        result: JSON.stringify({ error: `Tool execution failed: ${err.description}` }),
        display: { tool: toolName, summary: 'Execution failed', success: false },
      };
    }
  }
}

// ===========================================
// HELPERS
// ===========================================

/**
 * Replace {param} placeholders in the endpoint with actual values.
 * Also builds query string for GET requests.
 */
export function resolveEndpoint(
  tool: AgentTool,
  args: Record<string, unknown>,
): string {
  let endpoint = tool.endpoint;

  // Replace path parameters: /api/orders/{orderId} -> /api/orders/abc123
  const pathParams = endpoint.match(/\{(\w+)\}/g) ?? [];
  for (const param of pathParams) {
    const key = param.slice(1, -1);
    const value = args[key];
    if (value !== undefined) {
      endpoint = endpoint.replace(param, encodeURIComponent(String(value)));
    }
  }

  // For GET requests, append remaining args as query params
  if (tool.method === 'GET') {
    const usedKeys = new Set(pathParams.map((p) => p.slice(1, -1)));
    const queryParts: string[] = [];
    for (const [key, value] of Object.entries(args)) {
      if (!usedKeys.has(key) && value !== undefined && value !== null) {
        queryParts.push(
          `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`,
        );
      }
    }
    if (queryParts.length > 0) {
      endpoint += `?${queryParts.join('&')}`;
    }
  }

  return endpoint;
}

/**
 * Generate a brief summary of a tool result for UI display.
 */
function summarizeToolResult(
  toolName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any,
): string {
  if (Array.isArray(data)) {
    return `${data.length} results`;
  }
  if (data?.total !== undefined) {
    return `${data.total} items`;
  }
  if (data?.memories) {
    return `${data.memories.length} memories`;
  }
  if (data?.id) {
    return `Done (${toolName})`;
  }
  return 'Done';
}

function truncateForLog(text: string, max = 500): string {
  return text.length > max ? text.slice(0, max) + '...' : text;
}
