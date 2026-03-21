import { describe, it, expect, vi } from 'vitest';
import { validatePasswordStrength, validatePasswordStrengthAsync, AUTH_PASSWORD_CONFIG } from './password';

describe('password', () => {
  describe('length requirements', () => {
    it('rejects passwords shorter than 12 characters', () => {
      const result = validatePasswordStrength('Short1!aB');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must be at least 12 characters');
    });

    it('accepts passwords with 12+ characters', () => {
      const result = validatePasswordStrength('LongEnough1!ab');
      expect(result.valid).toBe(true);
    });

    it('gives higher score for longer passwords', () => {
      const short = validatePasswordStrength('Abcdefgh1!xy');
      const long = validatePasswordStrength('Abcdefgh1!xyzwvutsrqp');
      expect(long.score).toBeGreaterThan(short.score);
    });
  });

  describe('character class requirements', () => {
    it('requires uppercase letters', () => {
      const result = validatePasswordStrength('alllowercase1!');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one uppercase letter');
    });

    it('requires lowercase letters', () => {
      const result = validatePasswordStrength('ALLUPPERCASE1!');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one lowercase letter');
    });

    it('requires numbers', () => {
      const result = validatePasswordStrength('NoNumbersHere!');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one number');
    });

    it('requires special characters', () => {
      const result = validatePasswordStrength('NoSpecialChars1');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one special character (!@#$%^&*...)');
    });

    it('accepts password with all character classes', () => {
      const result = validatePasswordStrength('ValidPass1!abc');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('common password detection', () => {
    it('rejects common passwords', () => {
      for (const pwd of ['password', 'qwerty', '123456789']) {
        const result = validatePasswordStrength(pwd);
        expect(result.errors).toContain('This password is too common and easily guessable');
      }
    });

    it('rejects common passwords with substitutions', () => {
      const result = validatePasswordStrength('p@ssw0rd');
      expect(result.errors.some(e => e.includes('common password'))).toBe(true);
    });

    it('accepts non-common passwords', () => {
      const result = validatePasswordStrength('Xk9$mNpQ2vWz!a');
      expect(result.errors.filter(e => e.includes('common'))).toHaveLength(0);
    });
  });

  describe('pattern detection', () => {
    it('rejects passwords with too many consecutive characters', () => {
      const result = validatePasswordStrength('Aaaaaa234!bcde');
      expect(result.errors).toContain('Password should not have more than 3 consecutive identical characters');
    });

    it('accepts passwords with 3 or fewer consecutive characters', () => {
      const result = validatePasswordStrength('Aaa123!Bbb456');
      expect(result.errors.filter(e => e.includes('consecutive'))).toHaveLength(0);
    });

    it('rejects keyboard patterns', () => {
      const result = validatePasswordStrength('Qwerty123!abc');
      expect(result.errors).toContain('Password contains a keyboard pattern');
    });

    it('rejects reversed keyboard patterns', () => {
      const result = validatePasswordStrength('Ytrewq123!abc');
      expect(result.errors).toContain('Password contains a keyboard pattern');
    });
  });

  describe('unique character requirements', () => {
    it('rejects passwords with too few unique characters', () => {
      const result = validatePasswordStrength('AaAaAa1!1!1!');
      expect(result.errors).toContain('Password should contain at least 8 unique characters');
    });

    it('accepts passwords with enough unique characters', () => {
      const result = validatePasswordStrength('Abcdefgh1!@#');
      expect(result.errors.filter(e => e.includes('unique'))).toHaveLength(0);
    });
  });

  describe('personal info detection', () => {
    it('rejects passwords containing username', () => {
      const result = validatePasswordStrength('johnsmith123!A', { username: 'johnsmith' });
      expect(result.errors).toContain('Password should not contain your username');
    });

    it('rejects passwords containing email local part', () => {
      const result = validatePasswordStrength('johndoe123!Abc', { email: 'johndoe@example.com' });
      expect(result.errors).toContain('Password should not contain parts of your email');
    });

    it('accepts passwords without personal info', () => {
      const result = validatePasswordStrength('Xk9$mNpQ2vWz!a', { username: 'johndoe', email: 'john@example.com' });
      expect(result.errors.filter(e => e.includes('username') || e.includes('email'))).toHaveLength(0);
    });
  });

  describe('scoring', () => {
    it('returns score between 0 and 100', () => {
      const weak = validatePasswordStrength('a');
      const strong = validatePasswordStrength('Xk9$mNpQ2vWz!abcdefghij');
      expect(weak.score).toBeGreaterThanOrEqual(0);
      expect(weak.score).toBeLessThanOrEqual(100);
      expect(strong.score).toBeGreaterThanOrEqual(0);
      expect(strong.score).toBeLessThanOrEqual(100);
    });

    it('gives higher scores to stronger passwords', () => {
      const weak = validatePasswordStrength('password123');
      const medium = validatePasswordStrength('Password1!ab');
      const strong = validatePasswordStrength('Xk9$mNpQ2vWz!abcdefghij');
      expect(medium.score).toBeGreaterThan(weak.score);
      expect(strong.score).toBeGreaterThan(medium.score);
    });
  });

  describe('manifests', () => {
    it('returns ALLOW manifest for strong passwords', () => {
      const result = validatePasswordStrength('Xk9$mNpQ2vWz!a');
      expect(result.manifest).toBeDefined();
      expect(result.manifest!.suggestedAction).toBe('ALLOW');
      expect(result.manifest!.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('returns PROMPT_PASSWORD_CHANGE manifest for weak passwords', () => {
      const result = validatePasswordStrength('weak');
      expect(result.manifest!.suggestedAction).toBe('PROMPT_PASSWORD_CHANGE');
      expect(result.manifest!.confidence).toBe(0.95);
    });

    it('returns higher confidence for high-scoring passwords', () => {
      const strong = validatePasswordStrength('Xk9$mNpQ2vWz!abcdefghij');
      const ok = validatePasswordStrength('ValidPass1!ab');
      expect(strong.manifest!.confidence).toBeGreaterThanOrEqual(ok.manifest!.confidence);
    });
  });

  describe('validatePasswordStrengthAsync', () => {
    it('returns same result as sync when no options', async () => {
      const sync = validatePasswordStrength('Xk9$mNpQ2vWz!a');
      const async_ = await validatePasswordStrengthAsync('Xk9$mNpQ2vWz!a');
      expect(async_.valid).toBe(sync.valid);
      expect(async_.score).toBe(sync.score);
    });

    it('rejects breached password', async () => {
      const result = await validatePasswordStrengthAsync('Xk9$mNpQ2vWz!a', undefined, {
        checkBreached: async () => true,
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('This password has appeared in a data breach and should not be used');
      expect(result.score).toBeLessThanOrEqual(60);
      expect(result.manifest!.suggestedAction).toBe('PROMPT_PASSWORD_CHANGE');
      expect(result.manifest!.requiresHumanReview).toBe(true);
    });

    it('accepts non-breached password', async () => {
      const result = await validatePasswordStrengthAsync('Xk9$mNpQ2vWz!a', undefined, {
        checkBreached: async () => false,
      });
      expect(result.valid).toBe(true);
    });

    it('silently continues if breach check throws', async () => {
      const result = await validatePasswordStrengthAsync('Xk9$mNpQ2vWz!a', undefined, {
        checkBreached: async () => { throw new Error('Network error'); },
      });
      expect(result.valid).toBe(true);
    });

    it('passes context to sync validation', async () => {
      const result = await validatePasswordStrengthAsync(
        'johnsmith123!Abcd',
        { username: 'johnsmith' },
      );
      expect(result.errors).toContain('Password should not contain your username');
    });

    it('works without options object', async () => {
      const result = await validatePasswordStrengthAsync('Xk9$mNpQ2vWz!a');
      expect(result.valid).toBe(true);
    });

    it('drops score by 40 on breach', async () => {
      const clean = await validatePasswordStrengthAsync('Xk9$mNpQ2vWz!a', undefined, {
        checkBreached: async () => false,
      });
      const breached = await validatePasswordStrengthAsync('Xk9$mNpQ2vWz!a', undefined, {
        checkBreached: async () => true,
      });
      expect(clean.score - breached.score).toBe(40);
    });

    it('score does not go below 0 on breach', async () => {
      const result = await validatePasswordStrengthAsync('weak', undefined, {
        checkBreached: async () => true,
      });
      expect(result.score).toBeGreaterThanOrEqual(0);
    });
  });

  describe('suggestions', () => {
    it('provides suggestions for weak passwords', () => {
      const result = validatePasswordStrength('weak');
      expect(result.suggestions.length).toBeGreaterThan(0);
      expect(result.suggestions.some(s => s.includes('passphrase'))).toBe(true);
    });

    it('provides no suggestions for strong passwords', () => {
      const result = validatePasswordStrength('Xk9$mNpQ2vWz!a');
      expect(result.suggestions).toHaveLength(0);
    });
  });
});
