// ===========================================
// ORDINATIO ACTIVITIES — Agent Tools
// ===========================================
// Ready-made tool definitions for the agentic
// layer. Following the Ordinatio covenant pattern:
// observe -> suggest -> act -> govern.
//
// All tools are typed with sensitivity levels
// and structured for direct registration in
// tool registries.
// ===========================================

import type { ActivityDb, ActivityWithRelations, GetActivitiesOptions } from './types';
import type { IntuitionConfig, OperationalPulse, MissingBeat } from './intuition/types';
import {
  computePulse,
  summarizeForAgent,
  pulseNeedsAttention,
  getMissingBeatsByEntity,
} from './intuition/pulse';
import { getActivitiesWithSticky, resolveActivity, getOrderActivities, getClientActivities } from './activities';

/** Data sensitivity level (matches Ordinatio covenant pattern) */
export type DataSensitivity = 'none' | 'internal' | 'sensitive' | 'critical';

/** Agent tool definition */
export interface ActivityAgentTool {
  name: string;
  description: string;
  sensitivity: DataSensitivity;
  riskLevel: 'observe' | 'suggest' | 'act';
  requiresApproval: boolean;
}

/**
 * Tool catalog for registration in agent tool registries.
 */
export const ACTIVITY_AGENT_TOOLS: Record<string, ActivityAgentTool> = {
  // ---- OBSERVE (risk: none) ----
  getOperationalPulse: {
    name: 'getOperationalPulse',
    description: 'Get the full operational pulse: missing beats, cadence breaks, active intents. This is your situational awareness.',
    sensitivity: 'internal',
    riskLevel: 'observe',
    requiresApproval: false,
  },
  getPulseSummary: {
    name: 'getPulseSummary',
    description: 'Get a concise text summary of the operational pulse, optimized for your context window.',
    sensitivity: 'internal',
    riskLevel: 'observe',
    requiresApproval: false,
  },
  checkPulseAttention: {
    name: 'checkPulseAttention',
    description: 'Quick check: does the operational pulse contain anything that needs attention? Returns true/false.',
    sensitivity: 'none',
    riskLevel: 'observe',
    requiresApproval: false,
  },
  getMissingBeats: {
    name: 'getMissingBeats',
    description: 'Get missing beats grouped by entity. Shows which clients/orders have dropped balls.',
    sensitivity: 'internal',
    riskLevel: 'observe',
    requiresApproval: false,
  },
  getUnresolvedAlerts: {
    name: 'getUnresolvedAlerts',
    description: 'Get all unresolved sticky activities (alerts that need human action).',
    sensitivity: 'internal',
    riskLevel: 'observe',
    requiresApproval: false,
  },
  getRecentActivities: {
    name: 'getRecentActivities',
    description: 'Get recent activities with sticky items separated. Paginated.',
    sensitivity: 'internal',
    riskLevel: 'observe',
    requiresApproval: false,
  },
  getEntityActivities: {
    name: 'getEntityActivities',
    description: 'Get activities for a specific order or client.',
    sensitivity: 'internal',
    riskLevel: 'observe',
    requiresApproval: false,
  },

  // ---- ACT (risk: low — resolution only) ----
  resolveAlert: {
    name: 'resolveAlert',
    description: 'Resolve a sticky activity/alert. Does NOT delete — marks as resolved with timestamp and resolver.',
    sensitivity: 'internal',
    riskLevel: 'act',
    requiresApproval: false,
  },
};

/**
 * Create the agent tool implementations.
 *
 * These are the actual functions the agent calls.
 * They accept the activity DB and return structured results.
 */
export function createAgentToolHandlers(db: ActivityDb) {
  // Cache the pulse computation (recompute every 5 minutes)
  let cachedPulse: { pulse: OperationalPulse; computedAt: number } | null = null;
  const PULSE_TTL_MS = 5 * 60 * 1000;

  async function getPulse(
    historicalActivities: ActivityWithRelations[],
    recentActivities: ActivityWithRelations[],
    config?: IntuitionConfig,
  ): Promise<OperationalPulse> {
    const now = Date.now();
    if (cachedPulse && (now - cachedPulse.computedAt) < PULSE_TTL_MS) {
      return cachedPulse.pulse;
    }

    const pulse = computePulse(historicalActivities, recentActivities, new Date(), config);
    cachedPulse = { pulse, computedAt: now };
    return pulse;
  }

  return {
    /**
     * Get the full operational pulse.
     * The agent should call this at the start of each interaction
     * to understand what's happening in the system.
     */
    async getOperationalPulse(
      historicalActivities: ActivityWithRelations[],
      recentActivities: ActivityWithRelations[],
      config?: IntuitionConfig,
    ): Promise<OperationalPulse> {
      return getPulse(historicalActivities, recentActivities, config);
    },

    /**
     * Get a text summary optimized for agent consumption.
     */
    async getPulseSummary(
      historicalActivities: ActivityWithRelations[],
      recentActivities: ActivityWithRelations[],
      config?: IntuitionConfig,
    ): Promise<string> {
      const pulse = await getPulse(historicalActivities, recentActivities, config);
      return summarizeForAgent(pulse);
    },

    /**
     * Quick attention check.
     */
    async checkPulseAttention(
      historicalActivities: ActivityWithRelations[],
      recentActivities: ActivityWithRelations[],
      config?: IntuitionConfig,
    ): Promise<boolean> {
      const pulse = await getPulse(historicalActivities, recentActivities, config);
      return pulseNeedsAttention(pulse);
    },

    /**
     * Get missing beats grouped by entity.
     */
    async getMissingBeats(
      historicalActivities: ActivityWithRelations[],
      recentActivities: ActivityWithRelations[],
      config?: IntuitionConfig,
    ): Promise<Map<string, MissingBeat[]>> {
      const pulse = await getPulse(historicalActivities, recentActivities, config);
      return getMissingBeatsByEntity(pulse.missingBeats);
    },

    /**
     * Get unresolved sticky alerts.
     */
    async getUnresolvedAlerts(options?: GetActivitiesOptions) {
      const result = await getActivitiesWithSticky(db, options);
      return result.stickyItems;
    },

    /**
     * Get recent activities (paginated).
     */
    async getRecentActivities(options?: GetActivitiesOptions) {
      return getActivitiesWithSticky(db, options);
    },

    /**
     * Get activities for a specific entity.
     */
    async getEntityActivities(
      entityType: 'order' | 'client',
      entityId: string,
      limit?: number,
    ): Promise<ActivityWithRelations[]> {
      if (entityType === 'order') {
        return getOrderActivities(db, entityId, limit);
      }
      return getClientActivities(db, entityId, limit);
    },

    /**
     * Resolve a sticky alert.
     */
    async resolveAlert(activityId: string, resolvedBy: string) {
      return resolveActivity(db, activityId, resolvedBy);
    },

    /**
     * Invalidate the pulse cache (e.g., after a batch of activities are created).
     */
    invalidateCache() {
      cachedPulse = null;
    },
  };
}
