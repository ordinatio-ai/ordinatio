// ===========================================
// OPENAI LLM PROVIDER
// ===========================================
// OpenAI GPT — thin subclass of the shared
// OpenAI-compatible base provider.
// ===========================================

import { OpenAICompatibleProvider } from './openai-compatible-provider';

export class OpenAIProvider extends OpenAICompatibleProvider {
  constructor(apiKey?: string) {
    super({
      id: 'openai',
      name: 'OpenAI GPT',
      apiKey,
      defaultModel: 'gpt-4o',
      modelEnvVar: 'OPENAI_MODEL',
    });
  }
}
