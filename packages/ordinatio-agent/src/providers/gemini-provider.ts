// ===========================================
// GOOGLE GEMINI LLM PROVIDER
// ===========================================
// Google Gemini implementation of LLMProvider.
// Uses the @google/generative-ai SDK.
// Gemini has a different API shape from OpenAI,
// so this is a full implementation (not a subclass).
// ===========================================

import type { AgentMessage, AgentResponse, AgentRole, AgentTool, LLMProvider } from '../types';
import { toGeminiFunctionDeclarations } from '../orchestrator/tool-adapter';

export class GeminiProvider implements LLMProvider {
  id = 'gemini';
  name = 'Google Gemini';
  private apiKey?: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey;
  }

  formatTools(tools: AgentTool[]): unknown[] {
    return toGeminiFunctionDeclarations(tools);
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
    // Dynamic import — @google/generative-ai is only loaded at runtime.
    const { GoogleGenerativeAI } = await import(
      /* webpackIgnore: true */ '@google/generative-ai' as string
    );

    const genAI = new GoogleGenerativeAI(this.apiKey || process.env.GEMINI_API_KEY || '');
    const model = process.env.GEMINI_MODEL ?? 'gemini-2.0-flash';
    const systemPrompt = this.formatSystemPrompt(options.role, options.systemContext);
    const functionDeclarations = toGeminiFunctionDeclarations(options.tools);

    const generativeModel = genAI.getGenerativeModel({
      model,
      systemInstruction: systemPrompt,
      tools: functionDeclarations.length > 0
        ? [{ functionDeclarations }]
        : undefined,
    });

    // Convert messages to Gemini format
    const geminiHistory: Array<{ role: 'user' | 'model'; parts: Array<Record<string, unknown>> }> = [];

    for (const msg of options.messages) {
      if (msg.role === 'user') {
        geminiHistory.push({
          role: 'user',
          parts: [{ text: msg.content }],
        });
      } else if (msg.role === 'assistant') {
        geminiHistory.push({
          role: 'model',
          parts: [{ text: msg.content }],
        });
      } else if (msg.role === 'tool_result') {
        // Gemini returns function responses as user messages
        geminiHistory.push({
          role: 'user',
          parts: [{
            functionResponse: {
              name: msg.toolName ?? 'unknown',
              response: { content: msg.content },
            },
          }],
        });
      }
    }

    // The last message is the one we send; everything else is history
    const lastMessage = geminiHistory.pop();
    if (!lastMessage) {
      return { content: '', toolCalls: [], stopReason: 'end_turn' };
    }

    const chat = generativeModel.startChat({
      history: geminiHistory,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await chat.sendMessage(lastMessage.parts);
    const response = result.response;

    const toolCalls: AgentResponse['toolCalls'] = [];
    let content = '';

    // Extract text and function calls from the response
    if (response.candidates?.[0]?.content?.parts) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const part of response.candidates[0].content.parts as any[]) {
        if (part.text) {
          content += part.text;
        }
        if (part.functionCall) {
          // Gemini doesn't provide IDs for function calls — generate synthetic ones
          toolCalls.push({
            id: crypto.randomUUID(),
            name: part.functionCall.name,
            arguments: (part.functionCall.args ?? {}) as Record<string, unknown>,
          });
        }
      }
    }

    // Determine stop reason
    const finishReason = response.candidates?.[0]?.finishReason;
    let stopReason: AgentResponse['stopReason'] = 'end_turn';
    if (toolCalls.length > 0) {
      stopReason = 'tool_use';
    } else if (finishReason === 'MAX_TOKENS') {
      stopReason = 'max_tokens';
    }

    return { content, toolCalls, stopReason };
  }
}
