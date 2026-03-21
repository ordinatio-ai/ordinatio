// IHS
/**
 * Module Boundary Checker (Book V §II-III)
 *
 * Implements the Necessity Principle and Universality Test.
 * A module is a last resort — not a first instinct.
 *
 * Book V §II: "A module must be created because it is inevitable,
 * not because it is useful."
 *
 * DEPENDS ON: construction/types
 * USED BY: pre-disputation-audit
 */

import type {
  BoundaryCheckInput,
  BoundaryCheckResult,
  BoundaryCheckItem,
  BoundaryCheckCategory,
} from './types';

// ---------------------------------------------------------------------------
// Diagnostic questions
// ---------------------------------------------------------------------------

interface DiagnosticQuestion {
  category: BoundaryCheckCategory;
  question: string;
  field: keyof BoundaryCheckInput;
  /** When true, the check passes if the input value is FALSE */
  invertPass: boolean;
}

const DIAGNOSTIC_QUESTIONS: readonly DiagnosticQuestion[] = [
  // Necessity (Book V §II)
  {
    category: 'necessity',
    question: 'Does this capability appear repeatedly across unrelated contexts?',
    field: 'appearsRepeatedly',
    invertPass: false,
  },
  {
    category: 'necessity',
    question: 'Are existing modules insufficient to express this cleanly?',
    field: 'existingModulesInsufficient',
    invertPass: false,
  },
  {
    category: 'necessity',
    question: 'Does the absence of this module create distortion in others?',
    field: 'absenceCreatesDistortion',
    invertPass: false,
  },
  {
    category: 'necessity',
    question: 'Can this be solved by composing existing modules?',
    field: 'canBeSolvedByComposition',
    invertPass: true, // passes when false — composition means no new module needed
  },
  // Universality (Book V §III)
  {
    category: 'universality',
    question: 'Would unrelated organizations need this capability?',
    field: 'unrelatedOrgsNeed',
    invertPass: false,
  },
  {
    category: 'universality',
    question: 'Does this depend on industry-specific assumptions?',
    field: 'dependsOnIndustryAssumptions',
    invertPass: true, // passes when false — industry assumptions = not universal
  },
  {
    category: 'universality',
    question: 'Can branding be removed without losing the capability?',
    field: 'brandingRemovableWithoutLoss',
    invertPass: false,
  },
  // Isolation
  {
    category: 'isolation',
    question: 'Can this module be removed without systemic collapse?',
    field: 'removableWithoutSystemicCollapse',
    invertPass: false,
  },
  {
    category: 'isolation',
    question: 'Does this module have a clear, well-defined boundary?',
    field: 'hasClearBoundary',
    invertPass: false,
  },
  // Simplification
  {
    category: 'simplification',
    question: 'Does adding this module reduce total system complexity?',
    field: 'reducesTotalComplexity',
    invertPass: false,
  },
];

// ---------------------------------------------------------------------------
// Checker
// ---------------------------------------------------------------------------

/**
 * Check whether a candidate module meets boundary requirements.
 */
export function checkModuleBoundary(input: BoundaryCheckInput): BoundaryCheckResult {
  const checkedAt = new Date();
  const items: BoundaryCheckItem[] = [];
  const categoryScores: Record<BoundaryCheckCategory, { passed: number; total: number }> = {
    necessity: { passed: 0, total: 0 },
    universality: { passed: 0, total: 0 },
    isolation: { passed: 0, total: 0 },
    simplification: { passed: 0, total: 0 },
  };

  for (const q of DIAGNOSTIC_QUESTIONS) {
    const rawValue = input[q.field] as boolean;
    const passed = q.invertPass ? !rawValue : rawValue;
    const evidence = passed
      ? `${q.field}: confirmed`
      : `${q.field}: failed — ${q.invertPass ? 'should be false' : 'should be true'}`;

    items.push({ category: q.category, question: q.question, passed, evidence });
    categoryScores[q.category].total++;
    if (passed) categoryScores[q.category].passed++;
  }

  // Determine recommendation
  const rejectionReasons: string[] = [];
  const necessityPassed = categoryScores.necessity.passed === categoryScores.necessity.total;
  const universalityPassed = categoryScores.universality.passed === categoryScores.universality.total;

  if (!necessityPassed) {
    const failedNecessity = items.filter(i => i.category === 'necessity' && !i.passed);
    for (const item of failedNecessity) {
      rejectionReasons.push(`Necessity: ${item.question}`);
    }
  }
  if (!universalityPassed) {
    const failedUniversality = items.filter(i => i.category === 'universality' && !i.passed);
    for (const item of failedUniversality) {
      rejectionReasons.push(`Universality: ${item.question}`);
    }
  }

  let recommendation: BoundaryCheckResult['recommendation'];
  if (necessityPassed && universalityPassed) {
    recommendation = 'proceed';
  } else if (!necessityPassed) {
    recommendation = 'reject';
  } else {
    recommendation = 'revise';
  }

  const overallPass = recommendation === 'proceed';

  return {
    moduleId: input.moduleId,
    checkedAt,
    items,
    overallPass,
    categoryScores,
    recommendation,
    rejectionReasons,
  };
}
