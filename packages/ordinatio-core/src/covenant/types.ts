// IHS
/**
 * Module Covenant — Runtime Self-Description (Innovation 2)
 *
 * Every module publishes a machine-readable manifest that agents query at runtime
 * to discover capabilities. An agent that has never seen a module reads its covenant,
 * understands which operations are low-risk and which are critical, and acts accordingly.
 *
 * Per Book V: "A module is not successful when it works. It is successful when its
 * existence appears obvious in retrospect."
 */

import type { RiskLevel } from '../governance/types';

// ---------------------------------------------------------------------------
// Module Identity
// ---------------------------------------------------------------------------

export type ModuleStatus = 'canonical' | 'ecclesial' | 'local' | 'experimental';

export type ModuleTier =
  | 'being'        // Tier 1 — What Exists (Entity Registry, Auth)
  | 'act'          // Tier 2 — What Communicates and Does (Email, Task, CMS)
  | 'governance'   // Tier 3 — What Orders and Rules (Workflow, Automation, Security)
  | 'memory'       // Tier 4 — What Records and Retrieves (Audit, Search, Document)
  | 'intelligence'; // Tier 5 — What Reasons (Agent, Job, Notification, Payments)

export interface ModuleIdentity {
  /** Unique module identifier (e.g., 'email-engine', 'entity-registry') */
  readonly id: string;
  /** Canonical number (e.g., 'C-03' for Email Engine) */
  readonly canonicalId: string;
  /** Semantic version */
  readonly version: string;
  /** Human-readable description */
  readonly description: string;
  /** Module classification */
  readonly status: ModuleStatus;
  /** Ontological tier */
  readonly tier: ModuleTier;
  /** IHS dedication */
  readonly dedication: 'IHS';
}

// ---------------------------------------------------------------------------
// Domain Model
// ---------------------------------------------------------------------------

export interface DomainEntity {
  /** Entity name (e.g., 'EmailMessage', 'Client') */
  readonly name: string;
  /** Human-readable description */
  readonly description: string;
  /** Whether this entity supports three-layer storage */
  readonly hasContextLayer: boolean;
}

export interface DomainEvent {
  /** Event identifier (e.g., 'email.received', 'order.status_changed') */
  readonly id: string;
  /** Human-readable description */
  readonly description: string;
  /** Payload schema description */
  readonly payloadShape: string;
}

export interface ModuleDomain {
  /** Entities managed by this module */
  readonly entities: readonly DomainEntity[];
  /** Events this module emits */
  readonly events: readonly DomainEvent[];
  /** Events this module subscribes to (from other modules) */
  readonly subscriptions: readonly string[];
}

// ---------------------------------------------------------------------------
// Capabilities
// ---------------------------------------------------------------------------

export type DataSensitivity = 'none' | 'internal' | 'sensitive' | 'critical';

export type CapabilityType = 'query' | 'mutation' | 'action' | 'composite';

export interface CapabilityInput {
  readonly name: string;
  readonly type: string;
  readonly required: boolean;
  readonly description: string;
  readonly allowedValues?: readonly string[];
}

export interface ModuleCapability {
  /** Unique capability identifier (e.g., 'email.read_inbox', 'email.send') */
  readonly id: string;
  /** Human-readable description */
  readonly description: string;
  /** Capability classification */
  readonly type: CapabilityType;
  /** Risk level — determines governance behavior */
  readonly risk: RiskLevel;
  /** Data sensitivity — determines provider trust requirements */
  readonly dataSensitivity: DataSensitivity;
  /** Input parameters */
  readonly inputs: readonly CapabilityInput[];
  /** Output description for agent understanding */
  readonly output: string;
  /** Natural language guide: when should an agent use this? */
  readonly whenToUse: string;
  /** Known pitfalls for agents */
  readonly pitfalls?: readonly string[];
}

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

export interface ModuleDependency {
  /** ID of the required module */
  readonly moduleId: string;
  /** Whether the system can function without this dependency */
  readonly required: boolean;
  /** Specific capabilities used from the dependency */
  readonly capabilities: readonly string[];
}

// ---------------------------------------------------------------------------
// Invariants (Book V)
// ---------------------------------------------------------------------------

export interface ModuleInvariant {
  /** What is ALWAYS true */
  readonly alwaysTrue: readonly string[];
  /** What can NEVER happen */
  readonly neverHappens: readonly string[];
}

// ---------------------------------------------------------------------------
// Health Check
// ---------------------------------------------------------------------------

export interface HealthCheckResult {
  readonly healthy: boolean;
  readonly message: string;
  readonly checkedAt: Date;
  readonly details?: Record<string, unknown>;
}

export type HealthCheckFn = () => Promise<HealthCheckResult>;

// ---------------------------------------------------------------------------
// The Module Covenant
// ---------------------------------------------------------------------------

export interface ModuleCovenant {
  readonly identity: ModuleIdentity;
  readonly domain: ModuleDomain;
  readonly capabilities: readonly ModuleCapability[];
  readonly dependencies: readonly ModuleDependency[];
  readonly invariants: ModuleInvariant;
  readonly healthCheck: HealthCheckFn;
}
