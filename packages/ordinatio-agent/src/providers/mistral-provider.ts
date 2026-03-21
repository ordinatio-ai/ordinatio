// ===========================================
// MISTRAL LLM PROVIDER
// ===========================================
// Mistral AI — thin subclass of the shared
// OpenAI-compatible base provider.
// ===========================================

import { OpenAICompatibleProvider } from './openai-compatible-provider';

export class MistralProvider extends OpenAICompatibleProvider {
  constructor(apiKey?: string) {
    super({
      id: 'mistral',
      name: 'Mistral AI',
      apiKey,
      baseURL: 'https://api.mistral.ai/v1',
      defaultModel: 'mistral-large-latest',
      modelEnvVar: 'MISTRAL_MODEL',
    });
  }
}
