// ===========================================
// DEEPSEEK LLM PROVIDER
// ===========================================
// DeepSeek — thin subclass of the shared
// OpenAI-compatible base provider.
// ===========================================

import { OpenAICompatibleProvider } from './openai-compatible-provider';

export class DeepSeekProvider extends OpenAICompatibleProvider {
  constructor(apiKey?: string) {
    super({
      id: 'deepseek',
      name: 'DeepSeek',
      apiKey,
      baseURL: 'https://api.deepseek.com',
      defaultModel: 'deepseek-chat',
      modelEnvVar: 'DEEPSEEK_MODEL',
    });
  }
}
