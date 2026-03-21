// ===========================================
// GROK (xAI) LLM PROVIDER
// ===========================================
// xAI Grok — thin subclass of the shared
// OpenAI-compatible base provider.
// ===========================================

import { OpenAICompatibleProvider } from './openai-compatible-provider';

export class GrokProvider extends OpenAICompatibleProvider {
  constructor(apiKey?: string) {
    super({
      id: 'grok',
      name: 'xAI Grok',
      apiKey,
      baseURL: 'https://api.x.ai/v1',
      defaultModel: 'grok-3',
      modelEnvVar: 'GROK_MODEL',
    });
  }
}
