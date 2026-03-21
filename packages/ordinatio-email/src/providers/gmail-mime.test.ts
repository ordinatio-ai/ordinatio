// ===========================================
// GMAIL MIME MESSAGE BUILDER — TESTS
// ===========================================

import { describe, it, expect } from 'vitest';
import { buildMimeMessage } from './gmail-mime';
import type { MimeMessageOptions } from './gmail-mime';

function decodeBase64Url(encoded: string): string {
  let base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4;
  if (pad === 2) base64 += '==';
  else if (pad === 3) base64 += '=';
  return Buffer.from(base64, 'base64').toString('utf-8');
}

describe('buildMimeMessage', () => {
  const baseOptions: MimeMessageOptions = {
    from: 'sender@example.com',
    to: 'recipient@example.com',
    subject: 'Test Subject',
    bodyHtml: '<p>Hello, world!</p>',
  };

  describe('simple message (no attachments)', () => {
    it('contains From header', () => {
      const raw = decodeBase64Url(buildMimeMessage(baseOptions));
      expect(raw).toContain('From: sender@example.com');
    });

    it('contains To header', () => {
      const raw = decodeBase64Url(buildMimeMessage(baseOptions));
      expect(raw).toContain('To: recipient@example.com');
    });

    it('contains Subject header', () => {
      const raw = decodeBase64Url(buildMimeMessage(baseOptions));
      expect(raw).toContain('Subject: Test Subject');
    });

    it('sets Content-Type to text/html', () => {
      const raw = decodeBase64Url(buildMimeMessage(baseOptions));
      expect(raw).toContain('Content-Type: text/html; charset=utf-8');
    });

    it('includes MIME-Version header', () => {
      const raw = decodeBase64Url(buildMimeMessage(baseOptions));
      expect(raw).toContain('MIME-Version: 1.0');
    });

    it('includes base64-encoded HTML body', () => {
      const raw = decodeBase64Url(buildMimeMessage(baseOptions));
      const expectedBody = Buffer.from('<p>Hello, world!</p>', 'utf-8').toString('base64');
      expect(raw).toContain(expectedBody);
    });

    it('does NOT use multipart/mixed', () => {
      const raw = decodeBase64Url(buildMimeMessage(baseOptions));
      expect(raw).not.toContain('multipart/mixed');
    });
  });

  describe('message with attachments', () => {
    it('uses multipart/mixed Content-Type with boundary', () => {
      const raw = decodeBase64Url(buildMimeMessage({
        ...baseOptions,
        attachments: [{ filename: 'test.pdf', mimeType: 'application/pdf', content: Buffer.from('fake') }],
      }));
      expect(raw).toMatch(/Content-Type: multipart\/mixed; boundary=".*"/);
    });

    it('includes attachment Content-Disposition header', () => {
      const raw = decodeBase64Url(buildMimeMessage({
        ...baseOptions,
        attachments: [{ filename: 'report.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', content: Buffer.from('spreadsheet') }],
      }));
      expect(raw).toContain('Content-Disposition: attachment; filename="report.xlsx"');
    });

    it('includes attachment Content-Type with filename', () => {
      const raw = decodeBase64Url(buildMimeMessage({
        ...baseOptions,
        attachments: [{ filename: 'image.png', mimeType: 'image/png', content: Buffer.from('png') }],
      }));
      expect(raw).toContain('Content-Type: image/png; name="image.png"');
    });

    it('includes base64-encoded attachment content', () => {
      const content = Buffer.from('attachment-data-here');
      const raw = decodeBase64Url(buildMimeMessage({
        ...baseOptions,
        attachments: [{ filename: 'data.bin', mimeType: 'application/octet-stream', content }],
      }));
      expect(raw).toContain(content.toString('base64'));
    });

    it('includes closing boundary marker', () => {
      const raw = decodeBase64Url(buildMimeMessage({
        ...baseOptions,
        attachments: [{ filename: 'file.txt', mimeType: 'text/plain', content: Buffer.from('text') }],
      }));
      expect(raw).toMatch(/^--.*--$/m);
    });

    it('handles multiple attachments', () => {
      const raw = decodeBase64Url(buildMimeMessage({
        ...baseOptions,
        attachments: [
          { filename: 'a.pdf', mimeType: 'application/pdf', content: Buffer.from('pdf') },
          { filename: 'b.png', mimeType: 'image/png', content: Buffer.from('png') },
        ],
      }));
      expect(raw).toContain('filename="a.pdf"');
      expect(raw).toContain('filename="b.png"');
    });

    it('still includes HTML body in multipart message', () => {
      const raw = decodeBase64Url(buildMimeMessage({
        ...baseOptions,
        bodyHtml: '<h1>With attachment</h1>',
        attachments: [{ filename: 'f.txt', mimeType: 'text/plain', content: Buffer.from('x') }],
      }));
      expect(raw).toContain(Buffer.from('<h1>With attachment</h1>', 'utf-8').toString('base64'));
    });
  });

  describe('non-ASCII subject (RFC 2047)', () => {
    it('passes through ASCII-only subjects unchanged', () => {
      const raw = decodeBase64Url(buildMimeMessage({ ...baseOptions, subject: 'Hello World' }));
      expect(raw).toContain('Subject: Hello World');
    });

    it('encodes subject with emoji', () => {
      const subject = 'Order Confirmed \u2705';
      const raw = decodeBase64Url(buildMimeMessage({ ...baseOptions, subject }));
      const expected = Buffer.from(subject, 'utf-8').toString('base64');
      expect(raw).toContain(`Subject: =?UTF-8?B?${expected}?=`);
    });

    it('encodes subject with Japanese characters', () => {
      const subject = '\u6CE8\u6587\u78BA\u8A8D';
      const raw = decodeBase64Url(buildMimeMessage({ ...baseOptions, subject }));
      const expected = Buffer.from(subject, 'utf-8').toString('base64');
      expect(raw).toContain(`Subject: =?UTF-8?B?${expected}?=`);
    });

    it('encodes subject with accented characters', () => {
      const subject = 'R\u00e9sum\u00e9 f\u00fcr Herr M\u00fcller';
      const raw = decodeBase64Url(buildMimeMessage({ ...baseOptions, subject }));
      const expected = Buffer.from(subject, 'utf-8').toString('base64');
      expect(raw).toContain(`Subject: =?UTF-8?B?${expected}?=`);
    });
  });

  describe('reply headers', () => {
    it('includes In-Reply-To when provided', () => {
      const msgId = '<original@mail.gmail.com>';
      const raw = decodeBase64Url(buildMimeMessage({ ...baseOptions, inReplyTo: msgId }));
      expect(raw).toContain(`In-Reply-To: ${msgId}`);
    });

    it('includes References when provided', () => {
      const refs = '<msg1@mail.gmail.com> <msg2@mail.gmail.com>';
      const raw = decodeBase64Url(buildMimeMessage({ ...baseOptions, references: refs }));
      expect(raw).toContain(`References: ${refs}`);
    });

    it('omits reply headers when not provided', () => {
      const raw = decodeBase64Url(buildMimeMessage(baseOptions));
      expect(raw).not.toContain('In-Reply-To:');
      expect(raw).not.toContain('References:');
    });
  });

  describe('base64url output format', () => {
    it('only contains base64url-safe characters', () => {
      const result = buildMimeMessage({
        ...baseOptions,
        subject: 'Complex: \u00e9\u00e8\u00ea \u2705 test',
        attachments: [{ filename: 'a.bin', mimeType: 'application/octet-stream', content: Buffer.alloc(256, 0xff) }],
      });
      expect(result).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('can be decoded back to valid MIME', () => {
      const decoded = decodeBase64Url(buildMimeMessage(baseOptions));
      expect(decoded).toContain('From:');
      expect(decoded).toContain('To:');
      expect(decoded).toContain('Subject:');
    });
  });
});
