// ===========================================
// CAPSULE — TESTS (Encoder, Decoder, Embedder, Extractor)
// ===========================================

import { describe, it, expect } from 'vitest';
import { encodeCapsule } from './encoder';
import { decodeCapsule } from './decoder';
import { embedCapsule } from './embedder';
import { extractCapsule } from './extractor';
import type { CapsulePayload } from './types';

function makeCapsule(overrides?: Partial<CapsulePayload>): CapsulePayload {
  return {
    spec: 'ai-instructions',
    version: '1.1',
    type: 'email_capsule',
    issued_at: Math.floor(Date.now() / 1000),
    issuer: '1701bespoke.com',
    thread: { id: 'thread-001', subject: 'Test Thread' },
    intent: 'information_request',
    actions: [{ action_type: 'reply_with_fields', fields: { name: 'test' } }],
    ...overrides,
  };
}

// ─── Encoder / Decoder ───

describe('encodeCapsule + decodeCapsule', () => {
  it('roundtrips a minimal capsule', () => {
    const capsule = makeCapsule();
    const encoded = encodeCapsule(capsule);
    expect(typeof encoded).toBe('string');
    expect(encoded.length).toBeGreaterThan(0);

    const decoded = decodeCapsule(encoded);
    expect(decoded.spec).toBe('ai-instructions');
    expect(decoded.version).toBe('1.1');
    expect(decoded.type).toBe('email_capsule');
    expect(decoded.issuer).toBe('1701bespoke.com');
    expect(decoded.thread.id).toBe('thread-001');
    expect(decoded.intent).toBe('information_request');
    expect(decoded.actions).toHaveLength(1);
  });

  it('roundtrips a capsule with all fields', () => {
    const capsule = makeCapsule({
      state: {
        status: 'in_progress',
        workflow_node: 'step-2',
        pending: [{ id: 'p1', description: 'Confirm order', owner: 'max@1701bespoke.com' }],
        data: { orderNumber: 'ORD-123', amount: 2500 },
        completed_checks: ['fabric_confirmed'],
      },
      constraints: {
        privacy: 'confidential',
        do_not_share: ['amount'],
        requires_human_approval: true,
        max_monetary_value: 5000,
      },
      links: [{ link_type: 'order', ref: 'ORD-123' }],
      checks: [
        { id: 'fabric_confirmed', type: 'confirmed', description: 'Fabric is available', satisfied: true },
        { id: 'payment_received', type: 'field_present', description: 'Payment received', satisfied: false },
      ],
      summary: 'Order confirmation pending payment',
    });

    const encoded = encodeCapsule(capsule);
    const decoded = decodeCapsule(encoded);

    expect(decoded.state?.status).toBe('in_progress');
    expect(decoded.state?.pending).toHaveLength(1);
    expect(decoded.constraints?.privacy).toBe('confidential');
    expect(decoded.links).toHaveLength(1);
    expect(decoded.checks).toHaveLength(2);
    expect(decoded.summary).toBe('Order confirmation pending payment');
  });

  it('produces base64url output (no +, /, or =)', () => {
    const encoded = encodeCapsule(makeCapsule());
    expect(encoded).not.toMatch(/[+/=]/);
  });

  it('CBOR is smaller than JSON equivalent', () => {
    const capsule = makeCapsule();
    const encoded = encodeCapsule(capsule);
    const jsonLen = Buffer.from(JSON.stringify(capsule)).toString('base64').length;
    // CBOR should be notably smaller
    expect(encoded.length).toBeLessThan(jsonLen);
  });
});

describe('decodeCapsule validation', () => {
  it('throws on invalid base64url', () => {
    expect(() => decodeCapsule('not-valid-cbor!!!')).toThrow('OAEM_101');
  });

  it('throws on valid CBOR but invalid structure', () => {
    // Encode a plain object without required fields
    const { encode } = require('cbor-x');
    const bytes = encode({ foo: 'bar' });
    const b64 = Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(() => decodeCapsule(b64)).toThrow('OAEM_102');
  });

  it('rejects wrong spec', () => {
    const { encode } = require('cbor-x');
    const bytes = encode({ ...makeCapsule(), spec: 'wrong' });
    const b64 = Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(() => decodeCapsule(b64)).toThrow('OAEM_102');
  });

  it('rejects wrong version', () => {
    const { encode } = require('cbor-x');
    const bytes = encode({ ...makeCapsule(), version: '2.0' });
    const b64 = Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(() => decodeCapsule(b64)).toThrow('OAEM_102');
  });

  it('rejects missing thread.id', () => {
    const { encode } = require('cbor-x');
    const bytes = encode({ ...makeCapsule(), thread: {} });
    const b64 = Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(() => decodeCapsule(b64)).toThrow('OAEM_102');
  });

  it('rejects invalid intent', () => {
    const { encode } = require('cbor-x');
    const bytes = encode({ ...makeCapsule(), intent: 'not_a_valid_intent' });
    const b64 = Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(() => decodeCapsule(b64)).toThrow('OAEM_102');
  });
});

// ─── Embedder ───

describe('embedCapsule', () => {
  it('inserts hidden div before </body>', () => {
    const html = '<html><body><p>Hello</p></body></html>';
    const result = embedCapsule(html, 'test-payload');
    expect(result).toContain('data-ai-instructions="v1"');
    expect(result).toContain('data-ai-payload="test-payload"');
    expect(result).toContain('display:none!important');
    expect(result.indexOf('data-ai-payload')).toBeLessThan(result.indexOf('</body>'));
  });

  it('appends div when no </body> tag', () => {
    const html = '<p>Hello</p>';
    const result = embedCapsule(html, 'test-payload');
    expect(result).toContain('data-ai-payload="test-payload"');
    expect(result).toMatch(/<p>Hello<\/p><div /);
  });

  it('includes compatibility aliases (data-context-*)', () => {
    const result = embedCapsule('<body></body>', 'payload');
    expect(result).toContain('data-context-instructions="v1"');
    expect(result).toContain('data-context-payload="payload"');
    expect(result).toContain('data-context-encoding="cbor+base64url"');
  });

  it('includes signature when provided', () => {
    const result = embedCapsule('<body></body>', 'payload', {
      signature: 'jws-signature-here',
    });
    expect(result).toContain('data-ai-signature="jws-signature-here"');
    expect(result).toContain('data-context-signature="jws-signature-here"');
  });

  it('includes issuedAt and hash when provided', () => {
    const result = embedCapsule('<body></body>', 'payload', {
      issuedAt: 1772688000,
      payloadHash: 'abc123',
    });
    expect(result).toContain('data-ai-issued-at="1772688000"');
    expect(result).toContain('data-ai-payload-sha256="abc123"');
  });

  it('escapes special characters in attributes', () => {
    const result = embedCapsule('<body></body>', 'pay"load&test');
    expect(result).toContain('data-ai-payload="pay&quot;load&amp;test"');
  });
});

// ─── Extractor ───

describe('extractCapsule', () => {
  it('finds capsule from data-ai-* attributes', () => {
    const capsule = makeCapsule();
    const encoded = encodeCapsule(capsule);
    const html = embedCapsule('<body></body>', encoded);

    const result = extractCapsule(html);
    expect(result.found).toBe(true);
    expect(result.raw).toBe(encoded);
    expect(result.payload).toBeDefined();
    expect(result.payload!.issuer).toBe('1701bespoke.com');
  });

  it('returns found=false when no capsule present', () => {
    const result = extractCapsule('<body><p>Hello</p></body>');
    expect(result.found).toBe(false);
  });

  it('extracts signature', () => {
    const html = embedCapsule('<body></body>', encodeCapsule(makeCapsule()), {
      signature: 'test-sig',
    });
    const result = extractCapsule(html);
    expect(result.signature).toBe('test-sig');
  });

  it('extracts issuedAt and payloadHash', () => {
    const html = embedCapsule('<body></body>', encodeCapsule(makeCapsule()), {
      issuedAt: 12345,
      payloadHash: 'hash-abc',
    });
    const result = extractCapsule(html);
    expect(result.issuedAt).toBe(12345);
    expect(result.payloadHash).toBe('hash-abc');
  });

  it('falls back to data-context-* attributes', () => {
    // Build a div that only has data-context-* attributes
    const encoded = encodeCapsule(makeCapsule());
    const html = `<body><div data-context-instructions="v1" data-context-payload="${encoded}" data-context-encoding="cbor+base64url"></div></body>`;
    const result = extractCapsule(html);
    expect(result.found).toBe(true);
    expect(result.payload).toBeDefined();
  });

  it('detects hash mismatch (integrity failure)', () => {
    const encoded = encodeCapsule(makeCapsule());
    const html = embedCapsule('<body></body>', encoded, {
      payloadHash: 'wrong-hash',
    });
    const result = extractCapsule(html);
    expect(result.found).toBe(true);
    expect(result.error).toContain('Hash mismatch');
    // Payload should NOT be decoded on integrity failure
    expect(result.payload).toBeUndefined();
  });

  it('handles malformed CBOR gracefully', () => {
    const html = `<body><div data-ai-instructions="v1" data-ai-payload="not-real-cbor" data-ai-encoding="cbor+base64url"></div></body>`;
    const result = extractCapsule(html);
    expect(result.found).toBe(true);
    expect(result.error).toBeDefined();
    expect(result.payload).toBeUndefined();
  });

  it('warns when multiple capsules found', () => {
    const encoded = encodeCapsule(makeCapsule());
    const div = `<div data-ai-instructions="v1" data-ai-payload="${encoded}" data-ai-encoding="cbor+base64url"></div>`;
    const html = `<body>${div}${div}</body>`;
    const result = extractCapsule(html);
    expect(result.found).toBe(true);
    expect(result.error).toContain('Multiple capsules');
  });

  it('end-to-end: encode → embed → extract → verify', () => {
    const original = makeCapsule({
      intent: 'proposal_offer',
      actions: [
        { action_type: 'reply_with_confirmation', priority: 'high' },
      ],
    });

    const encoded = encodeCapsule(original);
    const html = embedCapsule(
      '<html><body><h1>Business Email</h1></body></html>',
      encoded,
      { issuedAt: original.issued_at }
    );

    const result = extractCapsule(html);
    expect(result.found).toBe(true);
    expect(result.payload!.intent).toBe('proposal_offer');
    expect(result.payload!.actions[0].action_type).toBe('reply_with_confirmation');
    expect(result.issuedAt).toBe(original.issued_at);
  });
});
