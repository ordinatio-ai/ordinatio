// ===========================================
// EMAIL ENGINE — BARREL EXPORT
// ===========================================
// @ordinatio/email
// ===========================================

// --- Types & Error Classes ---
export type {
  EmailActivityAction,
  EmailActivityData,
  ActivityLogger,
  EventEmitter,
  ContactResolver,
  EmailContextExtractor,
  HtmlSanitizer,
  EmailMutationCallbacks,
  EmailSyncCallbacks,
  EmailContentCallbacks,
  OaemCallbacks,
  GetInboxOptions,
  GetThreadsOptions,
  GetScheduledEmailsOptions,
  GetTemplatesOptions,
  ScheduleEmailInput,
  CreateTemplateInput,
  UpdateTemplateInput,
  ConnectAccountInput,
  ReplyToEmailInput,
  LinkEmailInput,
  TemplateVariables,
  VariableCategory,
  ClientContext,
  OrderContext,
  ClothierContext,
} from './types';

export {
  NotFoundError,
  AlreadyExistsError,
  EmailAccountNotFoundError,
  EmailAccountExistsError,
  EmailMessageNotFoundError,
  ScheduledEmailNotFoundError,
  EmailTemplateNotFoundError,
  EmailTemplateDuplicateError,
  DefaultTemplateDeletionError,
  ScheduledEmailNotPendingError,
  ScheduledEmailNotFailedError,
} from './types';

// --- Error Registry ---
export { emailError, templateError, EMAIL_ENGINE_ERRORS, EMAIL_ERRORS, TEMPLATE_ERRORS } from './errors';

// --- Validation Schemas ---
export {
  EmailProviderSchema,
  ConnectAccountSchema,
  ScheduledEmailStatusSchema,
  ScheduleEmailSchema,
  GetScheduledEmailsQuerySchema,
  GetInboxMessagesQuerySchema,
  CreateDraftSchema,
  CreateEmailTemplateSchema,
  UpdateEmailTemplateSchema,
  RenderEmailTemplateSchema,
  UseEmailTemplateSchema,
} from './schemas';

export type {
  EmailProviderType,
  ConnectAccountSchemaInput,
  ScheduledEmailStatus,
  ScheduleEmailSchemaInput,
  GetScheduledEmailsQuery,
  GetInboxMessagesQuery,
  CreateDraftInput,
  CreateEmailTemplateSchemaInput,
  UpdateEmailTemplateSchemaInput,
  RenderEmailTemplateSchemaInput,
  UseEmailTemplateSchemaInput,
} from './schemas';

// --- Providers ---
export { getProvider, isProviderSupported } from './providers';
export type { ProviderType } from './providers';
export type {
  AuthType,
  EmailProvider,
  ProviderCapabilities,
  ConnectionTestResult,
  ImapSmtpCredentials,
  TokenSet,
  ListMessagesOptions,
  ListMessagesResult,
  MessageSummary,
  FullMessage,
  Attachment,
  ReplyOptions,
} from './providers';
export { GmailProvider, OutlookProvider, ImapSmtpProvider, buildMimeMessage, registerProvider } from './providers';
export type { MimeAttachment, MimeMessageOptions } from './providers';

// --- Account ---
export { getActiveAccount, getConnectUrl, getValidAccessToken, updateSyncTimestamp } from './account-queries';
export { connectAccount, disconnectAccount } from './account-mutations';

// --- Messages ---
export { getInboxEmails, getInboxThreads, getEmail, getClientEmails } from './message-queries';
export { replyToEmail, linkEmailToClient } from './message-mutations';

// --- Sync ---
export { syncEmails, logSyncFailure } from './sync-service';

// --- Archive ---
export { archiveEmail } from './archive-service';

// --- Content ---
export { fetchEmailContent } from './content-service';

// --- Templates ---
export { ensureDefaults, listTemplates, getTemplateById, getActiveByCategory } from './template-queries';
export { createTemplate, updateTemplate, removeTemplate, resetToDefaults } from './template-mutations';
export {
  renderTemplate,
  extractPlaceholders,
  validateTemplate,
  buildVariablesFromContext,
  AVAILABLE_VARIABLES,
  SAMPLE_VARIABLES,
} from './template-renderer';

// --- Scheduled ---
export { getScheduledEmails, getScheduledEmail, getPendingToSend } from './scheduled-queries';
export { scheduleEmail, cancelScheduledEmail, markAsProcessing, markAsSent, markAsFailed, retryScheduledEmail } from './scheduled-mutations';

// --- Discovery ---
export { discoverProvider } from './discovery';
export type {
  DiscoveryResult,
  DiscoverySource,
  DiscoveredProvider,
  ImapSmtpSettings,
  DiscoveryOptions,
  IntelligenceQueryFn,
  IntelligenceRecordFn,
} from './discovery';

// --- OAEM Protocol ---
export {
  // Capsule
  encodeCapsule, decodeCapsule, embedCapsule, extractCapsule,
  // Signing
  computeHash, computeHashBytes, generateKeyPair, serializePublicKeys,
  signCapsule, verifyCapsule, verifyWithKey,
  // Trust
  evaluateTrust, getNonceTracker, TRUST_TIER_ORDINAL, NonceTracker,
  // Ledger
  buildNextState, createInitialState, validateChain, verifyEntryHash,
  generateThreadFingerprint, normalizeSubject,
  // Constants
  INTENT_TYPES, ACTION_TYPES,
  // Errors
  oaemError, OAEM_ERRORS,
} from './oaem';

export type {
  CapsulePayload, ThreadIdentity, ThreadState, ThreadStatus, PendingItem,
  IntentType, CapsuleAction, ActionType, CapsuleConstraints, CapsuleLink,
  CompletionCheck, TrustTier, TrustEvaluation, TrustPolicy, OaemKeyPair,
  OaemKeysJson, SigningOptions, VerificationResult, LedgerEntry, LedgerChain,
  ExtractedCapsule, PublicKeyFetcher, TrustContext, BuildResult, ChainValidationResult,
} from './oaem';
