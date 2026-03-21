// IHS
/**
 * Task Engine Module Covenant (C-04)
 *
 * Tier 2 — ACT (What Communicates and Does)
 *
 * Entity-agnostic obligations: what must be done, by whom, by when. Tasks
 * can originate from any source (email, order, automation, agent) and link
 * to any entity. Agents CREATE tasks as their primary action via intent.
 *
 * In System 1701: EmailTask model — tasks are coupled to emails. Target:
 * decouple into universal task system linked to any entity type.
 */

import type { ModuleCovenant } from '../covenant/types';

export const TASK_ENGINE_COVENANT: ModuleCovenant = {
  // ---------------------------------------------------------------------------
  // Identity
  // ---------------------------------------------------------------------------
  identity: {
    id: 'task-engine',
    canonicalId: 'C-04',
    version: '0.1.0',
    description:
      'Entity-agnostic task management. Tasks link to any entity type, support assignment, due dates, categories, and completion tracking. Agents create tasks as their primary action mechanism.',
    status: 'canonical',
    tier: 'act',
    dedication: 'IHS',
  },

  // ---------------------------------------------------------------------------
  // Domain Model
  // ---------------------------------------------------------------------------
  domain: {
    entities: [
      {
        name: 'Task',
        description: 'An obligation with title, description, assignee, due date, status, and entity links',
        hasContextLayer: true,
      },
      {
        name: 'TaskCategory',
        description: 'User-defined category for organizing tasks (e.g., Follow-up, Review, Urgent)',
        hasContextLayer: false,
      },
    ],

    events: [
      {
        id: 'task.created',
        description: 'New task created',
        payloadShape: '{ taskId, title, assigneeId?, dueDate?, sourceEntityType?, sourceEntityId? }',
      },
      {
        id: 'task.completed',
        description: 'Task marked as completed',
        payloadShape: '{ taskId, completedBy, completedAt }',
      },
      {
        id: 'task.reopened',
        description: 'Completed task reopened',
        payloadShape: '{ taskId, reopenedBy }',
      },
      {
        id: 'task.assigned',
        description: 'Task assigned or reassigned to a user',
        payloadShape: '{ taskId, assigneeId, assignedBy }',
      },
      {
        id: 'task.overdue',
        description: 'Task has passed its due date without completion',
        payloadShape: '{ taskId, dueDate, assigneeId }',
      },
    ],

    subscriptions: [
      'email-engine.email.received',   // Auto-create tasks from emails with action items
      'automation-fabric.action_fired', // Automations can create tasks
    ],
  },

  // ---------------------------------------------------------------------------
  // Capabilities
  // ---------------------------------------------------------------------------
  capabilities: [
    // --- Observe ---
    {
      id: 'task.list',
      description: 'List tasks with filtering by status, assignee, category, due date, and linked entity',
      type: 'query',
      risk: 'observe',
      dataSensitivity: 'internal',
      inputs: [
        { name: 'status', type: 'string', required: false, description: 'Filter: open, completed, overdue' },
        { name: 'assigneeId', type: 'string', required: false, description: 'Filter by assignee' },
        { name: 'categoryId', type: 'string', required: false, description: 'Filter by category' },
        { name: 'entityType', type: 'string', required: false, description: 'Filter by linked entity type' },
        { name: 'entityId', type: 'string', required: false, description: 'Filter by linked entity ID' },
        { name: 'page', type: 'number', required: false, description: 'Page number (1-based)' },
      ],
      output: '{ tasks: Task[], total: number, hasMore: boolean }',
      whenToUse: 'When you need to see what tasks exist, what is overdue, or what is assigned to someone.',
    },
    {
      id: 'task.get',
      description: 'Get a single task with full details and linked entity context',
      type: 'query',
      risk: 'observe',
      dataSensitivity: 'internal',
      inputs: [
        { name: 'taskId', type: 'string', required: true, description: 'The task ID' },
      ],
      output: '{ task: Task, linkedEntity?: { type: string, id: string, name: string } }',
      whenToUse: 'When you need full task details or the context of the entity the task is about.',
    },
    {
      id: 'task.list_categories',
      description: 'List available task categories',
      type: 'query',
      risk: 'observe',
      dataSensitivity: 'none',
      inputs: [],
      output: '{ categories: TaskCategory[] }',
      whenToUse: 'When you need to categorize a new task or filter by category.',
    },
    {
      id: 'task.get_overdue',
      description: 'Get all overdue tasks across all assignees',
      type: 'query',
      risk: 'observe',
      dataSensitivity: 'internal',
      inputs: [],
      output: '{ tasks: Task[], count: number }',
      whenToUse: 'When checking for missed deadlines or prioritizing work.',
    },

    // --- Act ---
    {
      id: 'task.create',
      description: 'Create a new task, optionally linked to an entity',
      type: 'mutation',
      risk: 'act',
      dataSensitivity: 'internal',
      inputs: [
        { name: 'title', type: 'string', required: true, description: 'Task title' },
        { name: 'description', type: 'string', required: false, description: 'Detailed description' },
        { name: 'assigneeId', type: 'string', required: false, description: 'User to assign to' },
        { name: 'dueDate', type: 'string', required: false, description: 'ISO date for deadline' },
        { name: 'categoryId', type: 'string', required: false, description: 'Task category' },
        { name: 'entityType', type: 'string', required: false, description: 'Linked entity type' },
        { name: 'entityId', type: 'string', required: false, description: 'Linked entity ID' },
      ],
      output: '{ taskId: string }',
      whenToUse: 'When an action item needs to be tracked — from emails, conversations, agent observations, or user requests.',
    },
    {
      id: 'task.complete',
      description: 'Mark a task as completed',
      type: 'mutation',
      risk: 'act',
      dataSensitivity: 'none',
      inputs: [
        { name: 'taskId', type: 'string', required: true, description: 'The task to complete' },
      ],
      output: '{ completed: boolean, completedAt: string }',
      whenToUse: 'When a task has been fulfilled and should be marked done.',
    },
    {
      id: 'task.reopen',
      description: 'Reopen a completed task',
      type: 'mutation',
      risk: 'act',
      dataSensitivity: 'none',
      inputs: [
        { name: 'taskId', type: 'string', required: true, description: 'The task to reopen' },
      ],
      output: '{ reopened: boolean }',
      whenToUse: 'When a completed task needs further work or was prematurely closed.',
    },
    {
      id: 'task.assign',
      description: 'Assign or reassign a task to a user',
      type: 'mutation',
      risk: 'act',
      dataSensitivity: 'internal',
      inputs: [
        { name: 'taskId', type: 'string', required: true, description: 'The task' },
        { name: 'assigneeId', type: 'string', required: true, description: 'User to assign to' },
      ],
      output: '{ assigned: boolean }',
      whenToUse: 'When a task should be delegated to a specific person.',
    },

    // --- Govern ---
    // No govern-level capabilities — tasks are lightweight, non-destructive
  ],

  // ---------------------------------------------------------------------------
  // Dependencies
  // ---------------------------------------------------------------------------
  dependencies: [
    {
      moduleId: 'entity-registry',
      required: true,
      capabilities: ['entity.resolve', 'entity.get'],
    },
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
      'Tasks are entity-agnostic — any entity type can be linked',
      'Task completion is recorded with timestamp and actor',
      'Overdue tasks are detectable by comparing dueDate to current time',
      'Task data is tenant-scoped — never leaks across organizations',
      'Every task state change produces an audit trail entry',
    ],
    neverHappens: [
      'A task is physically deleted — only completed or archived',
      'Task data crosses tenant boundaries',
      'A task completion loses its timestamp or actor reference',
    ],
  },

  // ---------------------------------------------------------------------------
  // Health Check
  // ---------------------------------------------------------------------------
  healthCheck: async () => ({
    healthy: true,
    message: 'Task Engine health check — stub implementation',
    checkedAt: new Date(),
  }),
};
