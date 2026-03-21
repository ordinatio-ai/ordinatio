// ===========================================
// ORDINATIO SETTINGS — Settings Service Tests
// ===========================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SettingsDb, SettingsCallbacks } from '../types';
import {
  getSetting,
  setSetting,
  getAllSettings,
  getSafeSettings,
  getPublicSettings,
  getSettingWithManifest,
  getSettingVisibility,
  validateSettingValue,
  getBooleanSetting,
  setBooleanSetting,
  SETTINGS_KEYS,
  SETTING_METADATA,
  SettingsValidationError,
  SettingsVetoError,
} from '../settings';
import {
  maskApiKey,
  ALL_PROVIDER_IDS,
  PROVIDER_CONFIG,
} from '../ai-settings';
import {
  settingsError,
  SETTINGS_ERRORS,
} from '../errors';
import {
  SettingKeySchema,
  UpdateSettingSchema,
} from '../validation';

function createMockDb(): SettingsDb & { systemSettings: { findUnique: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn>; upsert: ReturnType<typeof vi.fn> } } {
  return {
    systemSettings: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
  };
}

describe('settings', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
    vi.clearAllMocks();
  });

  describe('getSetting', () => {
    it('returns value when setting exists', async () => {
      db.systemSettings.findUnique.mockResolvedValue({ key: 'admin_feed_enabled', value: 'false' });

      const result = await getSetting(db, 'admin_feed_enabled');
      expect(result).toBe('false');
      expect(db.systemSettings.findUnique).toHaveBeenCalledWith({ where: { key: 'admin_feed_enabled' } });
    });

    it('returns default value when setting does not exist', async () => {
      db.systemSettings.findUnique.mockResolvedValue(null);

      const result = await getSetting(db, 'admin_feed_enabled');
      expect(result).toBe('true'); // built-in default
    });

    it('returns stored value overriding default', async () => {
      db.systemSettings.findUnique.mockResolvedValue({ key: 'admin_feed_enabled', value: 'false' });

      const result = await getSetting(db, 'admin_feed_enabled');
      expect(result).toBe('false');
    });
  });

  describe('getBooleanSetting', () => {
    it('returns true when value is "true"', async () => {
      db.systemSettings.findUnique.mockResolvedValue({ key: 'admin_feed_enabled', value: 'true' });
      expect(await getBooleanSetting(db, 'admin_feed_enabled')).toBe(true);
    });

    it('returns false when value is "false"', async () => {
      db.systemSettings.findUnique.mockResolvedValue({ key: 'admin_feed_enabled', value: 'false' });
      expect(await getBooleanSetting(db, 'admin_feed_enabled')).toBe(false);
    });

    it('returns false for any non-"true" value', async () => {
      db.systemSettings.findUnique.mockResolvedValue({ key: 'admin_feed_enabled', value: 'yes' });
      expect(await getBooleanSetting(db, 'admin_feed_enabled')).toBe(false);
    });
  });

  describe('setSetting', () => {
    it('creates or updates a setting', async () => {
      db.systemSettings.findUnique.mockResolvedValue(null); // for old value lookup
      db.systemSettings.upsert.mockResolvedValue({ key: 'llm_provider', value: 'openai' });

      await setSetting(db, 'llm_provider', 'openai');

      expect(db.systemSettings.upsert).toHaveBeenCalledWith({
        where: { key: 'llm_provider' },
        create: { key: 'llm_provider', value: 'openai', description: undefined },
        update: { value: 'openai', description: undefined },
      });
    });

    it('includes description when provided', async () => {
      db.systemSettings.findUnique.mockResolvedValue(null);
      db.systemSettings.upsert.mockResolvedValue({ key: 'admin_feed_enabled', value: 'true' });

      await setSetting(db, 'admin_feed_enabled', 'true', 'Enable admin feed');

      expect(db.systemSettings.upsert).toHaveBeenCalledWith({
        where: { key: 'admin_feed_enabled' },
        create: { key: 'admin_feed_enabled', value: 'true', description: 'Enable admin feed' },
        update: { value: 'true', description: 'Enable admin feed' },
      });
    });

    it('calls onSettingChanged callback', async () => {
      db.systemSettings.findUnique.mockResolvedValue(null);
      db.systemSettings.upsert.mockResolvedValue({ key: 'llm_provider', value: 'openai' });
      const onSettingChanged = vi.fn();

      await setSetting(db, 'llm_provider', 'openai', undefined, { onSettingChanged });

      expect(onSettingChanged).toHaveBeenCalledWith('llm_provider', 'openai');
    });

    it('throws SettingsValidationError for invalid provider ID', async () => {
      await expect(
        setSetting(db, 'llm_provider', 'fake_provider')
      ).rejects.toThrow(SettingsValidationError);

      expect(db.systemSettings.upsert).not.toHaveBeenCalled();
    });

    it('throws SettingsValidationError for invalid boolean value', async () => {
      await expect(
        setSetting(db, 'admin_feed_enabled', 'yes')
      ).rejects.toThrow(SettingsValidationError);
    });

    it('allows valid provider IDs', async () => {
      db.systemSettings.findUnique.mockResolvedValue(null);
      db.systemSettings.upsert.mockResolvedValue({ key: 'llm_provider', value: 'openai' });

      await expect(setSetting(db, 'llm_provider', 'openai')).resolves.toBeUndefined();
      await expect(setSetting(db, 'llm_provider', '')).resolves.toBeUndefined();
    });

    it('allows any string for API key settings', async () => {
      db.systemSettings.findUnique.mockResolvedValue(null);
      db.systemSettings.upsert.mockResolvedValue({ key: 'anthropic_api_key', value: 'sk-test' });

      await expect(setSetting(db, 'anthropic_api_key', 'sk-test-12345')).resolves.toBeUndefined();
    });
  });

  describe('setSetting — sentinel callback', () => {
    it('calls onBeforeChange and allows if approved', async () => {
      db.systemSettings.findUnique.mockResolvedValue({ key: 'llm_provider', value: 'claude' });
      db.systemSettings.upsert.mockResolvedValue({ key: 'llm_provider', value: 'openai' });

      const onBeforeChange = vi.fn().mockResolvedValue({ allowed: true });
      const callbacks: SettingsCallbacks = { onBeforeChange };

      await setSetting(db, 'llm_provider', 'openai', undefined, callbacks, { source: 'ui', changedBy: 'admin-1' });

      expect(onBeforeChange).toHaveBeenCalledWith({
        key: 'llm_provider',
        oldValue: 'claude',
        newValue: 'openai',
        changedBy: 'admin-1',
        source: 'ui',
      });
      expect(db.systemSettings.upsert).toHaveBeenCalled();
    });

    it('throws SettingsVetoError if onBeforeChange rejects', async () => {
      db.systemSettings.findUnique.mockResolvedValue({ key: 'llm_provider', value: 'claude' });

      const onBeforeChange = vi.fn().mockResolvedValue({ allowed: false, reason: 'Policy violation' });
      const callbacks: SettingsCallbacks = { onBeforeChange };

      await expect(
        setSetting(db, 'llm_provider', 'openai', undefined, callbacks)
      ).rejects.toThrow(SettingsVetoError);

      expect(db.systemSettings.upsert).not.toHaveBeenCalled();
    });

    it('includes veto reason in error', async () => {
      db.systemSettings.findUnique.mockResolvedValue({ key: 'llm_provider', value: 'claude' });

      const onBeforeChange = vi.fn().mockResolvedValue({ allowed: false, reason: 'Requires approval' });
      const callbacks: SettingsCallbacks = { onBeforeChange };

      try {
        await setSetting(db, 'llm_provider', 'openai', undefined, callbacks);
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(SettingsVetoError);
        expect((err as SettingsVetoError).reason).toBe('Requires approval');
      }
    });
  });

  describe('setSetting — history recording', () => {
    it('records history when settingHistory is available on db', async () => {
      const historyCreate = vi.fn().mockResolvedValue({ id: 'h1' });
      const historyUpdateMany = vi.fn().mockResolvedValue({ count: 0 });
      const dbWithHistory = {
        ...createMockDb(),
        settingHistory: {
          create: historyCreate,
          findMany: vi.fn(),
          updateMany: historyUpdateMany,
        },
      };
      dbWithHistory.systemSettings.findUnique.mockResolvedValue(null);
      dbWithHistory.systemSettings.upsert.mockResolvedValue({ key: 'llm_provider', value: 'openai' });

      await setSetting(dbWithHistory, 'llm_provider', 'openai', undefined, undefined, { source: 'ui', changedBy: 'user-1' });

      expect(historyUpdateMany).toHaveBeenCalled();
      expect(historyCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          key: 'llm_provider',
          newValue: 'openai',
          source: 'ui',
          changedBy: 'user-1',
        }),
      });
    });

    it('skips history when settingHistory is not on db', async () => {
      db.systemSettings.findUnique.mockResolvedValue(null);
      db.systemSettings.upsert.mockResolvedValue({ key: 'llm_provider', value: 'openai' });

      // Should not throw even without settingHistory
      await expect(setSetting(db, 'llm_provider', 'openai')).resolves.toBeUndefined();
    });
  });

  describe('setBooleanSetting', () => {
    it('sets "true" for true value', async () => {
      db.systemSettings.findUnique.mockResolvedValue(null);
      db.systemSettings.upsert.mockResolvedValue({});
      await setBooleanSetting(db, 'admin_feed_enabled', true);
      expect(db.systemSettings.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ value: 'true' }),
          update: expect.objectContaining({ value: 'true' }),
        })
      );
    });

    it('sets "false" for false value', async () => {
      db.systemSettings.findUnique.mockResolvedValue(null);
      db.systemSettings.upsert.mockResolvedValue({});
      await setBooleanSetting(db, 'admin_feed_enabled', false);
      expect(db.systemSettings.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ value: 'false' }),
          update: expect.objectContaining({ value: 'false' }),
        })
      );
    });
  });

  describe('getAllSettings', () => {
    it('returns stored settings merged with defaults', async () => {
      db.systemSettings.findMany.mockResolvedValue([
        { key: 'admin_feed_enabled', value: 'false' },
        { key: 'other_setting', value: 'some_value' },
      ]);

      const result = await getAllSettings(db);
      expect(result).toMatchObject({
        admin_feed_enabled: 'false',
        other_setting: 'some_value',
      });
      expect(result).toHaveProperty('llm_provider', 'claude');
    });

    it('returns defaults when no settings in database', async () => {
      db.systemSettings.findMany.mockResolvedValue([]);

      const result = await getAllSettings(db);
      expect(result).toMatchObject({
        admin_feed_enabled: 'true',
        llm_provider: 'claude',
        anthropic_api_key: '',
      });
    });

    it('stored values override defaults', async () => {
      db.systemSettings.findMany.mockResolvedValue([
        { key: 'admin_feed_enabled', value: 'false' },
      ]);

      const result = await getAllSettings(db);
      expect(result.admin_feed_enabled).toBe('false');
    });
  });

  describe('SETTINGS_KEYS', () => {
    it('has ADMIN_FEED_ENABLED key defined', () => {
      expect(SETTINGS_KEYS.ADMIN_FEED_ENABLED).toBe('admin_feed_enabled');
    });
  });
});

describe('visibility + safe getters', () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
    vi.clearAllMocks();
  });

  describe('SETTING_METADATA', () => {
    it('has metadata for all SETTINGS_KEYS', () => {
      for (const key of Object.values(SETTINGS_KEYS)) {
        expect(SETTING_METADATA[key], `Missing metadata for ${key}`).toBeDefined();
        expect(SETTING_METADATA[key].visibility).toBeTruthy();
        expect(SETTING_METADATA[key].description).toBeTruthy();
      }
    });

    it('API keys are marked as secret', () => {
      expect(SETTING_METADATA.anthropic_api_key.visibility).toBe('secret');
      expect(SETTING_METADATA.openai_api_key.visibility).toBe('secret');
      expect(SETTING_METADATA.gemini_api_key.visibility).toBe('secret');
      expect(SETTING_METADATA.deepseek_api_key.visibility).toBe('secret');
      expect(SETTING_METADATA.mistral_api_key.visibility).toBe('secret');
      expect(SETTING_METADATA.xai_api_key.visibility).toBe('secret');
    });

    it('admin_feed_enabled is public', () => {
      expect(SETTING_METADATA.admin_feed_enabled.visibility).toBe('public');
    });

    it('llm_provider is internal', () => {
      expect(SETTING_METADATA.llm_provider.visibility).toBe('internal');
    });
  });

  describe('getSettingVisibility', () => {
    it('returns correct visibility for known keys', () => {
      expect(getSettingVisibility('anthropic_api_key')).toBe('secret');
      expect(getSettingVisibility('admin_feed_enabled')).toBe('public');
      expect(getSettingVisibility('llm_provider')).toBe('internal');
    });

    it('returns internal for unknown keys', () => {
      expect(getSettingVisibility('unknown_key')).toBe('internal');
    });
  });

  describe('getSafeSettings', () => {
    it('masks secret values', async () => {
      db.systemSettings.findMany.mockResolvedValue([
        { key: 'anthropic_api_key', value: 'sk-ant-api03-very-long-key-here' },
        { key: 'admin_feed_enabled', value: 'true' },
        { key: 'llm_provider', value: 'claude' },
      ]);

      const result = await getSafeSettings(db);

      // Secret key should be masked
      expect(result.anthropic_api_key).not.toBe('sk-ant-api03-very-long-key-here');
      expect(result.anthropic_api_key).toContain('...');

      // Non-secret keys should be plain
      expect(result.admin_feed_enabled).toBe('true');
      expect(result.llm_provider).toBe('claude');
    });

    it('masks empty API keys as empty strings', async () => {
      db.systemSettings.findMany.mockResolvedValue([]);

      const result = await getSafeSettings(db);
      expect(result.anthropic_api_key).toBe('');
    });
  });

  describe('getPublicSettings', () => {
    it('excludes secret keys entirely', async () => {
      db.systemSettings.findMany.mockResolvedValue([
        { key: 'anthropic_api_key', value: 'sk-secret' },
        { key: 'admin_feed_enabled', value: 'true' },
      ]);

      const result = await getPublicSettings(db);

      expect(result).not.toHaveProperty('anthropic_api_key');
      expect(result).not.toHaveProperty('openai_api_key');
      expect(result.admin_feed_enabled).toBe('true');
      expect(result.llm_provider).toBe('claude');
    });
  });

  describe('getSettingWithManifest', () => {
    it('returns manifest with database source', async () => {
      const updatedAt = new Date('2026-03-07T12:00:00Z');
      db.systemSettings.findUnique.mockResolvedValue({
        key: 'llm_provider',
        value: 'openai',
        updatedAt,
      });

      const manifest = await getSettingWithManifest(db, 'llm_provider');

      expect(manifest.value).toBe('openai');
      expect(manifest.source).toBe('database');
      expect(manifest.visibility).toBe('internal');
      expect(manifest.isSecret).toBe(false);
      expect(manifest.lastModified).toEqual(updatedAt);
      expect(manifest.description).toBe('Active LLM provider');
    });

    it('returns default source when not in database', async () => {
      db.systemSettings.findUnique.mockResolvedValue(null);

      const manifest = await getSettingWithManifest(db, 'llm_provider');

      expect(manifest.value).toBe('claude');
      expect(manifest.source).toBe('default');
      expect(manifest.lastModified).toBeNull();
    });

    it('masks secret values in manifest', async () => {
      db.systemSettings.findUnique.mockResolvedValue({
        key: 'anthropic_api_key',
        value: 'sk-ant-api03-really-long-secret-key-value',
        updatedAt: new Date(),
      });

      const manifest = await getSettingWithManifest(db, 'anthropic_api_key');

      expect(manifest.isSecret).toBe(true);
      expect(manifest.value).not.toBe('sk-ant-api03-really-long-secret-key-value');
      expect(manifest.value).toContain('...');
    });
  });
});

describe('validation', () => {
  describe('validateSettingValue', () => {
    it('rejects invalid provider ID', () => {
      const error = validateSettingValue('llm_provider', 'fake_provider');
      expect(error).toContain('Invalid provider ID');
    });

    it('accepts valid provider IDs', () => {
      expect(validateSettingValue('llm_provider', 'claude')).toBeNull();
      expect(validateSettingValue('llm_provider', 'openai')).toBeNull();
      expect(validateSettingValue('llm_provider', '')).toBeNull();
    });

    it('validates role-specific provider overrides', () => {
      expect(validateSettingValue('llm_provider_coo', 'gemini')).toBeNull();
      expect(validateSettingValue('llm_provider_coo', 'invalid')).not.toBeNull();
    });

    it('rejects invalid boolean values for admin_feed_enabled', () => {
      expect(validateSettingValue('admin_feed_enabled', 'yes')).not.toBeNull();
      expect(validateSettingValue('admin_feed_enabled', '1')).not.toBeNull();
    });

    it('accepts valid boolean values', () => {
      expect(validateSettingValue('admin_feed_enabled', 'true')).toBeNull();
      expect(validateSettingValue('admin_feed_enabled', 'false')).toBeNull();
    });

    it('returns null for keys without validators (API keys)', () => {
      expect(validateSettingValue('anthropic_api_key', 'anything')).toBeNull();
      expect(validateSettingValue('openai_api_key', '')).toBeNull();
    });
  });
});

describe('ai-settings', () => {
  describe('maskApiKey', () => {
    it('masks long keys with prefix and suffix', () => {
      expect(maskApiKey('sk-ant-api03-abcdef-ghijkl-mnopqr')).toBe('sk-ant...opqr');
    });

    it('masks short keys with suffix only', () => {
      expect(maskApiKey('short_key')).toBe('****_key');
    });

    it('returns empty for empty input', () => {
      expect(maskApiKey('')).toBe('');
    });

    it('handles edge cases', () => {
      expect(maskApiKey('abc')).toBe('****abc');
      expect(maskApiKey('123456789012')).toBe('****9012');
      expect(maskApiKey('1234567890123')).toBe('123456...0123');
    });
  });

  describe('PROVIDER_CONFIG', () => {
    it('covers all ALL_PROVIDER_IDS entries', () => {
      for (const id of ALL_PROVIDER_IDS) {
        const cfg = PROVIDER_CONFIG[id];
        expect(cfg, `Missing config for provider: ${id}`).toBeDefined();
        expect(cfg.settingKey).toBeTruthy();
        expect(cfg.envVar).toBeTruthy();
        expect(cfg.name).toBeTruthy();
        expect(cfg.placeholder).toBeTruthy();
      }
    });
  });
});

describe('errors', () => {
  it('settingsError generates timestamped ref', () => {
    const err = settingsError('SETTINGS_100');
    expect(err.code).toBe('SETTINGS_100');
    expect(err.ref).toMatch(/^SETTINGS_100-\d{8}T\d{6}$/);
  });

  it('SETTINGS_ERRORS has all expected codes', () => {
    expect(SETTINGS_ERRORS.SETTINGS_100).toBeDefined();
    expect(SETTINGS_ERRORS.SETTINGS_101).toBeDefined();
    expect(SETTINGS_ERRORS.SETTINGS_200).toBeDefined();
    expect(SETTINGS_ERRORS.SETTINGS_205).toBeDefined();
    expect(SETTINGS_ERRORS.SETTINGS_206).toBeDefined();
    expect(SETTINGS_ERRORS.SETTINGS_207).toBeDefined();
    expect(SETTINGS_ERRORS.SETTINGS_208).toBeDefined();
    expect(SETTINGS_ERRORS.SETTINGS_300).toBeDefined();
    expect(SETTINGS_ERRORS.SETTINGS_400).toBeDefined();
    expect(SETTINGS_ERRORS.SETTINGS_401).toBeDefined();
    expect(SETTINGS_ERRORS.SETTINGS_402).toBeDefined();
  });

  it('new error codes have correct metadata', () => {
    expect(SETTINGS_ERRORS.SETTINGS_205.httpStatus).toBe(400);
    expect(SETTINGS_ERRORS.SETTINGS_208.httpStatus).toBe(403);
    expect(SETTINGS_ERRORS.SETTINGS_402.severity).toBe('warn');
  });
});

describe('validation schemas', () => {
  it('SettingKeySchema accepts valid keys', () => {
    expect(SettingKeySchema.safeParse('admin_feed_enabled').success).toBe(true);
    expect(SettingKeySchema.safeParse('llm_provider').success).toBe(true);
    expect(SettingKeySchema.safeParse('anthropic_api_key').success).toBe(true);
  });

  it('SettingKeySchema rejects invalid keys', () => {
    expect(SettingKeySchema.safeParse('hacker_key').success).toBe(false);
    expect(SettingKeySchema.safeParse('').success).toBe(false);
  });

  it('UpdateSettingSchema transforms boolean and number to string', () => {
    const boolResult = UpdateSettingSchema.safeParse({ key: 'admin_feed_enabled', value: true });
    expect(boolResult.success).toBe(true);
    if (boolResult.success) expect(boolResult.data.value).toBe('true');

    const numResult = UpdateSettingSchema.safeParse({ key: 'admin_feed_enabled', value: 42 });
    expect(numResult.success).toBe(true);
    if (numResult.success) expect(numResult.data.value).toBe('42');
  });

  it('UpdateSettingSchema rejects invalid payloads', () => {
    expect(UpdateSettingSchema.safeParse({ value: 'true' }).success).toBe(false);
    expect(UpdateSettingSchema.safeParse({ key: 'INVALID', value: 'x' }).success).toBe(false);
    expect(UpdateSettingSchema.safeParse({ key: null, value: 'x' }).success).toBe(false);
  });

  it('SETTINGS_KEYS matches SettingKeySchema', () => {
    const serviceKeys = Object.values(SETTINGS_KEYS);
    for (const key of serviceKeys) {
      expect(SettingKeySchema.safeParse(key).success, `Key ${key} not in schema`).toBe(true);
    }
  });
});
