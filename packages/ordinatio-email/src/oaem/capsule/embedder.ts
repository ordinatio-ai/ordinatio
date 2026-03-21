// ===========================================
// CAPSULE EMBEDDER — Inject Hidden Div into HTML
// ===========================================

/**
 * Embed an OAEM capsule into an HTML email body as a hidden div.
 * The div is invisible to human readers but machine-readable.
 *
 * Uses both data-ai-* and data-context-* attributes for
 * compatibility with enterprise email gateways that may strip
 * unknown attribute prefixes.
 */
export function embedCapsule(
  html: string,
  capsule: string,
  options?: {
    signature?: string;
    issuedAt?: number;
    payloadHash?: string;
  }
): string {
  const attrs: string[] = [
    'style="display:none!important;visibility:hidden!important;max-height:0!important;overflow:hidden!important;mso-hide:all;"',
    'data-ai-instructions="v1"',
    'data-context-instructions="v1"',
    'data-ai-encoding="cbor+base64url"',
    'data-context-encoding="cbor+base64url"',
    `data-ai-payload="${escapeAttr(capsule)}"`,
    `data-context-payload="${escapeAttr(capsule)}"`,
  ];

  if (options?.issuedAt != null) {
    attrs.push(`data-ai-issued-at="${options.issuedAt}"`);
    attrs.push(`data-context-issued-at="${options.issuedAt}"`);
  }

  if (options?.payloadHash) {
    attrs.push(`data-ai-payload-sha256="${escapeAttr(options.payloadHash)}"`);
    attrs.push(`data-context-payload-sha256="${escapeAttr(options.payloadHash)}"`);
  }

  if (options?.signature) {
    attrs.push(`data-ai-signature="${escapeAttr(options.signature)}"`);
    attrs.push(`data-context-signature="${escapeAttr(options.signature)}"`);
  }

  const div = `<div ${attrs.join(' ')}></div>`;

  // Insert before closing </body> if present, otherwise append
  const bodyCloseIdx = html.lastIndexOf('</body>');
  if (bodyCloseIdx !== -1) {
    return html.slice(0, bodyCloseIdx) + div + html.slice(bodyCloseIdx);
  }

  return html + div;
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}
