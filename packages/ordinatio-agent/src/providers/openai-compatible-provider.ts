// ===========================================
// OPENAI-COMPATIBLE BASE PROVIDER
// ===========================================
// Shared implementation for all providers that
// expose an OpenAI-compatible chat completions
// API: OpenAI, DeepSeek, Mistral, Grok (xAI).
// Subclasses only set id, name, baseURL, model.
// ===========================================

import type { AgentMessage, AgentResponse, AgentRole, AgentTool, LLMProvider } from '../types';
import { toOpenAIFunctions } from '../orchestrator/tool-adapter';

export interface OpenAICompatibleConfig {
  /** Provider identifier (e.g. 'openai', 'deepseek') */
  id: string;
  /** Human-readable name */
  name: string;
  /** API key (from DB or env) */
  apiKey?: string;
  /** Base URL override — undefined = standard OpenAI */
  baseURL?: string;
  /** Default model when env var is not set */
  defaultModel: string;
  /** Environment variable name for model override */
  modelEnvVar: string;
}

export class OpenAICompatibleProvider implements LLMProvider {
  id: string;
  name: string;
  protected apiKey?: string;
  protected baseURL?: string;
  protected defaultModel: string;
  protected modelEnvVar: string;

  constructor(config: OpenAICompatibleConfig) {
    this.id = config.id;
    this.name = config.name;
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL;
    this.defaultModel = config.defaultModel;
    this.modelEnvVar = config.modelEnvVar;
  }

  formatTools(tools: AgentTool[]): unknown[] {
    return toOpenAIFunctions(tools);
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
    // Dynamic import — openai SDK is only loaded at runtime.
    const OpenAI = (await import(/* webpackIgnore: true */ 'openai' as string)).default;
    const client = new OpenAI({
      apiKey: this.apiKey || undefined,
      ...(this.baseURL ? { baseURL: this.baseURL } : {}),
    });

    const openaiTools = toOpenAIFunctions(options.tools);
    const systemPrompt = this.formatSystemPrompt(options.role, options.systemContext);
    const model = process.env[this.modelEnvVar] ?? this.defaultModel;

    const openaiMessages = [
      { role: 'system' as const, content: systemPrompt },
      ...options.messages.map((msg: AgentMessage) => {
        if (msg.role === 'tool_result') {
          return {
            role: 'tool' as const,
            content: msg.content,
            tool_call_id: msg.toolCallId ?? '',
          };
        }
        return {
          role: (msg.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
          content: msg.content,
        };
      }),
    ];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response: any = await client.chat.completions.create({
      model,
      messages: openaiMessages,
      tools: openaiTools,
    });

    const choice = response.choices[0];
    const toolCalls: AgentResponse['toolCalls'] = [];

    if (choice?.message?.tool_calls) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const tc of choice.message.tool_calls as any[]) {
        toolCalls.push({
          id: tc.id,
          name: tc.function.name,
          arguments: JSON.parse(tc.function.arguments) as Record<string, unknown>,
        });
      }
    }

    return {
      content: choice?.message?.content ?? '',
      toolCalls,
      stopReason: choice?.finish_reason === 'tool_calls' ? 'tool_use' : choice?.finish_reason === 'length' ? 'max_tokens' : 'end_turn',
    };
  }
}
