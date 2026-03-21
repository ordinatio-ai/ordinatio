// ===========================================
// AUTOMATION SECURITY
// ===========================================
// Security utilities for the automation system.
// Prevents SSRF, XSS, and other attacks.
// ===========================================

// Logger fallback
const logger = {
  warn(message: string, meta?: Record<string, unknown>): void {
    console.warn(`[automation/security] ${message}`, meta ?? '');
  },
};

// ===========================================
// SSRF PROTECTION
// ===========================================

// Private/internal IP ranges that should never be called
const PRIVATE_IP_PATTERNS = [
  // Loopback
  /^127\.\d+\.\d+\.\d+$/,
  /^0\.0\.0\.0$/,
  // Private networks
  /^10\.\d+\.\d+\.\d+$/,
  /^192\.168\.\d+\.\d+$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
  // Link-local
  /^169\.254\.\d+\.\d+$/,
  // IPv6 loopback and private (simplified)
  /^::1$/,
  /^fe80:/i,
  /^fc00:/i,
  /^fd00:/i,
];

// Blocked hostnames
const BLOCKED_HOSTNAMES = [
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
];

// Blocked TLDs/suffixes (internal networks)
const BLOCKED_SUFFIXES = [
  '.local',
  '.localhost',
  '.internal',
  '.corp',
  '.lan',
  '.home',
  '.intranet',
];

// Cloud metadata endpoints (SSRF targets)
const BLOCKED_METADATA_HOSTS = [
  '169.254.169.254', // AWS/GCP/Azure metadata
  'metadata.google.internal',
  'metadata.goog',
];

/**
 * Check if a hostname resolves to a private IP
 */
function isPrivateIP(ip: string): boolean {
  return PRIVATE_IP_PATTERNS.some((pattern) => pattern.test(ip));
}

/**
 * Check if a hostname is explicitly blocked
 */
function isBlockedHostname(hostname: string): boolean {
  const lowerHostname = hostname.toLowerCase();

  // Check exact matches
  if (BLOCKED_HOSTNAMES.includes(lowerHostname)) {
    return true;
  }

  // Check metadata endpoints
  if (BLOCKED_METADATA_HOSTS.includes(lowerHostname)) {
    return true;
  }

  // Check blocked suffixes
  if (BLOCKED_SUFFIXES.some((suffix) => lowerHostname.endsWith(suffix))) {
    return true;
  }

  // Check if it's a raw IP that's private
  if (isPrivateIP(lowerHostname)) {
    return true;
  }

  return false;
}

/**
 * Validate that a URL is safe to call (not internal/private)
 * Returns { safe: true } or { safe: false, reason: string }
 */
export function validateWebhookUrl(urlString: string): { safe: boolean; reason?: string } {
  try {
    const url = new URL(urlString);

    // Only allow http and https
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return { safe: false, reason: `Protocol not allowed: ${url.protocol}` };
    }

    // Check hostname
    const hostname = url.hostname.toLowerCase();

    if (isBlockedHostname(hostname)) {
      return { safe: false, reason: `Hostname not allowed: ${hostname}` };
    }

    // Check for IP address in hostname
    if (isPrivateIP(hostname)) {
      return { safe: false, reason: `Private IP not allowed: ${hostname}` };
    }

    // Check port (block common internal ports)
    const port = url.port || (url.protocol === 'https:' ? '443' : '80');
    const blockedPorts = ['22', '23', '25', '3306', '5432', '6379', '27017'];
    if (blockedPorts.includes(port)) {
      return { safe: false, reason: `Port not allowed: ${port}` };
    }

    return { safe: true };
  } catch (err) {
    return { safe: false, reason: `Invalid URL: ${err instanceof Error ? err.message : 'Unknown error'}` };
  }
}

// ===========================================
// INPUT SANITIZATION
// ===========================================

// Characters that could be dangerous in various contexts
const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
  '`': '&#x60;',
  '=': '&#x3D;',
};

/**
 * Escape HTML special characters to prevent XSS
 */
export function escapeHtml(str: string): string {
  return str.replace(/[&<>"'`=/]/g, (char) => HTML_ESCAPE_MAP[char] || char);
}

/**
 * Sanitize a string for safe use in templates
 * Removes/escapes potentially dangerous content
 */
export function sanitizeTemplateValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    // Remove null bytes and other control characters (except newlines/tabs)
    let sanitized = value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    // Limit length to prevent DoS
    if (sanitized.length > 10000) {
      sanitized = sanitized.substring(0, 10000) + '...[truncated]';
    }

    return sanitized;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  // For objects/arrays, stringify safely
  try {
    const json = JSON.stringify(value);
    if (json.length > 10000) {
      return json.substring(0, 10000) + '...[truncated]';
    }
    return json;
  } catch {
    return '[unserializable]';
  }
}

/**
 * Sanitize template value for HTML context (escapes HTML)
 */
export function sanitizeForHtml(value: unknown): string {
  return escapeHtml(sanitizeTemplateValue(value));
}

/**
 * Sanitize an email address
 */
export function sanitizeEmail(email: string): string {
  // Remove any characters that aren't valid in email
  return email.replace(/[^\w.@+-]/g, '').toLowerCase().trim();
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 254;
}

// ===========================================
// WEBHOOK RATE LIMITING (per destination)
// ===========================================

interface WebhookRateLimit {
  count: number;
  windowStart: number;
}

// Rate limit tracking per domain
const webhookRateLimits = new Map<string, WebhookRateLimit>();

// Config: max calls per domain per window
const WEBHOOK_RATE_LIMIT = {
  maxCallsPerWindow: 100,
  windowMs: 60 * 1000, // 1 minute
};

/**
 * Extract domain from URL for rate limiting
 */
function extractDomain(urlString: string): string {
  try {
    const url = new URL(urlString);
    return url.hostname.toLowerCase();
  } catch {
    return 'unknown';
  }
}

/**
 * Check if webhook call is within rate limits
 * Returns true if allowed, false if rate limited
 */
export function checkWebhookRateLimit(urlString: string): { allowed: boolean; reason?: string } {
  const domain = extractDomain(urlString);
  const now = Date.now();

  const limit = webhookRateLimits.get(domain);

  if (limit) {
    // Check if window has expired
    if (now - limit.windowStart >= WEBHOOK_RATE_LIMIT.windowMs) {
      // Reset window
      webhookRateLimits.set(domain, { count: 1, windowStart: now });
      return { allowed: true };
    }

    // Check if over limit
    if (limit.count >= WEBHOOK_RATE_LIMIT.maxCallsPerWindow) {
      const resetIn = Math.ceil((limit.windowStart + WEBHOOK_RATE_LIMIT.windowMs - now) / 1000);
      logger.warn('Webhook rate limit exceeded', { domain, count: limit.count, resetIn });
      return {
        allowed: false,
        reason: `Rate limit exceeded for ${domain}. Try again in ${resetIn}s`,
      };
    }

    // Increment count
    limit.count++;
    return { allowed: true };
  }

  // First call to this domain
  webhookRateLimits.set(domain, { count: 1, windowStart: now });
  return { allowed: true };
}

/**
 * Clear webhook rate limits (for testing)
 */
export function clearWebhookRateLimits(): void {
  webhookRateLimits.clear();
}

/**
 * Get current rate limit stats
 */
export function getWebhookRateLimitStats(): Map<string, WebhookRateLimit> {
  return new Map(webhookRateLimits);
}

// ===========================================
// SECURITY LOGGING
// ===========================================

/**
 * Log a security event
 */
export function logSecurityEvent(
  event: 'SSRF_BLOCKED' | 'RATE_LIMITED' | 'INVALID_INPUT',
  details: Record<string, unknown>
): void {
  logger.warn(`Security event: ${event}`, details);
}
