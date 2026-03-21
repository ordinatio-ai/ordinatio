// ===========================================
// @ordinatio/security — Security Headers
// ===========================================
// Pure header building functions — no framework dependency.
// The app layer wraps these to apply to NextResponse/Express/etc.
// ===========================================

/**
 * Build Content-Security-Policy header value.
 * @param isDev - whether the app is in development mode
 */
export function buildContentSecurityPolicy(isDev = false): string {
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': [
      "'self'",
      ...(isDev ? ["'unsafe-eval'", "'unsafe-inline'"] : []),
    ],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:'],
    'font-src': ["'self'", 'data:'],
    'connect-src': [
      "'self'",
      'https://api.gocreate.nu',
      'https://*.ingest.sentry.io',
      ...(isDev ? ['ws://localhost:3000'] : []),
    ],
    'media-src': ["'self'", 'blob:'],
    'object-src': ["'none'"],
    'frame-src': ["'self'"],
    'frame-ancestors': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'manifest-src': ["'self'"],
    'worker-src': ["'self'", 'blob:'],
    ...(!isDev ? { 'upgrade-insecure-requests': [] } : {}),
  };

  return Object.entries(directives)
    .map(([directive, values]) => {
      if (values.length === 0) return directive;
      return `${directive} ${values.join(' ')}`;
    })
    .join('; ');
}

/**
 * Build Permissions-Policy header value.
 */
export function buildPermissionsPolicy(): string {
  const permissions: Record<string, string> = {
    accelerometer: '()',
    'ambient-light-sensor': '()',
    gyroscope: '()',
    magnetometer: '()',
    camera: '()',
    microphone: '()',
    'display-capture': '()',
    geolocation: '()',
    payment: '()',
    usb: '()',
    bluetooth: '()',
    serial: '()',
    hid: '()',
    autoplay: '(self)',
    fullscreen: '(self)',
    'picture-in-picture': '(self)',
    'web-share': '()',
    'encrypted-media': '(self)',
    'interest-cohort': '()',
    'browsing-topics': '()',
  };

  return Object.entries(permissions)
    .map(([feature, value]) => `${feature}=${value}`)
    .join(', ');
}

/**
 * Build the complete set of security headers.
 * @param isDev - whether the app is in development mode
 */
export function buildSecurityHeaders(isDev = false): Record<string, string> {
  return {
    'Content-Security-Policy': buildContentSecurityPolicy(isDev),
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': buildPermissionsPolicy(),
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'credentialless',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'X-DNS-Prefetch-Control': 'off',
    'X-Download-Options': 'noopen',
    'X-Permitted-Cross-Domain-Policies': 'none',
  };
}

/**
 * Pre-built headers for production use.
 */
export const SECURITY_HEADERS = buildSecurityHeaders(false);

export function getSecurityHeaders(): Record<string, string> {
  return { ...SECURITY_HEADERS };
}

export const headerBuilders = {
  buildContentSecurityPolicy,
  buildPermissionsPolicy,
  buildSecurityHeaders,
};
