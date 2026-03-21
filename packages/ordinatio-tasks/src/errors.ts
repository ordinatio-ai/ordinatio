// ===========================================
// TASK ENGINE — ERROR REGISTRY
// ===========================================
// Rule 8 compliance: unique timestamped error references.
// Format: TASK_{CODE}-{TIMESTAMP}
// ===========================================

/**
 * Enhanced error builder v2 — full diagnostic object.
 * Machines read this and know: what broke, when, where in the code,
 * how bad it is, whether to retry, how to fix it, and the runtime
 * data from the moment it happened.
 */
export function taskError(code: string, context?: Record<string, unknown>): {
  code: string;
  ref: string;
  timestamp: string;
  module: string;
  description: string;
  severity: string;
  recoverable: boolean;
  diagnosis: string[];
  context: Record<string, unknown>;
} {
  const def = TASK_ERRORS[code] ?? INTENT_ERRORS?.[code];
  const ts = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, '');

  if (!def) {
    return {
      code,
      ref: `${code}-${ts}`,
      timestamp: new Date().toISOString(),
      module: 'TASK',
      description: `Unknown error code: ${code}`,
      severity: 'error',
      recoverable: false,
      diagnosis: [],
      context: context || {},
    };
  }

  return {
    code: def.code,
    ref: `${def.code}-${ts}`,
    timestamp: new Date().toISOString(),
    module: 'TASK',
    description: def.description,
    severity: def.severity,
    recoverable: def.recoverable,
    diagnosis: [...def.diagnosis],
    context: context || {},
  };
}

export const TASK_ERRORS = {
  // --- Queries (100-109) ---
  TASK_100: {
    code: 'TASK_100',
    file: 'task-queries.ts',
    function: 'getTasks',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: true,
    description: 'Failed to list tasks',
    diagnosis: ['Check database connectivity', 'Verify Prisma schema is up to date'],
  },
  TASK_101: {
    code: 'TASK_101',
    file: 'task-queries.ts',
    function: 'getTask',
    httpStatus: 404,
    severity: 'warning' as const,
    recoverable: true,
    description: 'Task not found',
    diagnosis: ['Verify task ID is correct', 'Task may have been deleted'],
  },
  TASK_102: {
    code: 'TASK_102',
    file: 'task-mutations.ts',
    function: 'createTaskFromEmail',
    httpStatus: 400,
    severity: 'error' as const,
    recoverable: true,
    description: 'Failed to create task from email',
    diagnosis: ['Verify email ID exists', 'Check required fields are provided'],
  },
  TASK_103: {
    code: 'TASK_103',
    file: 'task-mutations.ts',
    function: 'updateTask',
    httpStatus: 400,
    severity: 'error' as const,
    recoverable: true,
    description: 'Failed to update task',
    diagnosis: ['Verify task exists', 'Check update data is valid'],
  },
  TASK_104: {
    code: 'TASK_104',
    file: 'task-mutations.ts',
    function: 'completeTask',
    httpStatus: 400,
    severity: 'error' as const,
    recoverable: true,
    description: 'Failed to complete task',
    diagnosis: ['Verify task exists', 'Check task is not already completed'],
  },
  TASK_105: {
    code: 'TASK_105',
    file: 'task-mutations.ts',
    function: 'reopenTask',
    httpStatus: 400,
    severity: 'error' as const,
    recoverable: true,
    description: 'Failed to reopen task',
    diagnosis: ['Verify task exists', 'Check task is in COMPLETED status'],
  },
  TASK_106: {
    code: 'TASK_106',
    file: 'task-mutations.ts',
    function: 'deleteTask',
    httpStatus: 400,
    severity: 'error' as const,
    recoverable: true,
    description: 'Failed to delete task',
    diagnosis: ['Verify task exists', 'Check for cascade constraints'],
  },
  TASK_107: {
    code: 'TASK_107',
    file: 'task-queries.ts',
    function: 'getTaskCounts',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: true,
    description: 'Failed to get task counts',
    diagnosis: ['Check database connectivity', 'Verify groupBy query is valid'],
  },
  TASK_108: {
    code: 'TASK_108',
    file: 'task-queries.ts',
    function: 'getMyTasks',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: true,
    description: 'Failed to get user tasks',
    diagnosis: ['Check database connectivity', 'Verify user ID is valid'],
  },

  // --- Categories (110-119) ---
  TASK_110: {
    code: 'TASK_110',
    file: 'task-category.ts',
    function: 'createCategory',
    httpStatus: 400,
    severity: 'error' as const,
    recoverable: true,
    description: 'Failed to create task category',
    diagnosis: ['Check for duplicate category name', 'Verify input data'],
  },
  TASK_111: {
    code: 'TASK_111',
    file: 'task-category.ts',
    function: 'updateCategory',
    httpStatus: 400,
    severity: 'error' as const,
    recoverable: true,
    description: 'Failed to update task category',
    diagnosis: ['Verify category exists', 'Check for name conflicts'],
  },
  TASK_112: {
    code: 'TASK_112',
    file: 'task-category.ts',
    function: 'deleteCategory',
    httpStatus: 400,
    severity: 'error' as const,
    recoverable: true,
    description: 'Failed to delete task category',
    diagnosis: ['Verify category exists', 'Tasks will have categoryId set to null'],
  },
  TASK_113: {
    code: 'TASK_113',
    file: 'task-category.ts',
    function: 'getCategories',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: true,
    description: 'Failed to list task categories',
    diagnosis: ['Check database connectivity'],
  },
  TASK_114: {
    code: 'TASK_114',
    file: 'task-category.ts',
    function: 'getCategoriesWithCounts',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: true,
    description: 'Failed to list task categories with counts',
    diagnosis: ['Check database connectivity', 'Verify include query is valid'],
  },
  TASK_115: {
    code: 'TASK_115',
    file: 'task-category.ts',
    function: 'getCategoryById',
    httpStatus: 404,
    severity: 'warning' as const,
    recoverable: true,
    description: 'Task category not found',
    diagnosis: ['Verify category ID is correct', 'Category may have been deleted'],
  },

  // --- Generic Task CRUD (120-129) ---
  TASK_120: {
    code: 'TASK_120',
    file: 'task-mutations.ts',
    function: 'createTask',
    httpStatus: 400,
    severity: 'error' as const,
    recoverable: true,
    description: 'Failed to create generic task',
    diagnosis: ['Verify input data', 'Check entity references exist'],
  },
  TASK_121: {
    code: 'TASK_121',
    file: 'task-mutations.ts',
    function: 'startTask',
    httpStatus: 400,
    severity: 'error' as const,
    recoverable: true,
    description: 'Failed to start task — dependencies not met',
    diagnosis: ['Check task dependencies', 'Verify task is in OPEN status'],
  },
  TASK_122: {
    code: 'TASK_122',
    file: 'task-mutations.ts',
    function: 'blockTask',
    httpStatus: 400,
    severity: 'error' as const,
    recoverable: true,
    description: 'Failed to block task',
    diagnosis: ['Verify task exists', 'Check task is in OPEN or IN_PROGRESS status'],
  },
  TASK_123: {
    code: 'TASK_123',
    file: 'task-mutations.ts',
    function: 'unblockTask',
    httpStatus: 400,
    severity: 'error' as const,
    recoverable: true,
    description: 'Failed to unblock task',
    diagnosis: ['Verify task exists', 'Check task is in BLOCKED status'],
  },
  TASK_124: {
    code: 'TASK_124',
    file: 'task-mutations.ts',
    function: 'assignTask',
    httpStatus: 400,
    severity: 'error' as const,
    recoverable: true,
    description: 'Failed to assign task',
    diagnosis: ['Verify task and user exist'],
  },
  TASK_125: {
    code: 'TASK_125',
    file: 'task-mutations.ts',
    function: 'completeTaskWithOutcome',
    httpStatus: 400,
    severity: 'error' as const,
    recoverable: true,
    description: 'Failed to complete task with outcome',
    diagnosis: ['Verify task exists', 'Check task is not already completed'],
  },

  // --- Dependencies (130-134) ---
  TASK_130: {
    code: 'TASK_130',
    file: 'task-dependencies.ts',
    function: 'addDependency',
    httpStatus: 400,
    severity: 'error' as const,
    recoverable: true,
    description: 'Failed to add task dependency',
    diagnosis: ['Verify both tasks exist', 'Check for circular dependencies'],
  },
  TASK_131: {
    code: 'TASK_131',
    file: 'task-dependencies.ts',
    function: 'detectCircularDependency',
    httpStatus: 400,
    severity: 'error' as const,
    recoverable: false,
    description: 'Circular dependency detected',
    diagnosis: ['Review dependency graph', 'Remove circular reference'],
  },
  TASK_132: {
    code: 'TASK_132',
    file: 'task-dependencies.ts',
    function: 'removeDependency',
    httpStatus: 404,
    severity: 'warning' as const,
    recoverable: true,
    description: 'Dependency not found',
    diagnosis: ['Verify dependency link exists'],
  },

  // --- Templates (135-139) ---
  TASK_135: {
    code: 'TASK_135',
    file: 'task-templates.ts',
    function: 'getTemplate',
    httpStatus: 404,
    severity: 'warning' as const,
    recoverable: true,
    description: 'Task template not found',
    diagnosis: ['Verify template ID is correct', 'Template may have been deleted'],
  },
  TASK_136: {
    code: 'TASK_136',
    file: 'task-templates.ts',
    function: 'instantiateTemplate',
    httpStatus: 400,
    severity: 'error' as const,
    recoverable: true,
    description: 'Failed to instantiate template',
    diagnosis: ['Verify template exists', 'Check definition is valid'],
  },

  // --- Health (140-142) ---
  TASK_140: {
    code: 'TASK_140',
    file: 'task-health.ts',
    function: 'getHealthSummary',
    httpStatus: 500,
    severity: 'error' as const,
    recoverable: true,
    description: 'Failed to get task health summary',
    diagnosis: ['Check database connectivity'],
  },

  // --- History (143-144) ---
  TASK_143: {
    code: 'TASK_143',
    file: 'task-history.ts',
    function: 'recordHistory',
    httpStatus: 500,
    severity: 'warning' as const,
    recoverable: true,
    description: 'Failed to record task history entry',
    diagnosis: ['Check database connectivity', 'Non-critical — task still updated'],
  },

  // --- Intents (200-215) ---
  INTENT_200: {
    code: 'INTENT_200',
    file: 'task-intents.ts',
    function: 'createIntent',
    httpStatus: 400,
    severity: 'error' as const,
    recoverable: true,
    description: 'Failed to create intent',
    diagnosis: ['Verify input data', 'Check success criteria format'],
  },
  INTENT_201: {
    code: 'INTENT_201',
    file: 'task-intents.ts',
    function: 'getIntent',
    httpStatus: 404,
    severity: 'warning' as const,
    recoverable: true,
    description: 'Intent not found',
    diagnosis: ['Verify intent ID is correct'],
  },
  INTENT_202: {
    code: 'INTENT_202',
    file: 'task-intents.ts',
    function: 'satisfyIntent',
    httpStatus: 400,
    severity: 'error' as const,
    recoverable: true,
    description: 'Intent criteria not met — cannot satisfy',
    diagnosis: ['Check verification data against success criteria', 'All criteria keys must match'],
  },
  INTENT_203: {
    code: 'INTENT_203',
    file: 'task-intents.ts',
    function: 'failIntent',
    httpStatus: 400,
    severity: 'error' as const,
    recoverable: true,
    description: 'Failed to mark intent as failed',
    diagnosis: ['Verify intent exists and is in active state'],
  },
  INTENT_204: {
    code: 'INTENT_204',
    file: 'task-intents.ts',
    function: 'activateIntent',
    httpStatus: 400,
    severity: 'error' as const,
    recoverable: true,
    description: 'Failed to activate intent — invalid status transition',
    diagnosis: ['Intent must be in PROPOSED status to activate'],
  },
  INTENT_205: {
    code: 'INTENT_205',
    file: 'task-intents.ts',
    function: 'addIntentDependency',
    httpStatus: 400,
    severity: 'error' as const,
    recoverable: true,
    description: 'Failed to add intent dependency',
    diagnosis: ['Verify both intents exist', 'Check for circular dependencies'],
  },
  INTENT_206: {
    code: 'INTENT_206',
    file: 'task-intents.ts',
    function: 'spawnTasksForIntent',
    httpStatus: 400,
    severity: 'error' as const,
    recoverable: true,
    description: 'Failed to spawn tasks for intent',
    diagnosis: ['Verify intent exists', 'Check task data is valid'],
  },
} as const;
