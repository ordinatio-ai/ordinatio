import { describe, it, expect } from 'vitest';
import {
  SECURITY_HEADERS,
  getSecurityHeaders,
  buildSecurityHeaders,
  buildContentSecurityPolicy,
  buildPermissionsPolicy,
} from '../security-headers';

describe('Security Headers', () => {
  it('SECURITY_HEADERS contains required headers', () => {
    expect(SECURITY_HEADERS['Content-Security-Policy']).toBeTruthy();
    expect(SECURITY_HEADERS['Strict-Transport-Security']).toContain('max-age=31536000');
    expect(SECURITY_HEADERS['X-Frame-Options']).toBe('DENY');
    expect(SECURITY_HEADERS['X-Content-Type-Options']).toBe('nosniff');
    expect(SECURITY_HEADERS['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(SECURITY_HEADERS['Permissions-Policy']).toBeTruthy();
    expect(SECURITY_HEADERS['Cross-Origin-Opener-Policy']).toBe('same-origin');
    expect(SECURITY_HEADERS['Cross-Origin-Embedder-Policy']).toBe('credentialless');
  });

  it('getSecurityHeaders returns a copy', () => {
    const headers = getSecurityHeaders();
    headers['X-Custom'] = 'test';
    expect(SECURITY_HEADERS['X-Custom']).toBeUndefined();
  });

  it('buildSecurityHeaders dev mode includes unsafe-eval', () => {
    const devHeaders = buildSecurityHeaders(true);
    expect(devHeaders['Content-Security-Policy']).toContain("'unsafe-eval'");
  });

  it('buildSecurityHeaders prod mode excludes unsafe-eval', () => {
    const prodHeaders = buildSecurityHeaders(false);
    expect(prodHeaders['Content-Security-Policy']).not.toContain("'unsafe-eval'");
  });

  it('CSP includes upgrade-insecure-requests in prod', () => {
    const csp = buildContentSecurityPolicy(false);
    expect(csp).toContain('upgrade-insecure-requests');
  });

  it('CSP excludes upgrade-insecure-requests in dev', () => {
    const csp = buildContentSecurityPolicy(true);
    expect(csp).not.toContain('upgrade-insecure-requests');
  });

  it('permissions policy disables dangerous features', () => {
    const policy = buildPermissionsPolicy();
    expect(policy).toContain('camera=()');
    expect(policy).toContain('microphone=()');
    expect(policy).toContain('geolocation=()');
    expect(policy).toContain('usb=()');
  });
});
