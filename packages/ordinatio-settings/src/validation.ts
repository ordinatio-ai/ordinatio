// ===========================================
// ORDINATIO SETTINGS — Validation Schemas
// ===========================================
// Zod schemas for validating settings API requests.
// ===========================================

import { z } from 'zod';

// Valid setting keys (must match SETTINGS_KEYS in settings.ts)
export const SettingKeySchema = z.enum([
  'admin_feed_enabled',
  'llm_provider',
  'llm_provider_bookkeeper',
  'llm_provider_coo',
  'anthropic_api_key',
  'openai_api_key',
  'gemini_api_key',
  'deepseek_api_key',
  'mistral_api_key',
  'xai_api_key',
]);

// Update setting request schema
export const UpdateSettingSchema = z.object({
  key: SettingKeySchema,
  value: z.union([z.string(), z.boolean(), z.number()]).transform((val) => String(val)),
});

// Type exports
export type SettingKeyValue = z.infer<typeof SettingKeySchema>;
export type UpdateSettingInput = z.infer<typeof UpdateSettingSchema>;
