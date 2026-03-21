// ===========================================
// @ordinatio/entities — BARREL EXPORT
// ===========================================
// Entity knowledge, agent intelligence, notes, and contacts.
// ===========================================

// --- Types ---
export type {
  PrismaClient, MutationCallbacks, SeedDataProvider, NoteKnowledgeCallbacks,
  ValidationCallbacks, FieldConstraint, ConstraintViolation, ObserverCallbacks,
  EntityHealthReport, EntityTypeHealthSummary,
} from './types';

// --- Errors ---
export {
  KNOWLEDGE_ERRORS,
  knowledgeError,
  AGENTKNOW_ERRORS,
  agentKnowledgeError,
  ContactNotFoundError,
  ContactExistsError,
  ContactAlreadyConvertedError,
} from './errors';
export type { KnowledgeErrorDef, AgentKnowledgeErrorEntry } from './errors';

// --- Knowledge ---
export { getFieldDefinitions, createFieldDefinition, updateFieldDefinition, getFieldDefinitionById } from './knowledge/field-definitions';
export { getEntityFields, setEntityFields, getFieldHistory } from './knowledge/ledger';
export { searchByFields, logSearchQuery, getWeekOfYear } from './knowledge/search';

// --- Knowledge: Time-Travel ---
export { getKnowledgeAt, getFieldValueAt, getKnowledgeTimeline } from './knowledge/time-travel';

// --- Knowledge: Scoring ---
export { SOURCE_RELIABILITY, computeRecencyFactor, computeTruthScore, computeComplexityScore, computeEntityTruthScores } from './knowledge/scoring';

// --- Knowledge: Decay ---
export { computeDecayedConfidence, isStale, getStaleFields, formatStalenessWarnings } from './knowledge/decay';

// --- Knowledge: Branching ---
export { shouldBranch, setEntityFieldsWithBranching } from './knowledge/branching';

// --- Knowledge: Shadow Graph ---
export { computeRelationshipStrength, findRelatedEntities, getEntityRelationships } from './knowledge/shadow-graph';
export type { EntityRelationship } from './knowledge/shadow-graph';

// --- Knowledge: Reflection ---
export { evaluateConflictRule, detectConflicts, scanForConflicts, DEFAULT_CONFLICT_RULES } from './knowledge/reflection';
export type { ConflictRule, DetectedConflict } from './knowledge/reflection';

// --- Knowledge: Observer ---
export { evaluateConstraint, checkConstraints, fireObservers } from './knowledge/observer';

// --- Knowledge: Ghost Fields ---
export { buildCoOccurrenceMap, predictGhostFields, writeGhostFields } from './knowledge/ghost-fields';
export type { GhostFieldPrediction } from './knowledge/ghost-fields';

// --- Knowledge: Health ---
export { computeOverallScore, computeEntityHealth, getEntityTypeHealth } from './knowledge/health';

// --- Agent ---
export { queryKnowledge, createKnowledgeEntry, updateKnowledgeEntry, deleteKnowledgeEntry, ensureKnowledgeDefaults, resetKnowledgeDefaults, resetSeedCheck } from './agent/knowledge';
export { getPreferences, setPreference, deletePreference } from './agent/preferences';
export { logInteraction, markSatisfied, getTopicDistribution, getRecentInteractions, getInteractionCount } from './agent/interactions';
export { classifyIntent, extractTopic, extractModules } from './agent/analytics';
export { analyzeAndSuggest, getSuggestions, dismissSuggestion, approveSuggestion } from './agent/suggestions';

// --- Notes ---
export { createNote, updateNote, getNotes, deleteNote } from './notes/notes';

// --- Contacts ---
export { getAllContacts, getContactById, getContactByEmail, createContact, updateContact, deleteContact, findOrCreateContact } from './contacts/contacts';

// --- Seeds ---
export { CONTACT_FIELD_DEFINITIONS, seedContactFieldDefinitions } from './knowledge/contact-fields-seed';

// --- Schemas ---
export * from './schemas';
