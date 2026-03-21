// ===========================================
// CAPSULE EXTRACTOR — Parse Hidden Div from HTML
// ===========================================

import type { ExtractedCapsule, CapsulePayload } from './types';
import { decodeCapsule } from './decoder';
import { computeHash } from '../signing/hash';

/**
 * Extract an OAEM capsule from incoming email HTML.
 * Searches for both data-ai-* and data-context-* attributes.
 */
export function extractCapsule(html: string): ExtractedCapsule {
  // Find all candidate divs with OAEM markers
  const divPattern = /<div\s[^>]*data-(?:ai|context)-instructions="v1"[^>]*>/gi;
  const matches = [...html.matchAll(divPattern)];

  if (matches.length === 0) {
    return { found: false };
  }

  // Use the first match (warn if multiple)
  const divTag = matches[0][0];
  const hasMultiple = matches.length > 1;

  // Extract attributes — try data-ai-* first, fall back to data-context-*
  const raw = extractAttr(divTag, 'payload');
  if (!raw) {
    return { found: false, error: 'Capsule div found but no payload attribute' };
  }

  const signature = extractAttr(divTag, 'signature') || undefined;
  const issuedAtStr = extractAttr(divTag, 'issued-at');
  const issuedAt = issuedAtStr ? parseInt(issuedAtStr, 10) : undefined;
  const payloadHash = extractAttr(divTag, 'payload-sha256') || undefined;

  // Verify hash integrity if provided
  if (payloadHash) {
    const computed = computeHash(raw);
    if (computed !== payloadHash) {
      return {
        found: true,
        raw,
        signature,
        issuedAt,
        payloadHash,
        error: `Hash mismatch: expected ${payloadHash}, got ${computed}`,
      };
    }
  }

  // Decode the CBOR payload
  let payload: CapsulePayload | undefined;
  let decodeError: string | undefined;
  try {
    payload = decodeCapsule(raw);
  } catch (err) {
    decodeError = err instanceof Error ? err.message : String(err);
  }

  return {
    found: true,
    raw,
    signature,
    issuedAt,
    payloadHash,
    payload,
    error: hasMultiple
      ? `Multiple capsules found (using first). ${decodeError || ''}`
      : decodeError,
  };
}

/**
 * Extract an attribute value from a div tag string.
 * Tries data-ai-{name} first, then data-context-{name}.
 */
function extractAttr(divTag: string, name: string): string | null {
  // Try data-ai-{name}
  const aiPattern = new RegExp(`data-ai-${name}="([^"]*)"`, 'i');
  const aiMatch = divTag.match(aiPattern);
  if (aiMatch) return unescapeAttr(aiMatch[1]);

  // Fall back to data-context-{name}
  const ctxPattern = new RegExp(`data-context-${name}="([^"]*)"`, 'i');
  const ctxMatch = divTag.match(ctxPattern);
  if (ctxMatch) return unescapeAttr(ctxMatch[1]);

  return null;
}

function unescapeAttr(value: string): string {
  return value.replace(/&quot;/g, '"').replace(/&amp;/g, '&');
}
