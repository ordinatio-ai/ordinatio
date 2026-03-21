// ===========================================
// OPERATIONAL INTUITION — Evidence-Based Resolution
// ===========================================
// Suggests what to do next based on historical
// success rates.
//
// Different from `predictFromSequences` in intent-inference:
// that returns confidence (A->B probability), while THIS
// returns comparative rates across ALL possible follow-ups,
// ranked by historical frequency.
//
// "When A happens, B follows 60% of the time, C 35%, D 5%"
// ===========================================

import type { LearnedSequence } from './types';

/**
 * A resolution suggestion with comparative historical rates.
 */
export interface ResolutionSuggestion {
  /** The suggested follow-up action */
  action: string;
  /** What percentage of triggers got this follow-up (0-1) */
  historicalRate: number;
  /** Confidence of the underlying sequence */
  confidence: number;
  /** Typical delay for this follow-up */
  medianDelayMs: number;
  /** How many times this follow-up was observed */
  occurrences: number;
}

/**
 * Suggest resolutions for a trigger action based on learned sequences.
 *
 * Returns ALL known follow-ups ranked by historical rate,
 * giving the agent or operator comparative context for what
 * typically happens next.
 *
 * @param triggerAction - The action that occurred
 * @param sequences - All learned sequences
 * @param minOccurrences - Minimum observations to include (default: 2)
 */
export function suggestResolutions(
  triggerAction: string,
  sequences: LearnedSequence[],
  minOccurrences = 2,
): ResolutionSuggestion[] {
  // Find all sequences starting from this trigger
  const matching = sequences.filter(
    s => s.fromAction === triggerAction && s.occurrences >= minOccurrences
  );

  if (matching.length === 0) return [];

  // Calculate total occurrences across all follow-ups for this trigger
  const totalOccurrences = matching.reduce((sum, s) => sum + s.occurrences, 0);

  return matching
    .map(s => ({
      action: s.toAction,
      historicalRate: totalOccurrences > 0 ? s.occurrences / totalOccurrences : 0,
      confidence: s.confidence,
      medianDelayMs: s.medianDelayMs,
      occurrences: s.occurrences,
    }))
    .sort((a, b) => b.historicalRate - a.historicalRate);
}
