// ===========================================
// TASK ENGINE — BARREL EXPORT
// ===========================================
// @ordinatio/tasks
// Canonical module: entity-agnostic task & intent engine.
// Ordinatio Phase 6, Covenant C-04.
// ===========================================

// Types
export type {
  TaskStatus,
  TaskPriority,
  DependencyType,
  IntentStatus,
  CreateTaskFromEmailInput,
  CreateTaskInput,
  UpdateTaskInput,
  CompleteTaskWithOutcomeInput,
  BlockTaskInput,
  AddDependencyInput,
  GetTasksOptions,
  GetMyTasksOptions,
  CreateTaskResult,
  TaskCounts,
  DependencyCheckResult,
  HealthSignalType,
  TaskHealthSignal,
  TaskHealthSummary,
  TemplateTaskSpec,
  TemplateIntentSpec,
  TemplateDefinition,
  CreateTemplateInput,
  InstantiateTemplateInput,
  CreateIntentInput,
  SatisfyIntentInput,
  CreateCategoryInput,
  UpdateCategoryInput,
  UpdateCategoryResult,
  TaskActivityAction,
  TaskActivityData,
  ActivityLogger,
  TaskEventEmitter,
  MutationCallbacks,
} from './types';

// Error classes
export {
  TaskNotFoundError,
  EmailNotFoundForTaskError,
  TaskCategoryNotFoundError,
  TaskCategoryExistsError,
  InvalidStatusTransitionError,
  CircularDependencyError,
  DependencyNotMetError,
  TemplateNotFoundError,
  IntentNotFoundError,
  IntentCriteriaNotMetError,
} from './types';

// Queries
export {
  getTasks,
  getTask,
  getTaskCounts,
  getMyTasks,
  getTasksForEntity,
  getSubtasks,
  getAgentQueue,
  searchTasks,
} from './task-queries';

// Core mutations
export {
  createTaskFromEmail,
  createTask,
  updateTask,
  completeTask,
  reopenTask,
  deleteTask,
} from './task-mutations';

// V2 workflow mutations
export {
  startTask,
  blockTask,
  unblockTask,
  assignTask,
  completeTaskWithOutcome,
  addWatcher,
  removeWatcher,
} from './task-mutations-v2';

// Dependencies
export {
  addDependency,
  removeDependency,
  getDependencies,
  getDependents,
  checkDependenciesMet,
  getBlockingDependencies,
  detectCircularDependency,
} from './task-dependencies';

// Templates
export {
  createTemplate,
  updateTemplate,
  deleteTemplate,
  getTemplate,
  getTemplates,
  getTemplatesForTrigger,
  instantiateTemplate,
} from './task-templates';

// Health
export {
  getOverdueTasks,
  getLongBlockedTasks,
  getApproachingDeadlines,
  getUnassignedTasks,
  getTasksWithoutCriteria,
  getDependencyRisks,
  getHealthSignals,
  getHealthSummary,
} from './task-health';

// History
export {
  recordHistory,
  getTaskHistory,
} from './task-history';

// Intents
export {
  createIntent,
  updateIntent,
  activateIntent,
  satisfyIntent,
  checkCriteriaMet,
  failIntent,
  getIntent,
  getIntents,
  getIntentsForEntity,
  getUnsatisfiedIntents,
  addIntentDependency,
  removeIntentDependency,
  spawnTasksForIntent,
} from './task-intents';

// Categories
export {
  createCategory,
  updateCategory,
  deleteCategory,
  getCategories,
  getCategoriesWithCounts,
  getCategoryById,
  getCategoryByName,
} from './task-category';

// Schemas (also available via @ordinatio/tasks/schemas)
export {
  TaskStatusSchema,
  TaskPrioritySchema,
  DependencyTypeSchema,
  IntentStatusSchema,
  GetTasksQuerySchema,
  CreateTaskSchema,
  CreateGenericTaskSchema,
  UpdateTaskSchema,
  TaskActionSchema,
  AddDependencySchema,
  CreateTemplateSchema,
  InstantiateTemplateSchema,
  CreateIntentSchema,
  SatisfyIntentSchema,
  FailIntentSchema,
  BlockTaskSchema,
} from './schemas';
export type {
  GetTasksQuery,
  CreateTaskInput as CreateTaskSchemaInput,
  CreateGenericTaskInput,
  TaskActionInput,
} from './schemas';
