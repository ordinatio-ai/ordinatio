// IHS
import { describe, it, expect } from 'vitest';
import { BUILDERS_QUESTIONS, assessBuildersQuestions } from './builders-questions';

describe('Builder\'s Questions', () => {
  describe('BUILDERS_QUESTIONS constant', () => {
    it('has exactly 4 questions', () => {
      expect(BUILDERS_QUESTIONS).toHaveLength(4);
    });

    it('first question is about complexity removal', () => {
      expect(BUILDERS_QUESTIONS[0]).toBe('What complexity did this remove?');
    });

    it('all questions are non-empty strings', () => {
      for (const q of BUILDERS_QUESTIONS) {
        expect(typeof q).toBe('string');
        expect(q.length).toBeGreaterThan(10);
      }
    });
  });

  describe('assessBuildersQuestions', () => {
    it('returns score 100 when all 4 answered substantively', () => {
      const result = assessBuildersQuestions('test-module', {
        0: 'This module removed the need for manual data validation across 12 endpoints.',
        1: 'It introduces a dependency on the covenant type system that must be maintained.',
        2: 'The assumption that all modules have exactly one health check may not hold.',
        3: 'The boundary checker could be merged into the validator, but separation is clearer.',
      });

      expect(result.score).toBe(100);
      expect(result.allAnswered).toBe(true);
      expect(result.readyForSubmission).toBe(true);
      expect(result.recommendations).toHaveLength(0);
      expect(result.moduleId).toBe('test-module');
    });

    it('returns score 0 when no answers provided', () => {
      const result = assessBuildersQuestions('empty-module', {});

      expect(result.score).toBe(0);
      expect(result.allAnswered).toBe(false);
      expect(result.readyForSubmission).toBe(false);
      expect(result.recommendations).toHaveLength(4);
    });

    it('returns proportional score for partial answers', () => {
      const result = assessBuildersQuestions('partial-module', {
        0: 'This removed the complexity of manual covenant validation entirely.',
        1: 'It introduces a testing burden for all future covenant changes.',
      });

      expect(result.score).toBe(50); // 2 × 25
      expect(result.allAnswered).toBe(false);
      expect(result.readyForSubmission).toBe(false);
      expect(result.recommendations.length).toBeGreaterThan(0);
    });

    it('rejects single-word answers as non-substantive', () => {
      const result = assessBuildersQuestions('terse-module', {
        0: 'Nothing',
        1: 'Everything',
        2: 'Maybe',
        3: 'No',
      });

      expect(result.score).toBe(0);
      expect(result.allAnswered).toBe(true); // answered but not substantive
      expect(result.readyForSubmission).toBe(false);
      expect(result.recommendations).toHaveLength(4);
      for (const rec of result.recommendations) {
        expect(rec).toContain('Expand answer');
      }
    });

    it('rejects answers shorter than 20 characters', () => {
      const result = assessBuildersQuestions('short-module', {
        0: 'Removed complexity',  // 18 chars — too short
        1: 'A dependency on types that must be kept current and validated regularly.', // long enough
        2: 'Small risk',          // too short
        3: 'Yes it could be smaller but the separation aids clarity in the long run.', // long enough
      });

      expect(result.score).toBe(50); // 2 substantive
    });

    it('rejects whitespace-only answers as unanswered', () => {
      const result = assessBuildersQuestions('whitespace-module', {
        0: '   ',
        1: '',
        2: '\t\n',
        3: '    ',
      });

      expect(result.score).toBe(0);
      expect(result.allAnswered).toBe(false);
      for (const rec of result.recommendations) {
        expect(rec).toContain('Answer required');
      }
    });

    it('produces 4 assessed answers matching the 4 questions', () => {
      const result = assessBuildersQuestions('full-module', {
        0: 'This module consolidates validation logic that was duplicated across services.',
        1: 'Future covenants must conform to the patterns validated here.',
        2: 'The scoring weights may need recalibration as more modules are added.',
        3: 'The boundary checker and validator could share more code, but clarity wins.',
      });

      expect(result.answers).toHaveLength(4);
      for (let i = 0; i < 4; i++) {
        expect(result.answers[i].question).toBe(BUILDERS_QUESTIONS[i]);
        expect(result.answers[i].substantive).toBe(true);
      }
    });
  });
});
