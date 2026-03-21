// ===========================================
// CLAUDE LLM PROVIDER
// ===========================================
// Anthropic Claude implementation of LLMProvider.
// Uses dynamic import — @anthropic-ai/sdk is only
// loaded at runtime when chat() is called.
// ===========================================

import type { AgentMessage, AgentResponse, AgentRole, AgentTool, LLMProvider } from '../types';
import { toClaudeTools } from '../orchestrator/tool-adapter';

export class ClaudeProvider implements LLMProvider {
  id = 'claude';
  name = 'Anthropic Claude';
  private apiKey?: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey;
  }

  formatTools(tools: AgentTool[]): unknown[] {
    return toClaudeTools(tools);
  }

  formatSystemPrompt(role: AgentRole, context: string): string {
    return [
      `You are the ${role.name} agent.`,
      '',
      `## Your Role`,
      role.description,
      '',
      `## Goals`,
      ...role.goals.map((g) => `- ${g}`),
      '',
      `## Constraints`,
      ...role.constraints.map((c) => `- ${c}`),
      '',
      `## Approval Gates`,
      ...role.approvalGates.map(
        (gate) => `- **${gate.action}**: ${gate.reason}. Prompt: "${gate.prompt}"`,
      ),
      '',
      `## Context`,
      context,
    ].join('\n');
  }

  async chat(options: {
    messages: AgentMessage[];
    tools: AgentTool[];
    role: AgentRole;
    systemContext: string;
  }): Promise<AgentResponse> {
    // Dynamic import — @anthropic-ai/sdk must be installed to use this provider.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Anthropic = (await import(/* webpackIgnore: true */ '@anthropic-ai/sdk' as string)).default;
    const client = new Anthropic({ apiKey: this.apiKey || undefined });

    const claudeTools = toClaudeTools(options.tools);
    const systemPrompt = this.formatSystemPrompt(options.role, options.systemContext);

    // Build Claude-formatted messages.
    // Two key requirements:
    // 1. Assistant messages with tool calls must include tool_use content blocks
    // 2. Consecutive tool_result messages must be grouped into a single user message
    const claudeMessages: Array<{
      role: 'user' | 'assistant';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      content: string | any[];
    }> = [];

    for (const msg of options.messages) {
      if (msg.role === 'tool_result') {
        const resultBlock = {
          type: 'tool_result' as const,
          tool_use_id: msg.toolCallId ?? '',
          content: msg.content,
        };

        // Group with previous tool_result if the last message is already a user
        // message with tool_result content blocks
        const prev = claudeMessages[claudeMessages.length - 1];
        if (prev && prev.role === 'user' && Array.isArray(prev.content) &&
            prev.content.length > 0 && prev.content[0]?.type === 'tool_result') {
          prev.content.push(resultBlock);
        } else {
          claudeMessages.push({
            role: 'user' as const,
            content: [resultBlock],
          });
        }
      } else if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
        // Assistant message with tool calls — include tool_use content blocks
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const contentBlocks: any[] = [];
        if (msg.content) {
          contentBlocks.push({ type: 'text', text: msg.content });
        }
        for (const tc of msg.toolCalls) {
          contentBlocks.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.name,
            input: tc.arguments,
          });
        }
        claudeMessages.push({
          role: 'assistant' as const,
          content: contentBlocks,
        });
      } else {
        claudeMessages.push({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        });
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response: any = await client.messages.create({
      model: process.env.CLAUDE_MODEL ?? 'claude-sonnet-4-5-20250929',
      max_tokens: 4096,
      system: systemPrompt,
      tools: claudeTools,
      messages: claudeMessages,
    });

    const toolCalls: AgentResponse['toolCalls'] = [];
    let content = '';

    for (const block of response.content) {
      if (block.type === 'text') {
        content += block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          name: block.name,
          arguments: block.input as Record<string, unknown>,
        });
      }
    }

    return {
      content,
      toolCalls,
      stopReason: response.stop_reason === 'tool_use' ? 'tool_use' : response.stop_reason === 'max_tokens' ? 'max_tokens' : 'end_turn',
    };
  }
}
