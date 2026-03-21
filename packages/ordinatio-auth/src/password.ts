// ===========================================
// @ordinatio/auth — Password Strength Validation
// ===========================================
// Comprehensive password strength checking.
// Zero dependencies — completely self-contained.
// ===========================================

import type { PasswordStrengthResult, PasswordValidationOptions } from './types';
import { buildManifest } from './manifest';

// ===========================================
// PASSWORD CONFIGURATION
// ===========================================

export const AUTH_PASSWORD_CONFIG = {
  /** Minimum password length */
  minLength: 12,
  /** Require uppercase letters */
  requireUppercase: true,
  /** Require lowercase letters */
  requireLowercase: true,
  /** Require numbers */
  requireNumbers: true,
  /** Require special characters */
  requireSpecial: true,
  /** Check against common passwords */
  checkCommonPasswords: true,
  /** Maximum consecutive identical characters */
  maxConsecutiveChars: 3,
  /** Minimum unique characters */
  minUniqueChars: 8,
} as const;

// ===========================================
// COMMON PASSWORDS LIST (Top 1000 truncated for size)
// ===========================================

const COMMON_PASSWORDS = new Set([
  // Top 100 most common passwords
  '123456', 'password', '12345678', 'qwerty', '123456789',
  '12345', '1234', '111111', '1234567', 'dragon',
  '123123', 'baseball', 'abc123', 'football', 'monkey',
  'letmein', 'shadow', 'master', '666666', 'qwertyuiop',
  '123321', 'mustang', '1234567890', 'michael', '654321',
  'superman', '1qaz2wsx', '7777777', '121212', '000000',
  'qazwsx', '123qwe', 'killer', 'trustno1', 'jordan',
  'jennifer', 'zxcvbnm', 'asdfgh', 'hunter', 'buster',
  'soccer', 'harley', 'batman', 'andrew', 'tigger',
  'sunshine', 'iloveyou', '2000', 'charlie', 'robert',
  'thomas', 'hockey', 'ranger', 'daniel', 'starwars',
  'klaster', '112233', 'george', 'computer', 'michelle',
  'jessica', 'pepper', '1111', 'zxcvbn', '555555',
  '11111111', '131313', 'freedom', '777777', 'pass',
  'maggie', '159753', 'aaaaaa', 'ginger', 'princess',
  'joshua', 'cheese', 'amanda', 'summer', 'love',
  'ashley', 'nicole', 'chelsea', 'biteme', 'matthew',
  'access', 'yankees', '987654321', 'dallas', 'austin',
  'thunder', 'taylor', 'matrix', 'mobilemail', 'mom',
  'monitor', 'monitoring', 'montana', 'moon', 'moscow',
  // Additional common patterns
  'password1', 'password12', 'password123', 'password1234',
  'welcome', 'welcome1', 'welcome12', 'welcome123',
  'admin', 'admin123', 'admin1234', 'administrator',
  'root', 'root123', 'toor', 'changeme', 'changeme123',
  'passw0rd', 'p@ssw0rd', 'p@ssword', 'P@ssw0rd',
  'letmein1', 'letmein123', 'login', 'login123',
  'hello', 'hello123', 'test', 'test123', 'test1234',
  'guest', 'guest123', 'master123', 'backup', 'backup123',
  // Keyboard patterns
  'qwerty123', 'qwerty1234', 'asdfghjkl', '1q2w3e4r',
  '1q2w3e4r5t', 'zaq1zaq1', '!qaz2wsx', 'qazwsxedc',
  // Year-based
  '2023', '2024', '2025', '2026', 'winter2023', 'summer2024',
  'spring2025', 'fall2026', 'january', 'february', 'march',
  // Common names with numbers
  'michael1', 'jennifer1', 'jessica1', 'daniel1', 'matthew1',
  // Company/product names
  'microsoft', 'google', 'facebook', 'amazon', 'apple',
  // Sports teams
  'yankees1', 'cowboys', 'lakers', 'patriots', 'eagles',
]);

// ===========================================
// PASSWORD STRENGTH VALIDATION
// ===========================================

/**
 * Validate password strength against security policy.
 *
 * Checks: min length, character diversity, common password list,
 * consecutive characters, unique character count, keyboard patterns,
 * personal info patterns.
 */
export function validatePasswordStrength(
  password: string,
  context?: { username?: string; email?: string }
): PasswordStrengthResult {
  const config = AUTH_PASSWORD_CONFIG;
  const errors: string[] = [];
  const suggestions: string[] = [];
  let score = 0;

  // Basic length check
  if (password.length < config.minLength) {
    errors.push(`Password must be at least ${config.minLength} characters`);
  } else {
    score += 20;
    if (password.length >= 16) score += 10;
    if (password.length >= 20) score += 10;
  }

  // Character class checks
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumbers = /[0-9]/.test(password);
  const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(password);

  if (config.requireUppercase && !hasUppercase) {
    errors.push('Password must contain at least one uppercase letter');
  } else if (hasUppercase) {
    score += 10;
  }

  if (config.requireLowercase && !hasLowercase) {
    errors.push('Password must contain at least one lowercase letter');
  } else if (hasLowercase) {
    score += 10;
  }

  if (config.requireNumbers && !hasNumbers) {
    errors.push('Password must contain at least one number');
  } else if (hasNumbers) {
    score += 10;
  }

  if (config.requireSpecial && !hasSpecial) {
    errors.push('Password must contain at least one special character (!@#$%^&*...)');
  } else if (hasSpecial) {
    score += 15;
  }

  // Check against common passwords
  if (config.checkCommonPasswords) {
    const lowerPassword = password.toLowerCase();
    if (COMMON_PASSWORDS.has(lowerPassword)) {
      errors.push('This password is too common and easily guessable');
      score -= 30;
    }

    // Also check with common substitutions reversed
    const desubstituted = lowerPassword
      .replace(/0/g, 'o')
      .replace(/1/g, 'i')
      .replace(/3/g, 'e')
      .replace(/4/g, 'a')
      .replace(/5/g, 's')
      .replace(/7/g, 't')
      .replace(/@/g, 'a')
      .replace(/\$/g, 's');

    if (desubstituted !== lowerPassword && COMMON_PASSWORDS.has(desubstituted)) {
      errors.push('This password is a common password with obvious substitutions');
      score -= 20;
    }
  }

  // Check for consecutive identical characters
  const consecutiveMatch = password.match(/(.)\1{2,}/g);
  if (consecutiveMatch) {
    const maxConsecutive = Math.max(...consecutiveMatch.map(m => m.length));
    if (maxConsecutive > config.maxConsecutiveChars) {
      errors.push(`Password should not have more than ${config.maxConsecutiveChars} consecutive identical characters`);
      score -= 10;
    }
  }

  // Check unique character count
  const uniqueChars = new Set(password).size;
  if (uniqueChars < config.minUniqueChars) {
    errors.push(`Password should contain at least ${config.minUniqueChars} unique characters`);
    score -= 10;
  } else {
    score += Math.min(10, (uniqueChars - config.minUniqueChars) * 2);
  }

  // Check for keyboard patterns
  const keyboardPatterns = [
    'qwerty', 'asdfgh', 'zxcvbn', 'qwertyuiop', 'asdfghjkl',
    '123456', '234567', '345678', '456789', '567890',
    'abcdef', 'bcdefg', 'cdefgh', 'defghi', 'efghij',
    '!@#$%^', '@#$%^&', '#$%^&*',
  ];

  const lowerPassword = password.toLowerCase();
  for (const pattern of keyboardPatterns) {
    if (lowerPassword.includes(pattern) || lowerPassword.includes(pattern.split('').reverse().join(''))) {
      errors.push('Password contains a keyboard pattern');
      score -= 15;
      break;
    }
  }

  // Check for personal info (if provided)
  if (context) {
    if (context.username) {
      const lowerUsername = context.username.toLowerCase();
      if (lowerPassword.includes(lowerUsername)) {
        errors.push('Password should not contain your username');
        score -= 20;
      }
    }

    if (context.email) {
      const emailLocal = context.email.split('@')[0].toLowerCase();
      if (emailLocal.length > 2 && lowerPassword.includes(emailLocal)) {
        errors.push('Password should not contain parts of your email');
        score -= 20;
      }
    }
  }

  // Generate suggestions
  if (errors.length > 0) {
    suggestions.push('Use a passphrase: combine 4+ random words (e.g., "correct horse battery staple")');
    suggestions.push('Use a password manager to generate and store strong passwords');

    if (!hasSpecial) {
      suggestions.push('Add special characters in the middle of your password, not just at the end');
    }

    if (password.length < 16) {
      suggestions.push('Longer passwords are exponentially harder to crack');
    }
  }

  // Normalize score
  score = Math.max(0, Math.min(100, score));

  const valid = errors.length === 0;

  return {
    valid,
    score,
    errors,
    suggestions,
    manifest: buildManifest(
      valid ? 'ALLOW' : 'PROMPT_PASSWORD_CHANGE',
      valid ? (score >= 80 ? 1.0 : 0.9) : 0.95,
    ),
  };
}

/**
 * Async password validation with optional breach checking.
 *
 * Runs sync validation first, then calls the async `checkBreached` callback.
 * If breached: adds error, drops score by 40, sets valid=false.
 * If callback throws: silently continues (advisory, not blocking).
 *
 * Existing sync function unchanged (no breaking change).
 */
export async function validatePasswordStrengthAsync(
  password: string,
  context?: { username?: string; email?: string },
  options?: PasswordValidationOptions,
): Promise<PasswordStrengthResult> {
  const result = validatePasswordStrength(password, context);

  if (options?.checkBreached) {
    try {
      const breached = await options.checkBreached(password);
      if (breached) {
        result.errors.push('This password has appeared in a data breach and should not be used');
        result.score = Math.max(0, result.score - 40);
        result.valid = false;
        result.manifest = buildManifest('PROMPT_PASSWORD_CHANGE', 0.95, true);
      }
    } catch {
      // Breach check is advisory — failure does not block
    }
  }

  return result;
}
