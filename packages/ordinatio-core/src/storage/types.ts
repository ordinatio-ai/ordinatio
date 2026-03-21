// IHS
/**
 * Three-Layer Data Storage (Innovation 1)
 *
 * Every entity has three representations:
 * - Layer A (Original): Immutable source (email MIME, PDF, form submission). Never modified.
 * - Layer B (Structured): Parsed JSON with typed fields, relationships, metadata. Queryable.
 * - Layer C (Context): Pre-computed NL summary optimized for LLM context windows.
 *   Generated at WRITE TIME, not query time.
 *
 * The Invariant: C is derivable from B. B is derivable from A. If any layer is lost,
 * it regenerates from below. The human layer is always the source of truth.
 */

// ---------------------------------------------------------------------------
// Entity Context (the database-persisted Layer C + B metadata)
// ---------------------------------------------------------------------------

export interface EntityContext {
  /** Entity type identifier (e.g., 'EmailMessage', 'Client', 'Order') */
  readonly entityType: string;
  /** Entity ID within its type */
  readonly entityId: string;
  /** Layer B: Structured JSON — typed fields, relationships, metadata */
  readonly structured: Record<string, unknown>;
  /** Layer C: Pre-computed natural language summary for LLM context */
  readonly contextSummary: string;
  /** Token count of the context summary (for budget management) */
  readonly contextTokens: number;
  /** Version of the extraction logic that produced this (for re-extraction on upgrade) */
  readonly extractionVersion: number;
  /** When this context was last extracted/updated */
  readonly extractedAt: Date;
  /** Organization this belongs to */
  readonly organizationId: string;
}

// ---------------------------------------------------------------------------
// Layer B — Structured extraction interfaces (per entity type)
// ---------------------------------------------------------------------------

/** Base interface for all Layer B structured data */
export interface StructuredData {
  /** Version of the extraction schema */
  readonly schemaVersion: number;
  /** When this was extracted */
  readonly extractedAt: string;
}

/** Email-specific Layer B structure */
export interface EmailStructured extends StructuredData {
  /** Classified intent of the email */
  readonly intent: EmailIntent;
  /** Sentiment classification */
  readonly sentiment: 'positive' | 'neutral' | 'negative' | 'urgent';
  /** Extracted named entities */
  readonly entities: EmailEntities;
  /** Action items identified in the email */
  readonly actionItems: readonly EmailActionItem[];
  /** Position in conversation thread */
  readonly threadPosition: ThreadPosition;
  /** Email metadata */
  readonly metadata: EmailMetadata;
}

export type EmailIntent =
  | 'inquiry'           // Asking a question
  | 'order_update'      // Status update on an order
  | 'vendor_communication' // Communication from/to vendor
  | 'client_communication' // Communication from/to client
  | 'scheduling'        // Appointment/fitting scheduling
  | 'complaint'         // Issue or complaint
  | 'confirmation'      // Confirming something
  | 'follow_up'         // Following up on previous communication
  | 'introduction'      // First contact
  | 'administrative'    // Internal/administrative
  | 'marketing'         // Marketing/promotional
  | 'unknown';          // Could not classify

export interface EmailEntities {
  /** Client names mentioned */
  readonly clients: readonly string[];
  /** Order references mentioned */
  readonly orders: readonly string[];
  /** Fabric codes mentioned */
  readonly fabrics: readonly string[];
  /** Dates mentioned with context */
  readonly dates: readonly { date: string; context: string }[];
  /** Monetary amounts mentioned */
  readonly amounts: readonly { amount: number; currency: string; context: string }[];
  /** Other people/organizations mentioned */
  readonly people: readonly string[];
}

export interface EmailActionItem {
  /** What needs to be done */
  readonly description: string;
  /** Suggested deadline (if mentioned) */
  readonly deadline?: string;
  /** Who should do it (if clear) */
  readonly assignee?: string;
  /** Priority assessment */
  readonly priority: 'high' | 'medium' | 'low';
}

export interface ThreadPosition {
  /** Is this the first message in the thread? */
  readonly isOriginal: boolean;
  /** Position in thread (1 = first, 2 = first reply, etc.) */
  readonly position: number;
  /** Total messages in thread at time of extraction */
  readonly threadLength: number;
}

export interface EmailMetadata {
  /** From address */
  readonly from: string;
  /** From display name */
  readonly fromName: string;
  /** To addresses */
  readonly to: readonly string[];
  /** Subject line */
  readonly subject: string;
  /** Date sent */
  readonly date: string;
  /** Whether email has attachments */
  readonly hasAttachments: boolean;
  /** Attachment count */
  readonly attachmentCount: number;
}

// ---------------------------------------------------------------------------
// Layer C — Context template system
// ---------------------------------------------------------------------------

/**
 * Template for generating Layer C context summaries.
 * Each entity type defines its own template.
 */
export interface ContextTemplate {
  /** Entity type this template applies to */
  readonly entityType: string;
  /** Template string with {{variable}} placeholders */
  readonly template: string;
  /** Maximum token budget for this entity type's summaries */
  readonly maxTokens: number;
  /** Function to generate summary from Layer B data */
  generate(structured: Record<string, unknown>): string;
}

// ---------------------------------------------------------------------------
// Extraction Pipeline
// ---------------------------------------------------------------------------

export type ExtractionMethod = 'rule_based' | 'llm' | 'hybrid';

export interface ExtractionConfig {
  /** Method for Layer B extraction */
  readonly structuredMethod: ExtractionMethod;
  /** Method for Layer C generation */
  readonly contextMethod: ExtractionMethod;
  /** Current extraction version */
  readonly version: number;
  /** Maximum tokens for context summary */
  readonly maxContextTokens: number;
}

export interface ExtractionResult {
  /** Layer B structured data */
  readonly structured: Record<string, unknown>;
  /** Layer C context summary */
  readonly contextSummary: string;
  /** Token count of summary */
  readonly contextTokens: number;
  /** Extraction version used */
  readonly extractionVersion: number;
  /** Time taken to extract (ms) */
  readonly extractionTimeMs: number;
}

/**
 * Extraction pipeline interface — implemented per entity type.
 */
export interface ExtractionPipeline {
  /** Entity type this pipeline handles */
  readonly entityType: string;
  /** Current extraction config */
  readonly config: ExtractionConfig;
  /**
   * Extract Layer B + C from Layer A source data.
   * @param source - Raw source data (Layer A)
   * @param existing - Previous extraction (for incremental updates)
   */
  extract(
    source: Record<string, unknown>,
    existing?: EntityContext,
  ): Promise<ExtractionResult>;
}
