// ===========================================
// GMAIL MIME — MULTIPART MESSAGE BUILDER
// ===========================================
// Constructs RFC 2822 multipart/mixed MIME
// messages with HTML body + base64 attachments.
// Pure function, easy to test.
// ===========================================

export interface MimeAttachment {
  filename: string;
  mimeType: string;
  content: Buffer;
}

export interface MimeMessageOptions {
  from: string;
  to: string;
  subject: string;
  bodyHtml: string;
  attachments?: MimeAttachment[];
  inReplyTo?: string;
  references?: string;
  threadId?: string;
}

export function buildMimeMessage(options: MimeMessageOptions): string {
  const { from, to, subject, bodyHtml, attachments, inReplyTo, references } = options;
  const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  const hasAttachments = attachments && attachments.length > 0;

  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeMimeHeader(subject)}`,
    'MIME-Version: 1.0',
  ];

  if (inReplyTo) headers.push(`In-Reply-To: ${inReplyTo}`);
  if (references) headers.push(`References: ${references}`);

  if (!hasAttachments) {
    headers.push('Content-Type: text/html; charset=utf-8');
    headers.push('Content-Transfer-Encoding: base64');
    headers.push('');

    const body = Buffer.from(bodyHtml, 'utf-8').toString('base64');
    const raw = [...headers, body].join('\r\n');
    return toBase64Url(raw);
  }

  headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
  headers.push('');

  const parts: string[] = [...headers];

  parts.push(`--${boundary}`);
  parts.push('Content-Type: text/html; charset=utf-8');
  parts.push('Content-Transfer-Encoding: base64');
  parts.push('');
  parts.push(Buffer.from(bodyHtml, 'utf-8').toString('base64'));
  parts.push('');

  for (const att of attachments!) {
    parts.push(`--${boundary}`);
    parts.push(`Content-Type: ${att.mimeType}; name="${encodeMimeHeader(att.filename)}"`);
    parts.push(`Content-Disposition: attachment; filename="${encodeMimeHeader(att.filename)}"`);
    parts.push('Content-Transfer-Encoding: base64');
    parts.push('');
    parts.push(att.content.toString('base64'));
    parts.push('');
  }

  parts.push(`--${boundary}--`);

  return toBase64Url(parts.join('\r\n'));
}

function encodeMimeHeader(text: string): string {
  if (/^[\x20-\x7E]*$/.test(text)) return text;
  const encoded = Buffer.from(text, 'utf-8').toString('base64');
  return `=?UTF-8?B?${encoded}?=`;
}

function toBase64Url(raw: string): string {
  return Buffer.from(raw)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
