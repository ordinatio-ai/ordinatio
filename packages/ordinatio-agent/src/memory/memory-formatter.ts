// ===========================================
// AGENT MEMORY FORMATTER
// ===========================================
// Converts memories and activity timelines into
// text blocks for LLM system prompt injection.
// Manages token budgets to keep context windows
// efficient. Accepts AgentCallbacks for timeline.
// ===========================================

import type { AgentDb, AgentCallbacks, RecallFilters } from '../types';
import { recallMemories } from './memory-service';

// ---- Types ----

export interface MemoryContextOptions {
  role: string;
  clientId?: string;
  orderId?: string;
  tags?: string[];
  tokenBudget?: number;  // Default: 2000 tokens (~8000 chars)
}

export interface MemoryContext {
  text: string;
  stats: {
    temporaryCount: number;
    deepCount: number;
    timelineCount: number;
    estimatedTokens: number;
  };
}

// ---- Token Estimation ----

/** Rough estimate: 1 token ~= 4 characters */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Truncate text to fit within a character budget */
function truncateToChars(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars - 3) + '...';
}

// ---- Formatters ----

function formatMemory(mem: Record<string, unknown>): string {
  const tags = (mem.tags ?? []) as Array<{ tag: { name: string } }>;
  const tagStr = tags.length > 0
    ? ` [${tags.map((t) => t.tag.name).join(', ')}]`
    : '';
  const layerPrefix = mem.layer === 'TEMPORARY' ? '(temp) ' : '';
  return `- ${layerPrefix}${mem.summary as string}${tagStr}`;
}

function formatTimelineEntry(entry: { createdAt: Date; description: string }): string {
  const date = new Date(entry.createdAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
  return `- ${date}: ${entry.description}`;
}

// ---- Main Context Builder ----

/**
 * Build a formatted memory context block for system prompt injection.
 * Retrieves memories + entity timeline, formats within token budget.
 *
 * @param db - AgentDb interface
 * @param options - Context assembly options
 * @param callbacks - Optional callbacks for timeline retrieval
 */
export async function getMemoryContext(
  db: AgentDb,
  options: MemoryContextOptions,
  callbacks?: AgentCallbacks,
): Promise<MemoryContext> {
  const budget = options.tokenBudget ?? 2000;
  const charBudget = budget * 4; // 1 token ~= 4 chars
  const hasEntity = !!(options.clientId || options.orderId);

  // Budget allocation
  const tempBudget = hasEntity ? Math.floor(charBudget * 0.3) : Math.floor(charBudget * 0.5);
  const deepBudget = hasEntity ? Math.floor(charBudget * 0.4) : Math.floor(charBudget * 0.5);
  const timelineBudget = hasEntity ? Math.floor(charBudget * 0.3) : 0;

  // 1. Fetch temporary memories
  const tempFilters: RecallFilters = {
    role: options.role,
    layer: 'TEMPORARY',
    clientId: options.clientId,
    orderId: options.orderId,
    tags: options.tags,
    limit: 20,
  };
  const tempMemories = await recallMemories(db, tempFilters);

  // 2. Fetch deep memories
  const deepFilters: RecallFilters = {
    role: options.role,
    layer: 'DEEP',
    clientId: options.clientId,
    orderId: options.orderId,
    tags: options.tags,
    limit: 30,
  };
  const deepMemories = await recallMemories(db, deepFilters);

  // 3. Fetch entity timeline via callback (if available)
  let timelineEntries: Array<{ createdAt: Date; description: string }> = [];
  if (callbacks?.getTimeline) {
    if (options.clientId) {
      timelineEntries = await callbacks.getTimeline('client', options.clientId, 15);
    } else if (options.orderId) {
      timelineEntries = await callbacks.getTimeline('order', options.orderId, 15);
    }
  }

  // 4. Format sections within budgets
  const tempLines = formatSection(tempMemories, tempBudget, formatMemory);
  const deepLines = formatSection(deepMemories, deepBudget, formatMemory);
  const timelineLines = formatSection(timelineEntries, timelineBudget, formatTimelineEntry);

  // 5. Assemble text block
  const sections: string[] = [];

  if (tempLines.length > 0) {
    sections.push(`## Recent Observations\n${tempLines.join('\n')}`);
  }

  if (deepLines.length > 0) {
    sections.push(`## Known Facts\n${deepLines.join('\n')}`);
  }

  if (timelineLines.length > 0) {
    sections.push(`## Entity Timeline\n${timelineLines.join('\n')}`);
  }

  const text = sections.length > 0
    ? `# Agent Memory\n\n${sections.join('\n\n')}`
    : '';

  return {
    text: truncateToChars(text, charBudget),
    stats: {
      temporaryCount: tempLines.length,
      deepCount: deepLines.length,
      timelineCount: timelineLines.length,
      estimatedTokens: estimateTokens(text),
    },
  };
}

// ---- Helpers ----

/**
 * Format items into lines, fitting within a character budget.
 * Stops adding lines when budget is exhausted.
 */
function formatSection<T>(items: T[], charBudget: number, formatter: (item: T) => string): string[] {
  const lines: string[] = [];
  let used = 0;

  for (const item of items) {
    const line = formatter(item);
    if (used + line.length + 1 > charBudget) break;
    lines.push(line);
    used += line.length + 1; // +1 for newline
  }

  return lines;
}
