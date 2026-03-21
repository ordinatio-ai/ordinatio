// ===========================================
// AGENT FRAMEWORK — LLM PROVIDER FACTORY
// ===========================================
// Returns the configured LLM provider instance.
// Accepts a KeyProvider for API key + provider
// resolution. No direct DB or env imports.
// ===========================================

import type { LLMProvider, KeyProvider } from '../types';

let _cachedProvider: LLMProvider | null = null;

/**
 * Get the configured LLM provider.
 *
 * Resolution order:
 * 1. Explicit `id` parameter
 * 2. Role-specific setting (via KeyProvider.getProviderForRole)
 * 3. Global setting (via KeyProvider.getGlobalProvider)
 * 4. `LLM_PROVIDER` environment variable
 * 5. Default: 'claude'
 *
 * API key resolution (per provider):
 * 1. KeyProvider.getApiKey
 * 2. Environment variable (e.g. ANTHROPIC_API_KEY)
 */
export async function getProvider(options?: {
  keyProvider?: KeyProvider;
  id?: string;
  roleId?: string;
}): Promise<LLMProvider> {
  const { keyProvider, id, roleId } = options ?? {};

  // Resolve provider ID: explicit > role-specific > global > env > default
  let providerId = id;
  if (!providerId && roleId && keyProvider?.getProviderForRole) {
    providerId = (await keyProvider.getProviderForRole(roleId)) ?? undefined;
  }
  if (!providerId) {
    providerId = keyProvider?.getGlobalProvider
      ? await keyProvider.getGlobalProvider()
      : (process.env.LLM_PROVIDER ?? 'claude');
  }

  // When role-specific, skip the shared cache (different roles may use different providers)
  const useCache = !roleId || !id;
  if (useCache && _cachedProvider && _cachedProvider.id === providerId) {
    return _cachedProvider;
  }

  const apiKey = keyProvider?.getApiKey
    ? (await keyProvider.getApiKey(providerId)) ?? undefined
    : undefined;

  const provider = await buildProvider(providerId, apiKey);

  // Only cache the global provider (role-specific providers are transient)
  if (useCache) {
    _cachedProvider = provider;
  }

  return provider;
}

async function buildProvider(providerId: string, apiKey?: string): Promise<LLMProvider> {
  switch (providerId) {
    case 'claude': {
      const { ClaudeProvider } = await import('./claude-provider');
      return new ClaudeProvider(apiKey);
    }
    case 'openai': {
      const { OpenAIProvider } = await import('./openai-provider');
      return new OpenAIProvider(apiKey);
    }
    case 'gemini': {
      const { GeminiProvider } = await import('./gemini-provider');
      return new GeminiProvider(apiKey);
    }
    case 'deepseek': {
      const { DeepSeekProvider } = await import('./deepseek-provider');
      return new DeepSeekProvider(apiKey);
    }
    case 'mistral': {
      const { MistralProvider } = await import('./mistral-provider');
      return new MistralProvider(apiKey);
    }
    case 'grok': {
      const { GrokProvider } = await import('./grok-provider');
      return new GrokProvider(apiKey);
    }
    default:
      throw new Error(
        `Unknown LLM provider: "${providerId}". Supported: claude, openai, gemini, deepseek, mistral, grok`,
      );
  }
}

/** Clear the cached provider (for testing or after settings change). */
export function clearProviderCache(): void {
  _cachedProvider = null;
}
