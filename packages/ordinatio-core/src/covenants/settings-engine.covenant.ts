// IHS
/**
 * Settings Engine Module Covenant (C-10)
 *
 * Tier 3 — GOVERNANCE (What Orders and Rules)
 *
 * Configuration, feature flags, and user preferences. Agents can read
 * settings and propose changes (risk-gated). Per-organization overrides
 * for multi-tenant deployments.
 *
 * In System 1701: 39+ feature flags, system settings service, user
 * preferences, AI/LLM provider settings, per-org flag overrides.
 */

import type { ModuleCovenant } from '../covenant/types';

export const SETTINGS_ENGINE_COVENANT: ModuleCovenant = {
  // ---------------------------------------------------------------------------
  // Identity
  // ---------------------------------------------------------------------------
  identity: {
    id: 'settings-engine',
    canonicalId: 'C-10',
    version: '0.1.0',
    description:
      'System configuration, feature flags, and user preferences. Per-organization overrides for multi-tenant. Agents read settings for context and propose changes via risk-gated mutations.',
    status: 'canonical',
    tier: 'governance',
    dedication: 'IHS',
  },

  // ---------------------------------------------------------------------------
  // Domain Model
  // ---------------------------------------------------------------------------
  domain: {
    entities: [
      {
        name: 'SystemSetting',
        description: 'Global configuration key-value pair with type, description, and default',
        hasContextLayer: false,
      },
      {
        name: 'FeatureFlag',
        description: 'Boolean toggle that enables/disables functionality. Supports per-org overrides.',
        hasContextLayer: false,
      },
      {
        name: 'UserPreference',
        description: 'Per-user configuration (theme, notification settings, display preferences)',
        hasContextLayer: false,
      },
    ],

    events: [
      {
        id: 'settings.changed',
        description: 'A system setting was modified',
        payloadShape: '{ key, oldValue, newValue, changedBy }',
      },
      {
        id: 'settings.flag_toggled',
        description: 'A feature flag was enabled or disabled',
        payloadShape: '{ flag, enabled, scope: "global" | "organization", changedBy }',
      },
    ],

    subscriptions: [],
  },

  // ---------------------------------------------------------------------------
  // Capabilities
  // ---------------------------------------------------------------------------
  capabilities: [
    // --- Observe ---
    {
      id: 'settings.get',
      description: 'Get system settings, optionally filtered by category',
      type: 'query',
      risk: 'observe',
      dataSensitivity: 'internal',
      inputs: [
        { name: 'category', type: 'string', required: false, description: 'Filter by setting category' },
      ],
      output: '{ settings: SystemSetting[] }',
      whenToUse: 'When you need to check current system configuration.',
    },
    {
      id: 'settings.get_flags',
      description: 'Get all feature flags with their current state (respecting org overrides)',
      type: 'query',
      risk: 'observe',
      dataSensitivity: 'none',
      inputs: [
        { name: 'organizationId', type: 'string', required: false, description: 'Org for override resolution' },
      ],
      output: '{ flags: Record<string, boolean> }',
      whenToUse: 'When checking whether a feature is enabled before taking action.',
    },
    {
      id: 'settings.get_preferences',
      description: 'Get user preferences for the current user',
      type: 'query',
      risk: 'observe',
      dataSensitivity: 'internal',
      inputs: [
        { name: 'userId', type: 'string', required: false, description: 'User ID (defaults to current)' },
      ],
      output: '{ preferences: UserPreference[] }',
      whenToUse: 'When you need to respect user display or notification preferences.',
    },

    // --- Act ---
    {
      id: 'settings.update_preference',
      description: 'Update a user preference',
      type: 'mutation',
      risk: 'act',
      dataSensitivity: 'internal',
      inputs: [
        { name: 'key', type: 'string', required: true, description: 'Preference key' },
        { name: 'value', type: 'string', required: true, description: 'New value' },
      ],
      output: '{ updated: boolean }',
      whenToUse: 'When a user wants to change their personal settings.',
    },

    // --- Govern ---
    {
      id: 'settings.update',
      description: 'Update a system setting. Affects all users. Requires admin or governance approval.',
      type: 'mutation',
      risk: 'govern',
      dataSensitivity: 'internal',
      inputs: [
        { name: 'key', type: 'string', required: true, description: 'Setting key' },
        { name: 'value', type: 'string', required: true, description: 'New value' },
      ],
      output: '{ updated: boolean, previousValue: string }',
      whenToUse: 'CAREFULLY. System settings affect all users. Confirm the impact before changing.',
      pitfalls: ['System-wide impact — always confirm with admin before changing'],
    },
    {
      id: 'settings.toggle_flag',
      description: 'Enable or disable a feature flag. Can be global or per-organization.',
      type: 'mutation',
      risk: 'govern',
      dataSensitivity: 'none',
      inputs: [
        { name: 'flag', type: 'string', required: true, description: 'Feature flag name' },
        { name: 'enabled', type: 'boolean', required: true, description: 'Enable or disable' },
        { name: 'organizationId', type: 'string', required: false, description: 'Org-specific override (omit for global)' },
      ],
      output: '{ toggled: boolean, scope: string }',
      whenToUse: 'CAREFULLY. Feature flags control system capabilities. Disabling may break workflows.',
      pitfalls: [
        'Disabling a flag may break active automations or workflows that depend on the feature',
        'Prefer org-specific overrides over global changes',
      ],
    },
  ],

  // ---------------------------------------------------------------------------
  // Dependencies
  // ---------------------------------------------------------------------------
  dependencies: [
    {
      moduleId: 'auth-engine',
      required: true,
      capabilities: ['auth.get_session'],
    },
    {
      moduleId: 'audit-ledger',
      required: true,
      capabilities: ['audit.record'],
    },
  ],

  // ---------------------------------------------------------------------------
  // Invariants
  // ---------------------------------------------------------------------------
  invariants: {
    alwaysTrue: [
      'Every setting change is recorded with previous value, new value, and actor',
      'Feature flags have a defined default — undefined flags are always false',
      'Per-org overrides take precedence over global flag values',
      'Settings are tenant-scoped where applicable',
    ],
    neverHappens: [
      'A setting is changed without an audit trail entry',
      'A feature flag is undefined at query time (defaults are always present)',
      'User preferences from one user are applied to another',
    ],
  },

  // ---------------------------------------------------------------------------
  // Health Check
  // ---------------------------------------------------------------------------
  healthCheck: async () => ({
    healthy: true,
    message: 'Settings Engine health check — stub implementation',
    checkedAt: new Date(),
  }),
};
