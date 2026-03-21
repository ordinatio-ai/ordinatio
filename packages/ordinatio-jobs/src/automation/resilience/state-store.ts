// ===========================================
// AUTOMATION STATE STORE
// ===========================================
// Abstraction for state storage (idempotency, circuit breakers, rate limits).
// Uses in-memory by default, can be configured to use Redis.
//
// In-memory is fine for single-instance deployments.
// For multi-instance deployments, configure Redis.
// ===========================================

// Logger fallback
const logger = {
  info(message: string, _meta?: Record<string, unknown>): void {
    console.info(`[automation/state-store] ${message}`);
  },
  error(message: string, meta?: Record<string, unknown>): void {
    console.error(`[automation/state-store] ${message}`, meta ?? '');
  },
};

// ===========================================
// STORE INTERFACE
// ===========================================

export interface StateStore {
  // Key-value operations with TTL
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlMs: number): Promise<void>;
  delete(key: string): Promise<void>;

  // Atomic increment (for counters)
  incr(key: string, ttlMs: number): Promise<number>;

  // Check if key exists
  exists(key: string): Promise<boolean>;

  // Get multiple keys
  mget(keys: string[]): Promise<(string | null)[]>;

  // Clear all (for testing)
  clear(): Promise<void>;

  // Health check
  isHealthy(): Promise<boolean>;
}

// ===========================================
// IN-MEMORY STORE
// ===========================================

interface InMemoryEntry {
  value: string;
  expiresAt: number;
}

class InMemoryStore implements StateStore {
  private store = new Map<string, InMemoryEntry>();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.startCleanup();
  }

  private startCleanup(): void {
    if (this.cleanupInterval) return;
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.store.entries()) {
        if (entry.expiresAt < now) {
          this.store.delete(key);
        }
      }
    }, 60 * 1000); // Cleanup every minute
    this.cleanupInterval.unref?.();
  }

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlMs: number): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async incr(key: string, ttlMs: number): Promise<number> {
    const entry = this.store.get(key);
    const now = Date.now();

    if (!entry || entry.expiresAt < now) {
      this.store.set(key, {
        value: '1',
        expiresAt: now + ttlMs,
      });
      return 1;
    }

    const newValue = parseInt(entry.value, 10) + 1;
    entry.value = String(newValue);
    return newValue;
  }

  async exists(key: string): Promise<boolean> {
    const entry = this.store.get(key);
    if (!entry) return false;
    if (entry.expiresAt < Date.now()) {
      this.store.delete(key);
      return false;
    }
    return true;
  }

  async mget(keys: string[]): Promise<(string | null)[]> {
    return Promise.all(keys.map((key) => this.get(key)));
  }

  async clear(): Promise<void> {
    this.store.clear();
  }

  async isHealthy(): Promise<boolean> {
    return true;
  }
}

// ===========================================
// REDIS STORE (Optional)
// ===========================================

// Redis store implementation
// Uncomment and configure when Redis is needed

/*
import Redis from 'ioredis';

class RedisStore implements StateStore {
  private client: Redis;
  private prefix: string;

  constructor(redisUrl: string, prefix = 'automation:') {
    this.client = new Redis(redisUrl);
    this.prefix = prefix;

    this.client.on('error', (err) => {
      logger.error('Redis connection error', { error: err.message });
    });
  }

  private key(k: string): string {
    return `${this.prefix}${k}`;
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(this.key(key));
  }

  async set(key: string, value: string, ttlMs: number): Promise<void> {
    await this.client.set(this.key(key), value, 'PX', ttlMs);
  }

  async delete(key: string): Promise<void> {
    await this.client.del(this.key(key));
  }

  async incr(key: string, ttlMs: number): Promise<number> {
    const k = this.key(key);
    const multi = this.client.multi();
    multi.incr(k);
    multi.pexpire(k, ttlMs);
    const results = await multi.exec();
    return results?.[0]?.[1] as number ?? 1;
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.client.exists(this.key(key));
    return result === 1;
  }

  async mget(keys: string[]): Promise<(string | null)[]> {
    if (keys.length === 0) return [];
    return this.client.mget(...keys.map((k) => this.key(k)));
  }

  async clear(): Promise<void> {
    const keys = await this.client.keys(`${this.prefix}*`);
    if (keys.length > 0) {
      await this.client.del(...keys);
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.client.ping();
      return true;
    } catch {
      return false;
    }
  }

  async disconnect(): Promise<void> {
    await this.client.quit();
  }
}
*/

// ===========================================
// STORE FACTORY
// ===========================================

let globalStore: StateStore | null = null;

/**
 * Get the automation state store
 * Uses in-memory by default, can be configured for Redis
 */
export function getStateStore(): StateStore {
  if (!globalStore) {
    // Check for Redis configuration
    const redisUrl = process.env.AUTOMATION_REDIS_URL;

    if (redisUrl) {
      // To enable Redis:
      // 1. Install ioredis: pnpm add ioredis
      // 2. Uncomment the RedisStore class above
      // 3. Uncomment this line:
      // globalStore = new RedisStore(redisUrl);
      logger.info('Redis URL configured but Redis store not enabled. Using in-memory store.');
      globalStore = new InMemoryStore();
    } else {
      globalStore = new InMemoryStore();
    }
  }

  return globalStore;
}

/**
 * Set a custom state store (for testing)
 */
export function setStateStore(store: StateStore): void {
  globalStore = store;
}

/**
 * Reset the state store (for testing)
 */
export function resetStateStore(): void {
  globalStore = null;
}

// ===========================================
// HIGH-LEVEL STATE OPERATIONS
// ===========================================

// Key prefixes for different state types
const PREFIXES = {
  IDEMPOTENCY: 'idem:',
  CIRCUIT: 'circuit:',
  RATE_LIMIT: 'rate:',
  EXECUTION: 'exec:',
};

/**
 * Check and set idempotency key
 * Returns true if this is a duplicate (key already exists)
 */
export async function checkIdempotency(key: string, ttlMs: number = 5 * 60 * 1000): Promise<boolean> {
  const store = getStateStore();
  const fullKey = `${PREFIXES.IDEMPOTENCY}${key}`;

  const exists = await store.exists(fullKey);
  if (exists) {
    return true; // Duplicate
  }

  await store.set(fullKey, '1', ttlMs);
  return false; // Not a duplicate
}

/**
 * Clear idempotency key (for retries)
 */
export async function clearIdempotency(key: string): Promise<void> {
  const store = getStateStore();
  await store.delete(`${PREFIXES.IDEMPOTENCY}${key}`);
}

// Circuit breaker state
export interface CircuitState {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failures: number;
  lastFailure: number;
  halfOpenAttempts: number;
}

/**
 * Get circuit breaker state
 */
export async function getCircuitState(serviceName: string): Promise<CircuitState> {
  const store = getStateStore();
  const data = await store.get(`${PREFIXES.CIRCUIT}${serviceName}`);

  if (!data) {
    return {
      state: 'CLOSED',
      failures: 0,
      lastFailure: 0,
      halfOpenAttempts: 0,
    };
  }

  try {
    return JSON.parse(data);
  } catch {
    return {
      state: 'CLOSED',
      failures: 0,
      lastFailure: 0,
      halfOpenAttempts: 0,
    };
  }
}

/**
 * Update circuit breaker state
 */
export async function setCircuitState(
  serviceName: string,
  state: CircuitState,
  ttlMs: number = 60 * 60 * 1000 // 1 hour
): Promise<void> {
  const store = getStateStore();
  await store.set(
    `${PREFIXES.CIRCUIT}${serviceName}`,
    JSON.stringify(state),
    ttlMs
  );
}

/**
 * Check rate limit for an automation
 * Returns { allowed: boolean, count: number }
 */
export async function checkAutomationRateLimit(
  automationId: string,
  maxPerHour: number
): Promise<{ allowed: boolean; count: number }> {
  const store = getStateStore();
  const key = `${PREFIXES.RATE_LIMIT}${automationId}:hourly`;
  const ttlMs = 60 * 60 * 1000; // 1 hour

  const count = await store.incr(key, ttlMs);

  return {
    allowed: count <= maxPerHour,
    count,
  };
}

/**
 * Track active execution
 */
export async function trackExecution(
  executionId: string,
  automationId: string,
  ttlMs: number = 10 * 60 * 1000 // 10 minutes max
): Promise<void> {
  const store = getStateStore();
  await store.set(
    `${PREFIXES.EXECUTION}${executionId}`,
    JSON.stringify({ automationId, startedAt: Date.now() }),
    ttlMs
  );
}

/**
 * Complete execution tracking
 */
export async function completeExecution(executionId: string): Promise<void> {
  const store = getStateStore();
  await store.delete(`${PREFIXES.EXECUTION}${executionId}`);
}

/**
 * Get store health status
 */
export async function getStoreHealth(): Promise<{
  healthy: boolean;
  type: 'memory' | 'redis';
}> {
  const store = getStateStore();
  const healthy = await store.isHealthy();
  const type = process.env.AUTOMATION_REDIS_URL ? 'redis' : 'memory';

  return { healthy, type };
}
