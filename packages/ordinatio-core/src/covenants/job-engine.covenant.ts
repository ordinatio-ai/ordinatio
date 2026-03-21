// IHS
/**
 * Job Engine Module Covenant (C-16)
 *
 * Tier 5 — INTELLIGENCE (What Reasons)
 *
 * Deferred and scheduled execution. The intermittent awakening mechanism
 * per Book IV. Agents spawn jobs. Jobs wake, execute bounded work, produce
 * artifacts, and sleep. Queue-agnostic: BullMQ today, any queue tomorrow.
 *
 * In System 1701: BullMQ queues (order placement, fit profile sync, email),
 * cron scheduler (stock sync, delivery dates, stuck sweep, scheduled placement).
 */

import type { ModuleCovenant } from '../covenant/types';

export const JOB_ENGINE_COVENANT: ModuleCovenant = {
  // ---------------------------------------------------------------------------
  // Identity
  // ---------------------------------------------------------------------------
  identity: {
    id: 'job-engine',
    canonicalId: 'C-16',
    version: '0.1.0',
    description:
      'Queue-agnostic deferred and scheduled execution. BullMQ is one implementation. Supports immediate dispatch, delayed execution, cron schedules, retry with backoff, and dead letter handling. The intermittent awakening mechanism.',
    status: 'canonical',
    tier: 'intelligence',
    dedication: 'IHS',
  },

  // ---------------------------------------------------------------------------
  // Domain Model
  // ---------------------------------------------------------------------------
  domain: {
    entities: [
      {
        name: 'Job',
        description: 'A unit of deferred work: type, payload, status, retry count, result',
        hasContextLayer: false,
      },
      {
        name: 'CronSchedule',
        description: 'Recurring job definition with cron expression and last/next run times',
        hasContextLayer: false,
      },
    ],

    events: [
      {
        id: 'job.queued',
        description: 'Job added to the queue',
        payloadShape: '{ jobId, jobType, delay?, scheduledFor? }',
      },
      {
        id: 'job.started',
        description: 'Job execution began',
        payloadShape: '{ jobId, jobType, attempt }',
      },
      {
        id: 'job.completed',
        description: 'Job completed successfully',
        payloadShape: '{ jobId, jobType, durationMs, result }',
      },
      {
        id: 'job.failed',
        description: 'Job execution failed',
        payloadShape: '{ jobId, jobType, error, attempt, willRetry: boolean }',
      },
      {
        id: 'job.stalled',
        description: 'Job appears stuck — exceeded expected execution time',
        payloadShape: '{ jobId, jobType, startedAt, stalledAfterMs }',
      },
    ],

    subscriptions: [
      'workflow-engine.workflow.state_changed', // Workflows may spawn jobs on transition
      'automation-fabric.automation.action_fired', // Automations may queue deferred work
    ],
  },

  // ---------------------------------------------------------------------------
  // Capabilities
  // ---------------------------------------------------------------------------
  capabilities: [
    // --- Observe ---
    {
      id: 'job.get_queue_health',
      description: 'Get queue health metrics — pending, active, failed, completed counts',
      type: 'query',
      risk: 'observe',
      dataSensitivity: 'none',
      inputs: [
        { name: 'queue', type: 'string', required: false, description: 'Specific queue name (omit for all)' },
      ],
      output: '{ queues: { name: string, waiting: number, active: number, failed: number, completed: number }[] }',
      whenToUse: 'When checking if background processing is healthy — are jobs completing or backing up?',
    },
    {
      id: 'job.get_status',
      description: 'Get the status and details of a specific job',
      type: 'query',
      risk: 'observe',
      dataSensitivity: 'internal',
      inputs: [
        { name: 'jobId', type: 'string', required: true, description: 'The job ID' },
      ],
      output: '{ job: Job }',
      whenToUse: 'When tracking the progress of a specific background job.',
    },
    {
      id: 'job.list_failed',
      description: 'List failed jobs across all queues',
      type: 'query',
      risk: 'observe',
      dataSensitivity: 'internal',
      inputs: [
        { name: 'queue', type: 'string', required: false, description: 'Filter by queue' },
        { name: 'limit', type: 'number', required: false, description: 'Max results (default 20)' },
      ],
      output: '{ jobs: Job[], count: number }',
      whenToUse: 'When investigating why background processing failed.',
    },
    {
      id: 'job.list_schedules',
      description: 'List all cron schedules with next run times',
      type: 'query',
      risk: 'observe',
      dataSensitivity: 'none',
      inputs: [],
      output: '{ schedules: CronSchedule[] }',
      whenToUse: 'When reviewing what recurring jobs are configured and when they run next.',
    },

    // --- Act ---
    {
      id: 'job.dispatch',
      description: 'Queue a new job for execution',
      type: 'action',
      risk: 'act',
      dataSensitivity: 'internal',
      inputs: [
        { name: 'jobType', type: 'string', required: true, description: 'Job type identifier' },
        { name: 'payload', type: 'object', required: true, description: 'Job payload' },
        { name: 'delay', type: 'number', required: false, description: 'Delay in milliseconds before execution' },
      ],
      output: '{ jobId: string, queue: string }',
      whenToUse: 'When work needs to happen in the background — order placement, email sync, report generation.',
    },
    {
      id: 'job.retry',
      description: 'Retry a failed job',
      type: 'action',
      risk: 'act',
      dataSensitivity: 'internal',
      inputs: [
        { name: 'jobId', type: 'string', required: true, description: 'The failed job to retry' },
      ],
      output: '{ retried: boolean, newJobId: string }',
      whenToUse: 'When a failed job should be re-attempted after the root cause is resolved.',
    },

    // --- Govern ---
    {
      id: 'job.manage_schedule',
      description: 'Create, update, or delete a cron schedule. Affects recurring background work.',
      type: 'mutation',
      risk: 'govern',
      dataSensitivity: 'none',
      inputs: [
        { name: 'action', type: 'string', required: true, description: 'create, update, or delete', allowedValues: ['create', 'update', 'delete'] },
        { name: 'scheduleId', type: 'string', required: false, description: 'Schedule ID (for update/delete)' },
        { name: 'jobType', type: 'string', required: false, description: 'Job type to schedule' },
        { name: 'cron', type: 'string', required: false, description: 'Cron expression (for create/update)' },
      ],
      output: '{ scheduleId: string, action: string }',
      whenToUse: 'CAREFULLY. Modifying schedules changes when and how often background work runs.',
      pitfalls: ['Deleting a schedule stops recurring work permanently — ensure no dependencies'],
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
      'Every job has a status: waiting, active, completed, or failed',
      'Failed jobs are retried up to a configurable maximum before moving to dead letter',
      'Stalled jobs are detected and re-queued automatically',
      'Job execution is bounded — timeouts prevent runaway processes',
      'Job data is tenant-scoped',
    ],
    neverHappens: [
      'A job is silently lost — every job reaches completed or dead letter',
      'A stalled job blocks the queue indefinitely',
      'Job execution exceeds its timeout without being killed',
      'Job data crosses tenant boundaries',
    ],
  },

  // ---------------------------------------------------------------------------
  // Health Check
  // ---------------------------------------------------------------------------
  healthCheck: async () => ({
    healthy: true,
    message: 'Job Engine health check — stub implementation',
    checkedAt: new Date(),
  }),
};
