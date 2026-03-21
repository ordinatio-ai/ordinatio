// ===========================================
// AGENT COGNITION — Memory Quality Controls
// ===========================================
// Memory is only useful if the agent can
// assess whether it's still trustworthy.
// Confidence, freshness, decay, contradiction
// detection, and merge rules.
// ===========================================

/**
 * Quality assessment for a memory entry.
 */
export interface MemoryQuality {
  /** How confident we are in this memory (0-1). */
  confidence: number;
  /** How fresh the memory is (0=stale, 1=just created). */
  freshness: number;
  /** Where this memory came from. */
  provenance: 'conversation' | 'tool_result' | 'user_input' | 'agent_inference' | 'system' | 'unknown';
  /** Whether this memory conflicts with other memories. */
  hasContradiction: boolean;
  /** Contradicting memory IDs (if any). */
  contradicts?: string[];
  /** Overall quality grade. */
  grade: 'high' | 'medium' | 'low' | 'stale';
}

/**
 * Assess the quality of a memory entry.
 */
export function assessMemoryQuality(memory: {
  createdAt: Date;
  accessCount: number;
  lastAccessedAt?: Date | null;
  source: string;
  layer: string;
}, options?: {
  halfLifeDays?: number;
  now?: Date;
}): MemoryQuality {
  const now = options?.now ?? new Date();
  const halfLifeDays = options?.halfLifeDays ?? 30;
  const ageMs = now.getTime() - memory.createdAt.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);

  // Freshness: exponential decay with half-life
  const freshness = Math.pow(0.5, ageDays / halfLifeDays);

  // Confidence: based on source + access frequency + freshness
  const sourceConfidence = getSourceConfidence(memory.source);
  const accessBoost = Math.min(memory.accessCount / 10, 0.2); // Up to 0.2 boost for frequent access
  const confidence = Math.min(sourceConfidence + accessBoost, 1) * freshness;

  // Provenance
  const provenance = mapProvenance(memory.source);

  // Grade
  const grade = computeGrade(confidence, freshness);

  return {
    confidence: Math.round(confidence * 100) / 100,
    freshness: Math.round(freshness * 100) / 100,
    provenance,
    hasContradiction: false, // Set by detectContradictions()
    grade,
  };
}

/**
 * Detect contradictions between memories.
 * Returns pairs of memory IDs that contradict each other.
 */
export function detectContradictions(memories: Array<{
  id: string;
  summary: string;
  tags?: string[];
  clientId?: string;
}>): Array<{ memoryA: string; memoryB: string; reason: string }> {
  const contradictions: Array<{ memoryA: string; memoryB: string; reason: string }> = [];

  for (let i = 0; i < memories.length; i++) {
    for (let j = i + 1; j < memories.length; j++) {
      const a = memories[i];
      const b = memories[j];

      // Same entity, same tags, different content → potential contradiction
      if (a.clientId && a.clientId === b.clientId) {
        const sharedTags = (a.tags ?? []).filter(t => (b.tags ?? []).includes(t));
        if (sharedTags.length > 0 && a.summary !== b.summary) {
          contradictions.push({
            memoryA: a.id,
            memoryB: b.id,
            reason: `Same client + tags [${sharedTags.join(',')}] but different content`,
          });
        }
      }
    }
  }

  return contradictions;
}

/**
 * Determine if two memories should be merged.
 */
export function shouldMerge(a: { summary: string; createdAt: Date; source: string }, b: { summary: string; createdAt: Date; source: string }): {
  shouldMerge: boolean;
  reason: string;
  keepNewer: boolean;
} {
  // Same summary → deduplicate
  if (a.summary === b.summary) {
    return { shouldMerge: true, reason: 'Identical content', keepNewer: true };
  }

  // Very similar (one is a prefix of the other) → keep the longer one
  if (a.summary.startsWith(b.summary) || b.summary.startsWith(a.summary)) {
    const keepNewer = a.createdAt > b.createdAt;
    return { shouldMerge: true, reason: 'One is a prefix of the other', keepNewer };
  }

  return { shouldMerge: false, reason: 'Content is different enough to keep both', keepNewer: false };
}

/**
 * Compute a decay factor for a memory based on age and half-life.
 * Returns 0-1 (1 = fully fresh, 0 = completely decayed).
 */
export function computeDecay(createdAt: Date, halfLifeDays: number, now?: Date): number {
  const currentTime = now ?? new Date();
  const ageDays = (currentTime.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
  return Math.pow(0.5, ageDays / halfLifeDays);
}

// ---- Internal ----

function getSourceConfidence(source: string): number {
  switch (source) {
    case 'user_input': return 0.9;
    case 'tool_result': return 0.85;
    case 'conversation': return 0.7;
    case 'system': return 0.8;
    case 'agent_inference': return 0.5;
    default: return 0.4;
  }
}

function mapProvenance(source: string): MemoryQuality['provenance'] {
  if (['user_input', 'tool_result', 'conversation', 'system', 'agent_inference'].includes(source)) {
    return source as MemoryQuality['provenance'];
  }
  return 'unknown';
}

function computeGrade(confidence: number, freshness: number): MemoryQuality['grade'] {
  if (freshness < 0.1) return 'stale';
  if (confidence >= 0.7) return 'high';
  if (confidence >= 0.4) return 'medium';
  return 'low';
}
