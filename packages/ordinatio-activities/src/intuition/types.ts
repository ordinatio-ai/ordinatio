// ===========================================
// OPERATIONAL INTUITION — Types
// ===========================================
// The system's learned understanding of
// "what normally happens" and "what's missing."
// Pure data — no dependencies.
// ===========================================

// ---- Learned Sequences ----

/**
 * A learned A->B pattern: "When action A occurs for an entity,
 * action B normally follows within `medianDelayMs` milliseconds."
 *
 * Mined from historical activity data. No configuration needed.
 */
export interface LearnedSequence {
  /** The trigger action (e.g., "client.measurements_updated") */
  fromAction: string;
  /** The expected follow-up action (e.g., "client.fit_profile_created") */
  toAction: string;
  /** How many times this A->B pattern was observed */
  occurrences: number;
  /** Median delay between A and B in milliseconds */
  medianDelayMs: number;
  /** 90th percentile delay — the "should have happened by now" threshold */
  p90DelayMs: number;
  /** Confidence: occurrences of A->B / total occurrences of A */
  confidence: number;
  /** Whether this sequence is entity-scoped (same orderId/clientId) */
  entityScoped: boolean;
}

/**
 * A detected missing beat: action A happened but expected
 * follow-up B has not arrived within the expected window.
 */
export interface MissingBeat {
  /** The trigger activity that started the clock */
  triggerActivity: {
    id: string;
    action: string;
    createdAt: Date;
    orderId: string | null;
    clientId: string | null;
    description: string;
    entityLabel: string | null;
  };
  /** The expected follow-up action that hasn't happened */
  expectedAction: string;
  /** How long we expected to wait (p90 of the learned sequence) */
  expectedWithinMs: number;
  /** How long we've actually been waiting */
  waitingMs: number;
  /** How overdue this is as a ratio (waitingMs / expectedWithinMs). >1 means overdue */
  overdueRatio: number;
  /** The learned sequence that generated this detection */
  sequence: LearnedSequence;
  /** Urgency classification derived from overdueRatio and confidence */
  urgency: 'watch' | 'nudge' | 'alarm';
}

// ---- Operational Cadence ----

/**
 * Learned daily rhythm: how many activities of each type
 * normally occur per hour-of-day and day-of-week.
 */
export interface CadenceProfile {
  /** Activities per hour of day (0-23), averaged over the learning window */
  hourlyRate: number[];
  /** Activities per day of week (0=Sun, 6=Sat), averaged */
  dailyRate: number[];
  /** Total activities in the learning window */
  totalActivities: number;
  /** Number of days in the learning window */
  windowDays: number;
}

/**
 * A detected cadence break: activity rate is significantly
 * below normal for the current time window.
 */
export interface CadenceBreak {
  /** Current hour or day where the break was detected */
  period: string;
  /** Expected activity count for this period */
  expected: number;
  /** Actual activity count */
  actual: number;
  /** Ratio of actual/expected. <0.3 is a significant break */
  ratio: number;
  /** How many standard deviations below the mean */
  severity: 'quiet' | 'unusual' | 'silent';
}

// ---- Intent Inference ----

/**
 * Inferred user intent from a sequence of recent actions.
 * "The user seems to be doing X based on actions A, B, C."
 */
export interface InferredIntent {
  /** Short label for what the user appears to be doing */
  label: string;
  /** The actions that suggest this intent */
  evidenceActions: string[];
  /** Predicted next actions based on learned sequences */
  predictedNext: Array<{
    action: string;
    confidence: number;
    typicalDelayMs: number;
  }>;
  /** Entity context (which client/order this intent relates to) */
  entityContext: {
    clientId?: string;
    orderId?: string;
  };
}

// ---- Ghost Projections ----

/**
 * A projected future activity that hasn't arrived yet
 * but is expected based on learned sequences.
 * Re-exported from ghosts.ts for convenience.
 */
export type { GhostProjection } from './ghosts';

// ---- Operational Pulse ----

/**
 * The full operational pulse: a snapshot of system health
 * derived entirely from the activity stream.
 */
export interface OperationalPulse {
  /** When this pulse was computed */
  computedAt: Date;
  /** Activities analyzed */
  activitiesAnalyzed: number;

  /** Missing beats: expected actions that haven't happened */
  missingBeats: MissingBeat[];
  /** Ghost projections: expected actions still within window */
  ghostProjections: import('./ghosts').GhostProjection[];
  /** Cadence breaks: unusually quiet periods */
  cadenceBreaks: CadenceBreak[];
  /** Inferred active intents */
  activeIntents: InferredIntent[];

  /** Summary counts */
  summary: {
    totalMissingBeats: number;
    alarmCount: number;
    nudgeCount: number;
    watchCount: number;
    ghostCount: number;
    entropy: number;
    botStormDetected: boolean;
    cadenceStatus: 'normal' | 'quiet' | 'unusual' | 'silent';
  };
}

// ---- Configuration ----

/**
 * Tuning knobs for the intuition engine.
 * All have sensible defaults — zero config required.
 */
export interface IntuitionConfig {
  /** Minimum occurrences for a sequence to be considered learned (default: 3) */
  minOccurrences?: number;
  /** Minimum confidence for a sequence to generate missing beats (default: 0.3) */
  minConfidence?: number;
  /** Maximum delay to track in milliseconds (default: 7 days) */
  maxSequenceDelayMs?: number;
  /** How far back to look for learning data in days (default: 90) */
  learningWindowDays?: number;
  /** How far back to look for current missing beats in days (default: 14) */
  detectionWindowDays?: number;
  /** Minimum activities needed before learning kicks in (default: 50) */
  minActivitiesForLearning?: number;
}

export const DEFAULT_INTUITION_CONFIG: Required<IntuitionConfig> = {
  minOccurrences: 3,
  minConfidence: 0.3,
  maxSequenceDelayMs: 7 * 24 * 60 * 60 * 1000, // 7 days
  learningWindowDays: 90,
  detectionWindowDays: 14,
  minActivitiesForLearning: 50,
};
