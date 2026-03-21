// ===========================================
// ORDINATIO SETTINGS — Types
// ===========================================
// Shared types for the settings module.
// Uses a minimal DB interface to avoid
// coupling to a specific Prisma client.
// ===========================================

// ---- Visibility Scopes ----

/** How a setting should be exposed to consumers. */
export type SettingVisibility = 'public' | 'internal' | 'secret';

/** Static metadata for a setting key. */
export interface SettingMeta {
  visibility: SettingVisibility;
  description: string;
  requiresApproval?: boolean;
}

// ---- Setting History ----

export interface SettingHistoryEntry {
  id: string;
  key: string;
  oldValue: string | null;
  newValue: string;
  source: SettingChangeSource;
  changedBy: string | null;
  contentHash: string;
  stateHash?: string | null;
  supersededAt: Date | null;
  createdAt: Date;
}

export type SettingChangeSource = 'ui' | 'api' | 'migration' | 'system';

/** DB interface for setting history (append-only ledger). */
export interface SettingHistoryDb {
  settingHistory: {
    create(args: { data: Omit<SettingHistoryEntry, 'id' | 'createdAt'> & { id?: string; createdAt?: Date } }): Promise<SettingHistoryEntry>;
    findMany(args: { where: { key: string }; orderBy: { createdAt: 'desc' }; take?: number }): Promise<SettingHistoryEntry[]>;
    updateMany(args: { where: { key: string; supersededAt: null }; data: { supersededAt: Date } }): Promise<unknown>;
  };
}

// ---- Sentinel Callback ----

export interface SettingChangeRequest {
  key: string;
  oldValue: string;
  newValue: string;
  changedBy?: string;
  source: SettingChangeSource;
}

// ---- Agentic Manifest ----

export interface SettingManifest {
  value: string;
  source: 'database' | 'default' | 'environment';
  visibility: SettingVisibility;
  isSecret: boolean;
  lastModified: Date | null;
  description: string;
}

// ---- DB Interfaces ----

/**
 * Minimal database interface for settings operations.
 * Accepts any Prisma client that has `systemSettings` and `userPreference` models.
 */
export interface SettingsDb {
  systemSettings: {
    findUnique(args: { where: { key: string } }): Promise<{ key: string; value: string; description?: string | null; updatedAt?: Date | null } | null>;
    upsert(args: {
      where: { key: string };
      create: { key: string; value: string; description?: string };
      update: { value: string; description?: string };
    }): Promise<{ key: string; value: string }>;
    findMany(args?: { take?: number }): Promise<Array<{ key: string; value: string }>>;
  };
}

/**
 * Minimal database interface for user preferences operations.
 */
export interface UserPreferenceDb {
  userPreference: {
    findUnique(args: { where: { userId: string } }): Promise<UserPreference | null>;
    create(args: { data: { userId: string; replyLayout: ReplyLayout } }): Promise<UserPreference>;
    upsert(args: {
      where: { userId: string };
      update: { replyLayout?: ReplyLayout };
      create: { userId: string; replyLayout: ReplyLayout };
    }): Promise<UserPreference>;
  };
}

/**
 * Reply layout options for the email composer.
 */
export type ReplyLayout = 'MODAL' | 'SPLIT_HORIZONTAL' | 'SPLIT_VERTICAL' | 'POPOUT';

/**
 * User preference record shape.
 */
export interface UserPreference {
  id: string;
  userId: string;
  replyLayout: ReplyLayout;
  createdAt: Date;
  updatedAt: Date;
}

/** All supported LLM provider IDs. */
export type ProviderId = 'claude' | 'openai' | 'gemini' | 'deepseek' | 'mistral' | 'grok';

/** Static config for each LLM provider. */
export interface ProviderConfig {
  settingKey: string;
  envVar: string;
  name: string;
  placeholder: string;
}

/** Provider summary for UI display. */
export interface ProviderInfo {
  id: ProviderId;
  name: string;
  maskedKey: string;
  configured: boolean;
  placeholder: string;
}

/** AI settings bundle returned to the UI. */
export interface AISettings {
  provider: string;
  providers: ProviderInfo[];
  roleOverrides: Record<string, string>;
}

/**
 * Optional callbacks for settings mutations.
 */
export interface SettingsCallbacks {
  onBeforeChange?: (change: SettingChangeRequest) => Promise<{ allowed: boolean; reason?: string }>;
  onSettingChanged?: (key: string, value: string, userId?: string) => Promise<void>;
  onPreferenceChanged?: (userId: string, changes: Record<string, unknown>) => Promise<void>;
}

// ---- Encryption ----

/** Provider for encryption keys. */
export interface KeyProvider {
  getEncryptionKey(): Promise<Buffer>;
  rotateKey?(): Promise<void>;
}

/** Configuration for settings module. */
export interface SettingsConfig {
  keyProvider?: KeyProvider;
}

// ---- Provider IDs (canonical list, shared by settings + ai-settings) ----

/** All supported LLM provider IDs — canonical list. */
export const ALL_PROVIDER_IDS: ProviderId[] = ['claude', 'openai', 'gemini', 'deepseek', 'mistral', 'grok'];
