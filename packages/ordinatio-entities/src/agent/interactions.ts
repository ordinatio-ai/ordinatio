// ===========================================
// @ordinatio/entities — AGENT INTERACTIONS
// ===========================================
// Logs and queries agent interactions for the
// learning system and suggestion engine.
// ===========================================

import type { PrismaClient } from '../types';
import { classifyIntent, extractTopic, extractModules } from './analytics';

interface LogInteractionInput {
  userId: string;
  query: string;
  toolsUsed?: string[];
  sessionId?: string;
}

export async function logInteraction(db: PrismaClient, input: LogInteractionInput) {
  const intent = classifyIntent(input.query);
  const topic = extractTopic(input.query);
  const modules = extractModules(input.toolsUsed ?? []);

  return db.agentInteraction.create({
    data: {
      userId: input.userId,
      query: input.query,
      intent,
      topic,
      modules,
      toolsUsed: input.toolsUsed ?? [],
      sessionId: input.sessionId ?? null,
      satisfied: null,
    },
  });
}

export async function markSatisfied(db: PrismaClient, id: string, satisfied: boolean) {
  return db.agentInteraction.update({
    where: { id },
    data: { satisfied },
  });
}

export async function getTopicDistribution(db: PrismaClient, days: number = 30) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const interactions = await db.agentInteraction.findMany({
    where: {
      createdAt: { gte: since },
      topic: { not: null },
    },
    select: {
      topic: true,
      toolsUsed: true,
      modules: true,
    },
  });

  const topicMap = new Map<string, { count: number; modules: Set<string>; tools: Set<string> }>();

  for (const interaction of interactions) {
    if (!interaction.topic) continue;
    const existing = topicMap.get(interaction.topic) ?? {
      count: 0,
      modules: new Set<string>(),
      tools: new Set<string>(),
    };
    existing.count++;
    for (const m of interaction.modules) existing.modules.add(m);
    for (const t of interaction.toolsUsed) existing.tools.add(t);
    topicMap.set(interaction.topic, existing);
  }

  return Array.from(topicMap.entries())
    .map(([topic, data]) => ({
      topic,
      count: data.count,
      modules: Array.from(data.modules),
      tools: Array.from(data.tools),
    }))
    .sort((a, b) => b.count - a.count);
}

export async function getRecentInteractions(db: PrismaClient, userId: string, limit: number = 20) {
  return db.agentInteraction.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

export async function getInteractionCount(db: PrismaClient, days: number = 30): Promise<number> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  return db.agentInteraction.count({
    where: { createdAt: { gte: since } },
  });
}
