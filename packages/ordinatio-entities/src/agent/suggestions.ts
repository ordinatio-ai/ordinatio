// ===========================================
// @ordinatio/entities — AGENT SUGGESTIONS
// ===========================================
// Analyzes interaction patterns and generates
// suggestions for new specialized agents.
// ===========================================

import type { PrismaClient } from '../types';
import { getTopicDistribution, getInteractionCount } from './interactions';

// ===========================================
// TOPIC → AGENT MAPPING
// ===========================================

const TOPIC_TO_AGENT: Record<string, { name: string; category: string; description: string }> = {
  'email campaigns': {
    name: 'Marketing Agent',
    category: 'communication',
    description: 'Handles email campaigns, newsletter scheduling, and audience segmentation.',
  },
  'social media': {
    name: 'Social Media Agent',
    category: 'communication',
    description: 'Manages social media posts, scheduling, and engagement tracking.',
  },
  'customer support': {
    name: 'Support Agent',
    category: 'service',
    description: 'Handles support tickets, customer complaints, and FAQ automation.',
  },
  'reports': {
    name: 'Analytics Agent',
    category: 'analytics',
    description: 'Generates custom reports, dashboards, and data analysis.',
  },
  'inventory': {
    name: 'Inventory Agent',
    category: 'operations',
    description: 'Tracks stock levels, reorder points, and supply chain status.',
  },
  'billing': {
    name: 'Billing Agent',
    category: 'finance',
    description: 'Manages invoices, payment tracking, and billing automation.',
  },
  'onboarding': {
    name: 'Onboarding Agent',
    category: 'workflow',
    description: 'Guides new users through setup, training, and documentation.',
  },
  'scheduling': {
    name: 'Scheduling Agent',
    category: 'workflow',
    description: 'Manages appointments, calendars, and deadline tracking.',
  },
};

const SPECIALIST_TOPICS = new Set([
  'tax operations',
  'order management',
  'fabric stock',
  'client management',
  'fit profiles',
  'email templates',
  'automations',
]);

const MIN_QUERY_THRESHOLD = 10;
const DISMISS_COOLDOWN_DAYS = 90;

export async function analyzeAndSuggest(db: PrismaClient): Promise<number> {
  const topics = await getTopicDistribution(db, 30);
  const totalCount = await getInteractionCount(db, 30);
  let created = 0;

  for (const topicData of topics) {
    if (SPECIALIST_TOPICS.has(topicData.topic)) continue;
    if (topicData.count < MIN_QUERY_THRESHOLD) continue;

    const proposal = TOPIC_TO_AGENT[topicData.topic];
    if (!proposal) continue;

    const topicConsistency = totalCount > 0 ? topicData.count / totalCount : 0;
    const volumeScore = Math.min(1.0, topicData.count / 50);
    const confidence = Number((volumeScore * (0.5 + topicConsistency * 0.5)).toFixed(3));

    const evidence = `${topicData.count} queries about "${topicData.topic}" in the last 30 days (${Math.round(topicConsistency * 100)}% of all queries).`;

    const existing = await db.agentSuggestion.findFirst({
      where: { name: proposal.name },
    });

    if (existing) {
      if (
        existing.status === 'dismissed' &&
        existing.dismissedAt &&
        Date.now() - existing.dismissedAt.getTime() < DISMISS_COOLDOWN_DAYS * 24 * 60 * 60 * 1000
      ) {
        continue;
      }

      await db.agentSuggestion.update({
        where: { id: existing.id },
        data: {
          confidence,
          evidence,
          queryCount: topicData.count,
          suggestedTools: topicData.tools,
          status: existing.status === 'dismissed' ? 'pending' : existing.status,
          dismissedAt: existing.status === 'dismissed' ? null : existing.dismissedAt,
          dismissedBy: existing.status === 'dismissed' ? null : existing.dismissedBy,
        },
      });
    } else {
      await db.agentSuggestion.create({
        data: {
          name: proposal.name,
          description: proposal.description,
          category: proposal.category,
          evidence,
          confidence,
          queryCount: topicData.count,
          suggestedTools: topicData.tools,
          status: 'pending',
        },
      });
      created++;
    }
  }

  return created;
}

export async function getSuggestions(db: PrismaClient, status?: string) {
  return db.agentSuggestion.findMany({
    where: status ? { status } : undefined,
    orderBy: { confidence: 'desc' },
  });
}

export async function dismissSuggestion(db: PrismaClient, id: string, userId: string) {
  return db.agentSuggestion.update({
    where: { id },
    data: {
      status: 'dismissed',
      dismissedBy: userId,
      dismissedAt: new Date(),
    },
  });
}

export async function approveSuggestion(db: PrismaClient, id: string) {
  return db.agentSuggestion.update({
    where: { id },
    data: { status: 'approved' },
  });
}
