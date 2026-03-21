// ===========================================
// ORDINATIO JOBS — BullMQ Adapter
// ===========================================
// Concrete implementation of QueueClient
// backed by BullMQ. Consumers who use BullMQ
// can use this directly; others can implement
// QueueClient with their own queue backend.
// ===========================================

import { Queue } from 'bullmq';
import type { Redis as RedisType } from 'ioredis';
import type {
  QueueClient,
  QueueConfig,
  QueueHealth,
  JobSnapshot,
  AddJobOptions,
  RedisConfig,
} from './types';
import { jobsError } from './errors';

/**
 * Build a Redis connection object from RedisConfig.
 */
export function buildRedisConnection(config: RedisConfig): {
  host: string;
  port: number;
  password?: string;
  maxRetriesPerRequest: number | null;
  db?: number;
} {
  return {
    host: config.host,
    port: config.port,
    password: config.password || undefined,
    maxRetriesPerRequest: config.maxRetriesPerRequest ?? null,
    db: config.db,
  };
}

/**
 * Create a BullMQ-backed QueueClient.
 */
export function createBullMQClient(config: QueueConfig): QueueClient & { queue: Queue } {
  const connection = buildRedisConnection(config.redis);

  const queue = new Queue(config.name, {
    connection,
    defaultJobOptions: config.defaults ? {
      attempts: config.defaults.attempts ?? 3,
      backoff: config.defaults.backoff ?? { type: 'exponential', delay: 5000 },
      removeOnComplete: config.defaults.removeOnComplete ?? { age: 86400, count: 1000 },
      removeOnFail: config.defaults.removeOnFail ?? { age: 604800 },
    } : undefined,
  });

  return {
    queue,

    async addJob(type: string, data: Record<string, unknown>, options?: AddJobOptions): Promise<string> {
      try {
        const job = await queue.add(type, { type, ...data }, {
          priority: options?.priority,
          jobId: options?.jobId,
          delay: options?.delay,
          attempts: options?.attempts,
          repeat: options?.repeat ? {
            every: options.repeat.every,
            pattern: options.repeat.pattern,
          } : undefined,
        });
        return job.id!;
      } catch (error) {
        const { ref } = jobsError('JOBS_100', { type, error: String(error) });
        throw new Error(`[${ref}] Failed to add job "${type}": ${error instanceof Error ? error.message : String(error)}`);
      }
    },

    async getJob(jobId: string): Promise<JobSnapshot | null> {
      const job = await queue.getJob(jobId);
      if (!job) return null;

      const state = await job.getState();
      return {
        id: job.id!,
        type: (job.data as { type?: string }).type ?? job.name,
        status: state as JobSnapshot['status'],
        progress: job.progress as number | Record<string, unknown>,
        attemptsMade: job.attemptsMade,
        failedReason: job.failedReason,
        data: job.data as Record<string, unknown>,
        processedAt: job.processedOn ? new Date(job.processedOn) : undefined,
        finishedAt: job.finishedOn ? new Date(job.finishedOn) : undefined,
      };
    },

    async getHealth(): Promise<QueueHealth> {
      try {
        const counts = await queue.getJobCounts();
        return {
          name: config.name,
          connected: true,
          counts: {
            waiting: counts.waiting ?? 0,
            active: counts.active ?? 0,
            completed: counts.completed ?? 0,
            failed: counts.failed ?? 0,
            delayed: counts.delayed ?? 0,
            paused: counts.paused ?? 0,
          },
          stuckJobCount: 0, // Computed externally by health.ts
        };
      } catch {
        return {
          name: config.name,
          connected: false,
          counts: { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, paused: 0 },
          stuckJobCount: 0,
        };
      }
    },

    async getWaiting(limit: number = 100): Promise<JobSnapshot[]> {
      const jobs = await queue.getWaiting(0, limit - 1);
      return jobs.map(j => ({
        id: j.id!,
        type: (j.data as { type?: string }).type ?? j.name,
        status: 'waiting' as const,
        progress: j.progress as number | Record<string, unknown>,
        attemptsMade: j.attemptsMade,
        data: j.data as Record<string, unknown>,
      }));
    },

    async getActive(limit: number = 100): Promise<JobSnapshot[]> {
      const jobs = await queue.getActive(0, limit - 1);
      return jobs.map(j => ({
        id: j.id!,
        type: (j.data as { type?: string }).type ?? j.name,
        status: 'active' as const,
        progress: j.progress as number | Record<string, unknown>,
        attemptsMade: j.attemptsMade,
        data: j.data as Record<string, unknown>,
        processedAt: j.processedOn ? new Date(j.processedOn) : undefined,
      }));
    },

    async getFailed(limit: number = 100): Promise<JobSnapshot[]> {
      const jobs = await queue.getFailed(0, limit - 1);
      return jobs.map(j => ({
        id: j.id!,
        type: (j.data as { type?: string }).type ?? j.name,
        status: 'failed' as const,
        progress: j.progress as number | Record<string, unknown>,
        attemptsMade: j.attemptsMade,
        failedReason: j.failedReason,
        data: j.data as Record<string, unknown>,
        finishedAt: j.finishedOn ? new Date(j.finishedOn) : undefined,
      }));
    },

    async removeJob(jobId: string): Promise<boolean> {
      const job = await queue.getJob(jobId);
      if (!job) return false;
      await job.remove();
      return true;
    },

    async drain(): Promise<void> {
      await queue.drain();
    },

    async close(): Promise<void> {
      await queue.close();
    },
  };
}

/**
 * Test Redis connectivity by pinging.
 * @throws JOBS_110 if connection fails.
 */
export async function testRedisConnection(config: RedisConfig): Promise<void> {
  // Dynamic import to avoid hard dependency on ioredis at module load
  const { Redis } = await import('ioredis');
  const redis = new Redis({
    host: config.host,
    port: config.port,
    password: config.password || undefined,
    db: config.db,
    lazyConnect: true,
  });

  try {
    await redis.connect();
    const pong = await redis.ping();
    if (pong !== 'PONG') {
      throw new Error('Redis PING did not return PONG');
    }
  } catch (error) {
    const { ref } = jobsError('JOBS_110', { host: config.host, port: config.port });
    throw new Error(
      `[${ref}] Redis connection failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    await redis.quit();
  }
}
