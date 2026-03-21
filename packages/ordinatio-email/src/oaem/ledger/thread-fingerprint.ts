// ===========================================
// THREAD FINGERPRINT — Deterministic Thread ID
// ===========================================
// Creates a stable thread identity from email metadata
// when no native thread ID exists (e.g., IMAP).
// ===========================================

import { computeHash } from '../signing/hash';

/**
 * Generate a deterministic thread fingerprint from email metadata.
 * Used when no stable thread ID exists (per OAEM spec section 8).
 *
 * @param subject - Normalized email subject (RE:/FW: stripped)
 * @param firstDate - ISO date string of the first email in the thread
 * @param senderDomain - Domain of the thread initiator
 * @param recipientDomain - Domain of the first recipient
 * @returns SHA-256 hex fingerprint
 */
export function generateThreadFingerprint(
  subject: string,
  firstDate: string,
  senderDomain: string,
  recipientDomain: string
): string {
  const normalized = normalizeSubject(subject).toLowerCase().trim();
  const input = `${normalized}|${firstDate}|${senderDomain}|${recipientDomain}`;
  return computeHash(input);
}

/**
 * Strip common reply/forward prefixes from email subjects.
 */
export function normalizeSubject(subject: string): string {
  let result = subject;
  // Loop until stable — brackets may precede Re: prefixes
  let prev = '';
  while (result !== prev) {
    prev = result;
    result = result
      .replace(/^\[.*?\]\s*/, '')
      .replace(/^(Re|Fwd?|Fw|AW|SV|VS|Ref|Rif|Antwort):\s*/gi, '');
  }
  return result.trim();
}
