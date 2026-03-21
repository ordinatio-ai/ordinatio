// ===========================================
// AUTOMATION QUEUE CLIENT
// ===========================================
// Client for enqueueing automation jobs to Redis.
// Jobs are processed by the worker.
// ===========================================

import { Queue } from 'bullmq';
import type {
  TriggerEventType,
  ConditionComparator,
  ConditionValueType,
  AutomationActionType,
} from './db-types';

// Redis connection from environment
const REDIS_HOST = process.env.REDIS_HOST ?? 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT ?? '6379', 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD;

const redisConnection = {
  host: REDIS_HOST,
  port: REDIS_PORT,
  password: REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
};

// Lazy-initialized queue
let automationQueue: Queue | null = null;

/**
 * Get or create the automation queue connection
 */
function getQueue(): Queue {
  if (!automationQueue) {
    automationQueue = new Queue('automation-executions', {
      connection: redisConnection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: {
          age: 86400,
          count: 1000,
        },
        removeOnFail: {
          age: 604800,
        },
      },
    });
  }
  return automationQueue;
}

// ===========================================
// JOB DATA TYPES (must match worker types)
// ===========================================

export interface AutomationCondition {
  id: string;
  groupIndex: number;
  field: string;
  comparator: ConditionComparator;
  value: string;
  valueType: ConditionValueType;
}

export interface AutomationAction {
  id: string;
  actionType: AutomationActionType;
  sortOrder: number;
  config: Record<string, unknown>;
  useOutputFrom: number | null;
  continueOnError: boolean;
}

export interface QueueAutomationJobData {
  executionId: string;
  automationId: string;
  automationName: string;
  triggerEventType: TriggerEventType;
  triggerEntityType: string;
  triggerEntityId: string;
  triggerData: Record<string, unknown>;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  idempotencyKey: string;
  maxExecutionsPerHour: number | null;
  cooldownSeconds: number;
}

// ===========================================
// QUEUE OPERATIONS
// ===========================================

/**
 * Queue an automation for execution by the worker
 */
export async function queueAutomationExecution(
  data: QueueAutomationJobData
): Promise<string> {
  const queue = getQueue();

  const jobData = {
    type: 'EXECUTE_AUTOMATION' as const,
    ...data,
  };

  // Use idempotency key as job ID to prevent duplicates
  const jobId = `exec-${data.idempotencyKey}`;

  const job = await queue.add('execute', jobData, {
    jobId,
    priority: 0,
  });

  return job.id!;
}

/**
 * Check if the queue is healthy/connected
 */
export async function isQueueHealthy(): Promise<boolean> {
  try {
    const queue = getQueue();
    await queue.getJobCounts();
    return true;
  } catch {
    return false;
  }
}

/**
 * Get queue statistics
 */
export async function getQueueStats(): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}> {
  const queue = getQueue();
  const counts = await queue.getJobCounts();

  return {
    waiting: counts.waiting,
    active: counts.active,
    completed: counts.completed,
    failed: counts.failed,
    delayed: counts.delayed,
  };
}

/**
 * Close the queue connection (for cleanup)
 */
export async function closeQueueConnection(): Promise<void> {
  if (automationQueue) {
    await automationQueue.close();
    automationQueue = null;
  }
}
