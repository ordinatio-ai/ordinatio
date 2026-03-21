// ===========================================
// AGENT FRAMEWORK — TOOL FORMAT ADAPTERS
// ===========================================
// Converts AgentTool[] to LLM-specific formats.
// Pure transformation functions — no SDK imports.
// ===========================================

import type { AgentTool } from '../types';

/**
 * Convert AgentTool[] -> Anthropic Claude `tools` format.
 *
 * @see https://docs.anthropic.com/en/docs/build-with-claude/tool-use
 */
export function toClaudeTools(tools: AgentTool[]): Array<{
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
}> {
  return tools.map((tool) => ({
    name: tool.name,
    description: `${tool.description}\n\nEndpoint: ${tool.method} ${tool.endpoint}\nWhen to use: ${tool.whenToUse}${tool.pitfalls ? '\nPitfalls: ' + tool.pitfalls.join('; ') : ''}`,
    input_schema: {
      type: 'object' as const,
      properties: Object.fromEntries(
        tool.params.map((p) => [
          p.name,
          {
            type: p.type === 'string[]' ? 'array' : p.type === 'number' ? 'number' : p.type === 'boolean' ? 'boolean' : 'string',
            description: p.description,
            ...(p.type === 'string[]' ? { items: { type: 'string' } } : {}),
            ...(p.allowedValues ? { enum: p.allowedValues } : {}),
          },
        ]),
      ),
      required: tool.params.filter((p) => p.required).map((p) => p.name),
    },
  }));
}

/**
 * Convert AgentTool[] -> OpenAI `functions` format (for function calling).
 *
 * @see https://platform.openai.com/docs/guides/function-calling
 */
export function toOpenAIFunctions(tools: AgentTool[]): Array<{
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required: string[];
    };
  };
}> {
  return tools.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: `${tool.description}\n\nEndpoint: ${tool.method} ${tool.endpoint}\nWhen to use: ${tool.whenToUse}${tool.pitfalls ? '\nPitfalls: ' + tool.pitfalls.join('; ') : ''}`,
      parameters: {
        type: 'object' as const,
        properties: Object.fromEntries(
          tool.params.map((p) => [
            p.name,
            {
              type: p.type === 'string[]' ? 'array' : p.type === 'number' ? 'number' : p.type === 'boolean' ? 'boolean' : 'string',
              description: p.description,
              ...(p.type === 'string[]' ? { items: { type: 'string' } } : {}),
              ...(p.allowedValues ? { enum: p.allowedValues } : {}),
            },
          ]),
        ),
        required: tool.params.filter((p) => p.required).map((p) => p.name),
      },
    },
  }));
}

/**
 * Convert AgentTool[] -> Google Gemini `functionDeclarations` format.
 *
 * @see https://ai.google.dev/gemini-api/docs/function-calling
 */
export function toGeminiFunctionDeclarations(tools: AgentTool[]): Array<{
  name: string;
  description: string;
  parameters: {
    type: 'OBJECT';
    properties: Record<string, unknown>;
    required: string[];
  };
}> {
  return tools.map((tool) => ({
    name: tool.name,
    description: `${tool.description}\n\nEndpoint: ${tool.method} ${tool.endpoint}\nWhen to use: ${tool.whenToUse}`,
    parameters: {
      type: 'OBJECT' as const,
      properties: Object.fromEntries(
        tool.params.map((p) => [
          p.name,
          {
            type: p.type === 'string[]' ? 'ARRAY' : p.type === 'number' ? 'NUMBER' : p.type === 'boolean' ? 'BOOLEAN' : 'STRING',
            description: p.description,
            ...(p.type === 'string[]' ? { items: { type: 'STRING' } } : {}),
            ...(p.allowedValues ? { enum: p.allowedValues } : {}),
          },
        ]),
      ),
      required: tool.params.filter((p) => p.required).map((p) => p.name),
    },
  }));
}
