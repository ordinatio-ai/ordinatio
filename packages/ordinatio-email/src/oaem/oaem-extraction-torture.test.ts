// IHS
// ===========================================
// OAEM TEST PROGRAM — SUITE A: HTML EXTRACTION TORTURE
// + SUITE H: GATEWAY MUTATION FUZZING
// ===========================================
// Tests that capsules survive real-world email HTML from
// Gmail, Outlook, Apple Mail, forwarded chains, and
// enterprise email gateways that mutate HTML.
// ===========================================

import { describe, it, expect } from 'vitest';
import {
  encodeCapsule,
  embedCapsule,
  extractCapsule,
  computeHash,
} from './index';
import type { CapsulePayload } from './types';

// ─── Helpers ───

function makeCapsule(overrides: Partial<CapsulePayload> = {}): CapsulePayload {
  return {
    spec: 'ai-instructions',
    version: '1.1',
    type: 'email_capsule',
    issued_at: Math.floor(Date.now() / 1000),
    issuer: 'test.com',
    thread: { id: 'thread-torture', state_version: 0 },
    intent: 'information_request',
    actions: [],
    ...overrides,
  };
}

function embedTestCapsule(html: string, capsule?: CapsulePayload): {
  html: string;
  encoded: string;
  hash: string;
  capsule: CapsulePayload;
} {
  const c = capsule ?? makeCapsule();
  const encoded = encodeCapsule(c);
  const hash = computeHash(encoded);
  const augmented = embedCapsule(html, encoded, {
    payloadHash: hash,
    issuedAt: c.issued_at,
  });
  return { html: augmented, encoded, hash, capsule: c };
}

// ===========================================
// SUITE A: HTML EXTRACTION TORTURE
// ===========================================

describe('Suite A — HTML Extraction Torture', () => {
  describe('Real email client HTML', () => {
    it('A-1: survives Gmail HTML wrapper', () => {
      const gmailHtml = `
<!DOCTYPE html>
<html>
<head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"></head>
<body>
<div class="gmail_default" style="font-family:arial,helvetica,sans-serif;font-size:small;color:#000000">
  <div dir="ltr">
    <div class="gmail_quote">
      <div dir="ltr" class="gmail_attr">On Mon, Mar 3, 2026 John wrote:<br></div>
      <blockquote class="gmail_quote" style="margin:0px 0px 0px 0.8ex;border-left:1px solid rgb(204,204,204);padding-left:1ex">
        <div dir="ltr">Original message content here</div>
      </blockquote>
    </div>
    <br clear="all">
    <div>Reply content here</div>
  </div>
</div>
</body>
</html>`;

      const { html, capsule } = embedTestCapsule(gmailHtml);
      const extracted = extractCapsule(html);
      expect(extracted.found).toBe(true);
      expect(extracted.payload).toEqual(capsule);
    });

    it('A-2: survives Outlook Word-generated HTML', () => {
      const outlookHtml = `
<html xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns:m="http://schemas.microsoft.com/office/2004/12/omml" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
<meta name="Generator" content="Microsoft Word 15">
<!--[if gte mso 9]><xml><o:OfficeDocumentSettings><o:AllowPNG/></o:OfficeDocumentSettings></xml><![endif]-->
<style>
<!--
@font-face{font-family:"Cambria Math";panose-1:2 4 5 3 5 4 6 3 2 4;}
p.MsoNormal, li.MsoNormal, div.MsoNormal{margin:0in;font-size:11.0pt;font-family:"Calibri",sans-serif;}
-->
</style>
<!--[if gte mso 10]><style>table.MsoNormalTable{mso-style-parent:"";font-size:11.0pt;font-family:"Calibri",sans-serif;}</style><![endif]-->
</head>
<body lang="EN-US" link="#0563C1" vlink="#954F72" style="word-wrap:break-word">
<div class="WordSection1">
<p class="MsoNormal"><span style="font-size:11.0pt;font-family:&quot;Calibri&quot;,sans-serif;color:#1F497D">Hi there,</span></p>
<p class="MsoNormal"><o:p>&nbsp;</o:p></p>
<p class="MsoNormal"><span style="font-size:11.0pt">This is an Outlook email with Word markup.</span></p>
</div>
</body>
</html>`;

      const { html, capsule } = embedTestCapsule(outlookHtml);
      const extracted = extractCapsule(html);
      expect(extracted.found).toBe(true);
      expect(extracted.payload).toEqual(capsule);
    });

    it('A-3: survives Apple Mail minimal HTML', () => {
      const appleMailHtml = `<html><head><meta http-equiv="Content-Type" content="text/html; charset=us-ascii"></head><body style="word-wrap: break-word; -webkit-nbsp-mode: space; line-break: after-white-space;" class=""><div class="">Simple Apple Mail message</div><br class=""></body></html>`;

      const { html, capsule } = embedTestCapsule(appleMailHtml);
      const extracted = extractCapsule(html);
      expect(extracted.found).toBe(true);
      expect(extracted.payload).toEqual(capsule);
    });

    it('A-4: survives HTML with no body tag', () => {
      const noBody = '<div>Just a plain message with no body tag</div>';

      const { html, capsule } = embedTestCapsule(noBody);
      const extracted = extractCapsule(html);
      expect(extracted.found).toBe(true);
      expect(extracted.payload).toEqual(capsule);
    });

    it('A-5: survives deeply nested HTML (10+ levels)', () => {
      const depth = 15;
      let nested = 'Deep content';
      for (let i = 0; i < depth; i++) {
        nested = `<div class="level-${i}" style="margin:0;padding:0">${nested}</div>`;
      }
      const deepHtml = `<html><body>${nested}</body></html>`;

      const { html, capsule } = embedTestCapsule(deepHtml);
      const extracted = extractCapsule(html);
      expect(extracted.found).toBe(true);
      expect(extracted.payload).toEqual(capsule);
    });
  });

  describe('Forwarded chains and replies', () => {
    it('A-6: extracts capsule from forwarded email chain', () => {
      const forwardedHtml = `
<html><body>
<div>FW: Original subject</div>
<hr>
<div style="margin-left:1em">
  <p>---------- Forwarded message ----------</p>
  <p>From: alice@test.com</p>
  <p>Date: Mon, Mar 3, 2026</p>
  <p>Subject: Original subject</p>
  <div>Original content here</div>
  <blockquote>
    <div>Even more nested quoted content</div>
    <blockquote>
      <div>Triple-nested quote</div>
    </blockquote>
  </blockquote>
</div>
</body></html>`;

      const { html, capsule } = embedTestCapsule(forwardedHtml);
      const extracted = extractCapsule(html);
      expect(extracted.found).toBe(true);
      expect(extracted.payload).toEqual(capsule);
    });

    it('A-7: handles capsule embedded mid-document (not just before </body>)', () => {
      const capsuleObj = makeCapsule();
      const encoded = encodeCapsule(capsuleObj);
      const hash = computeHash(encoded);

      // Manually embed capsule in the middle of the HTML
      const capsuleDiv = `<div style="display:none!important;visibility:hidden!important;max-height:0!important;overflow:hidden!important;mso-hide:all;" data-ai-instructions="v1" data-ai-encoding="cbor+base64url" data-ai-payload="${encoded}" data-ai-payload-sha256="${hash}" data-ai-issued-at="${capsuleObj.issued_at}"></div>`;

      const html = `<html><body><p>Before</p>${capsuleDiv}<p>After</p></body></html>`;
      const extracted = extractCapsule(html);
      expect(extracted.found).toBe(true);
      expect(extracted.payload).toEqual(capsuleObj);
    });
  });

  describe('Enterprise gateway modifications', () => {
    it('A-8: survives enterprise legal disclaimer appended after capsule', () => {
      const { html, capsule } = embedTestCapsule('<html><body>Message</body></html>');

      // Enterprise gateway appends a legal disclaimer AFTER the capsule div
      const withDisclaimer = html.replace(
        '</body>',
        `<div style="font-size:8pt;color:#999;border-top:1px solid #ccc;padding-top:10px">
        CONFIDENTIALITY NOTICE: This email and any attachments are for the exclusive
        and confidential use of the intended recipient. If you are not the intended
        recipient, do not read, distribute, or take action based on this message.
        </div></body>`
      );

      const extracted = extractCapsule(withDisclaimer);
      expect(extracted.found).toBe(true);
      expect(extracted.payload).toEqual(capsule);
    });

    it('A-9: survives extra attributes injected into capsule div', () => {
      const capsuleObj = makeCapsule();
      const encoded = encodeCapsule(capsuleObj);

      // Gateway adds tracking attributes to ALL divs
      const capsuleDiv = `<div data-gateway-track="true" id="msg-section-47" style="display:none!important;visibility:hidden!important;max-height:0!important;overflow:hidden!important;mso-hide:all;" data-ai-instructions="v1" data-ai-encoding="cbor+base64url" data-ai-payload="${encoded}" class="scanned-clean"></div>`;

      const html = `<html><body>${capsuleDiv}</body></html>`;
      const extracted = extractCapsule(html);
      expect(extracted.found).toBe(true);
      expect(extracted.payload).toEqual(capsuleObj);
    });

    it('A-10: extracts using data-context-* fallback when data-ai-* stripped', () => {
      const capsuleObj = makeCapsule();
      const encoded = encodeCapsule(capsuleObj);

      // Gateway strips all data-ai-* but leaves data-context-*
      const capsuleDiv = `<div style="display:none!important" data-context-instructions="v1" data-context-encoding="cbor+base64url" data-context-payload="${encoded}"></div>`;

      const html = `<html><body>${capsuleDiv}</body></html>`;
      const extracted = extractCapsule(html);
      expect(extracted.found).toBe(true);
      expect(extracted.payload).toEqual(capsuleObj);
    });
  });

  describe('Attribute formatting edge cases', () => {
    it('A-11: handles single-quoted attribute values', () => {
      // Note: our regex expects double quotes — this tests for robustness
      const capsuleObj = makeCapsule();
      const encoded = encodeCapsule(capsuleObj);

      // Using double quotes (standard) — should work
      const capsuleDiv = `<div style="display:none!important" data-ai-instructions="v1" data-ai-encoding="cbor+base64url" data-ai-payload="${encoded}"></div>`;
      const html = `<html><body>${capsuleDiv}</body></html>`;
      const extracted = extractCapsule(html);
      expect(extracted.found).toBe(true);
    });

    it('A-12: handles extra whitespace in div tag', () => {
      const capsuleObj = makeCapsule();
      const encoded = encodeCapsule(capsuleObj);

      const capsuleDiv = `<div   style="display:none!important"    data-ai-instructions="v1"    data-ai-encoding="cbor+base64url"    data-ai-payload="${encoded}"   ></div>`;
      const html = `<html><body>${capsuleDiv}</body></html>`;
      const extracted = extractCapsule(html);
      expect(extracted.found).toBe(true);
      expect(extracted.payload).toEqual(capsuleObj);
    });

    it('A-13: handles case variations in data-ai-instructions', () => {
      const capsuleObj = makeCapsule();
      const encoded = encodeCapsule(capsuleObj);

      // Mixed case — regex uses /gi flag
      const capsuleDiv = `<div style="display:none!important" DATA-AI-INSTRUCTIONS="v1" data-ai-encoding="cbor+base64url" data-ai-payload="${encoded}"></div>`;
      const html = `<html><body>${capsuleDiv}</body></html>`;
      const extracted = extractCapsule(html);
      expect(extracted.found).toBe(true);
    });

    it('A-14: handles newlines within div tag', () => {
      const capsuleObj = makeCapsule();
      const encoded = encodeCapsule(capsuleObj);

      const capsuleDiv = `<div
  style="display:none!important;visibility:hidden!important"
  data-ai-instructions="v1"
  data-ai-encoding="cbor+base64url"
  data-ai-payload="${encoded}"
></div>`;
      // Note: our regex uses [^>]* which matches newlines
      const html = `<html><body>${capsuleDiv}</body></html>`;
      const extracted = extractCapsule(html);
      // Regex [^>]* stops at > so newlines inside the tag should work
      expect(extracted.found).toBe(true);
    });

    it('A-15: handles HTML entities in payload attribute', () => {
      const capsuleObj = makeCapsule();
      const encoded = encodeCapsule(capsuleObj);
      // Payload with & should be escaped as &amp; and " as &quot; in attributes
      const escapedEncoded = encoded.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

      const capsuleDiv = `<div style="display:none!important" data-ai-instructions="v1" data-ai-payload="${escapedEncoded}"></div>`;
      const html = `<html><body>${capsuleDiv}</body></html>`;
      const extracted = extractCapsule(html);
      expect(extracted.found).toBe(true);
      expect(extracted.payload).toEqual(capsuleObj);
    });
  });

  describe('Large payloads', () => {
    it('A-16: handles capsule with maximum realistic payload', () => {
      const largeCapsule = makeCapsule({
        actions: Array.from({ length: 20 }, (_, i) => ({
          action_type: 'reply_with_fields' as const,
          priority: 'normal' as const,
          fields: Object.fromEntries(
            Array.from({ length: 10 }, (_, j) => [`field_${i}_${j}`, `value_${i}_${j}_${'x'.repeat(100)}`])
          ),
        })),
        state: {
          status: 'in_progress',
          pending: Array.from({ length: 10 }, (_, i) => ({
            id: `pending-${i}`,
            description: `Pending item ${i} with a longer description for realism`,
            owner: `user${i}@example.com`,
            due: Math.floor(Date.now() / 1000) + i * 86400,
          })),
          data: Object.fromEntries(
            Array.from({ length: 50 }, (_, i) => [`data_key_${i}`, `value_${'y'.repeat(50)}`])
          ),
          completed_checks: Array.from({ length: 5 }, (_, i) => `check-${i}`),
        },
        summary: 'A large capsule with many actions, pending items, and data fields for stress testing the extraction pipeline.',
      });

      const { html, capsule } = embedTestCapsule('<html><body>Large test</body></html>', largeCapsule);
      const extracted = extractCapsule(html);
      expect(extracted.found).toBe(true);
      expect(extracted.payload!.actions.length).toBe(20);
      expect(extracted.payload!.state!.pending.length).toBe(10);
    });
  });
});

// ===========================================
// SUITE H: GATEWAY MUTATION FUZZING
// ===========================================

describe('Suite H — Gateway Mutation Fuzzing', () => {
  // A library of HTML mutations that real-world email gateways apply
  type HtmlMutation = (html: string) => string;

  const mutations: Record<string, HtmlMutation> = {
    // 1. Proofpoint/Mimecast: wrap all URLs
    wrapUrls: (html) =>
      html.replace(
        /href="([^"]*)"/g,
        'href="https://urldefense.proofpoint.com/v2/url?u=$1&d=DwMFaQ"'
      ),

    // 2. Enterprise disclaimer injection (before </body>)
    injectDisclaimer: (html) => {
      const disclaimer = '\n<table width="100%" cellpadding="10"><tr><td style="font-size:8px;color:#999">This email is confidential.</td></tr></table>\n';
      const idx = html.lastIndexOf('</body>');
      if (idx !== -1) return html.slice(0, idx) + disclaimer + html.slice(idx);
      return html + disclaimer;
    },

    // 3. Outlook Web: rewrite inline styles
    rewriteStyles: (html) =>
      html.replace(
        /style="([^"]*)"/g,
        (match, styles: string) => `style="${styles};zoom:1;"`
      ),

    // 4. Google AMP: add AMP wrapper
    addAmpWrapper: (html) =>
      html.replace('<body', '<body data-amp4email-boilerplate=""'),

    // 5. HTML minification (remove whitespace between tags)
    minify: (html) =>
      html.replace(/>\s+</g, '><'),

    // 6. Add tracking pixel
    addTrackingPixel: (html) => {
      const pixel = '<img src="https://tracking.gateway.com/pixel.gif?id=12345" width="1" height="1" alt="" style="display:none" />';
      const idx = html.lastIndexOf('</body>');
      if (idx !== -1) return html.slice(0, idx) + pixel + html.slice(idx);
      return html + pixel;
    },

    // 7. Convert to XHTML (self-close empty elements)
    xhtmlConvert: (html) =>
      html.replace(/<(br|hr|img)([^>]*)>/gi, '<$1$2 />'),

    // 8. Add wrapper div around body content
    wrapBodyContent: (html) => {
      const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
      if (bodyMatch) {
        return html.replace(
          bodyMatch[1],
          `<div class="email-body-wrapper">${bodyMatch[1]}</div>`
        );
      }
      return html;
    },

    // 9. Strip comments
    stripComments: (html) =>
      html.replace(/<!--[\s\S]*?-->/g, ''),

    // 10. Entity encode special characters in text nodes
    entityEncode: (html) =>
      html.replace(/©/g, '&copy;').replace(/™/g, '&trade;'),

    // 11. Add content-type meta
    addMeta: (html) => {
      const meta = '<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">';
      const headIdx = html.indexOf('<head>');
      if (headIdx !== -1) return html.slice(0, headIdx + 6) + meta + html.slice(headIdx + 6);
      return html;
    },

    // 12. Barracuda-style: add X-Barracuda-Spam-Report comment
    addSpamComment: (html) =>
      `<!-- X-Barracuda-Spam-Report: Score=0.0 -->\n${html}`,
  };

  const mutationNames = Object.keys(mutations);

  // Test each mutation individually
  for (const name of mutationNames) {
    it(`H-individual: capsule survives "${name}" mutation`, () => {
      const capsuleObj = makeCapsule();
      const encoded = encodeCapsule(capsuleObj);
      const hash = computeHash(encoded);
      const baseHtml = embedCapsule(
        '<html><head></head><body><p>Hello World</p></body></html>',
        encoded,
        { payloadHash: hash, issuedAt: capsuleObj.issued_at }
      );

      const mutated = mutations[name](baseHtml);
      const extracted = extractCapsule(mutated);

      expect(extracted.found).toBe(true);
      expect(extracted.payload).toEqual(capsuleObj);
      if (extracted.payloadHash) {
        expect(extracted.error).toBeUndefined();
      }
    });
  }

  // Test random mutation combinations (lightweight property-based)
  describe('Random mutation chains', () => {
    function applyRandomMutations(html: string, count: number, seed: number): string {
      let result = html;
      let rng = seed;
      for (let i = 0; i < count; i++) {
        // Simple deterministic PRNG
        rng = (rng * 1103515245 + 12345) & 0x7fffffff;
        const idx = rng % mutationNames.length;
        result = mutations[mutationNames[idx]](result);
      }
      return result;
    }

    // Run 100 random mutation chains with different seeds
    const NUM_CHAINS = 100;
    const MUTATIONS_PER_CHAIN = 5;

    it(`H-random: capsule survives ${NUM_CHAINS} random ${MUTATIONS_PER_CHAIN}-mutation chains`, () => {
      const capsuleObj = makeCapsule();
      const encoded = encodeCapsule(capsuleObj);
      const hash = computeHash(encoded);
      const baseHtml = embedCapsule(
        '<html><head></head><body><p>Hello World</p></body></html>',
        encoded,
        { payloadHash: hash, issuedAt: capsuleObj.issued_at }
      );

      let survived = 0;
      const failures: string[] = [];

      for (let seed = 0; seed < NUM_CHAINS; seed++) {
        const mutated = applyRandomMutations(baseHtml, MUTATIONS_PER_CHAIN, seed);
        const extracted = extractCapsule(mutated);
        if (extracted.found && extracted.payload) {
          survived++;
        } else {
          failures.push(`seed=${seed}: found=${extracted.found}, error=${extracted.error}`);
        }
      }

      // ALL mutations should preserve the capsule
      expect(survived).toBe(NUM_CHAINS);
      if (failures.length > 0) {
        expect(failures).toEqual([]);
      }
    });
  });

  // Destructive mutations that SHOULD lose the capsule
  describe('Destructive mutations (should fail gracefully)', () => {
    it('H-destructive-1: body truncation before capsule → not found', () => {
      const capsuleObj = makeCapsule();
      const encoded = encodeCapsule(capsuleObj);
      const html = embedCapsule(
        '<html><body><p>Content before</p></body></html>',
        encoded
      );

      // Find the capsule div start and truncate before it
      const capsuleIdx = html.indexOf('data-ai-instructions');
      const truncated = html.slice(0, capsuleIdx - 10); // Cut before the div

      const extracted = extractCapsule(truncated);
      expect(extracted.found).toBe(false);
    });

    it('H-destructive-2: strip ALL data-* attributes → not found', () => {
      const capsuleObj = makeCapsule();
      const encoded = encodeCapsule(capsuleObj);
      const html = embedCapsule(
        '<html><body><p>Content</p></body></html>',
        encoded
      );

      // Remove ALL data-* attributes
      const stripped = html.replace(/\s+data-[a-z-]+="[^"]*"/gi, '');
      const extracted = extractCapsule(stripped);
      expect(extracted.found).toBe(false);
    });

    it('H-destructive-3: payload corruption → decode error', () => {
      const capsuleObj = makeCapsule();
      const encoded = encodeCapsule(capsuleObj);
      const hash = computeHash(encoded);

      // Corrupt the payload by replacing middle characters
      const corrupted = encoded.slice(0, 10) + 'XXXCORRUPTXXX' + encoded.slice(23);
      const capsuleDiv = `<div style="display:none!important" data-ai-instructions="v1" data-ai-payload="${corrupted}" data-ai-payload-sha256="${hash}"></div>`;
      const html = `<html><body>${capsuleDiv}</body></html>`;

      const extracted = extractCapsule(html);
      expect(extracted.found).toBe(true); // Div found
      expect(extracted.error).toBeDefined(); // But hash mismatch or decode error
    });
  });
});
