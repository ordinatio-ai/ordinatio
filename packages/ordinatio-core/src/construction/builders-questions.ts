// IHS
/**
 * Builder's Questions (Book V §VIII)
 *
 * Four questions every module builder must answer before submission.
 * These are not gatekeeping — they are introspection tools that
 * force the builder to articulate why this module must exist.
 *
 * "What complexity did this remove?" is the most important question
 * in all of Ordinatio. If you cannot answer it, do not proceed.
 *
 * DEPENDS ON: construction/types
 * USED BY: pre-disputation-audit
 */

import type { BuildersAnswer, BuildersQuestionsResult } from './types';

// ---------------------------------------------------------------------------
// The Four Questions
// ---------------------------------------------------------------------------

export const BUILDERS_QUESTIONS: readonly string[] = [
  'What complexity did this remove?',
  'What future burden does this introduce?',
  'What assumptions may age poorly?',
  'Could this be smaller?',
] as const;

const MIN_SUBSTANTIVE_LENGTH = 20;
const POINTS_PER_QUESTION = 25;

// ---------------------------------------------------------------------------
// Assessment
// ---------------------------------------------------------------------------

function isSubstantive(answer: string): boolean {
  if (!answer || answer.trim().length < MIN_SUBSTANTIVE_LENGTH) return false;
  // Single-word answers are not substantive
  if (answer.trim().split(/\s+/).length <= 1) return false;
  return true;
}

/**
 * Assess the Builder's Questions for a module.
 *
 * @param moduleId - The module being assessed
 * @param answers - Map of question index (0-3) to answer text
 */
export function assessBuildersQuestions(
  moduleId: string,
  answers: Record<number, string>,
): BuildersQuestionsResult {
  const assessed: BuildersAnswer[] = [];
  const recommendations: string[] = [];
  let score = 0;
  let answeredCount = 0;

  for (let i = 0; i < BUILDERS_QUESTIONS.length; i++) {
    const question = BUILDERS_QUESTIONS[i];
    const answer = answers[i] ?? '';
    const substantive = isSubstantive(answer);

    assessed.push({ question, answer, substantive });

    if (answer.trim()) {
      answeredCount++;
    }

    if (substantive) {
      score += POINTS_PER_QUESTION;
    } else if (!answer.trim()) {
      recommendations.push(`Answer required: "${question}"`);
    } else {
      recommendations.push(`Expand answer for: "${question}" — current answer is too brief`);
    }
  }

  return {
    moduleId,
    answers: assessed,
    score,
    allAnswered: answeredCount === BUILDERS_QUESTIONS.length,
    recommendations,
    readyForSubmission: score === 100,
  };
}
