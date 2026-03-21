// ===========================================
// EMAIL PROVIDER FACTORY
// ===========================================

import type { EmailProvider } from './types';
import { GmailProvider } from './gmail';
import { OutlookProvider } from './outlook';
import { ImapSmtpProvider } from './imap-smtp';

export type ProviderType = 'gmail' | 'outlook' | 'imap';

const providers: Record<ProviderType, () => EmailProvider> = {
  gmail: () => new GmailProvider(),
  outlook: () => new OutlookProvider(),
  imap: () => new ImapSmtpProvider(),
};

export function getProvider(type: ProviderType): EmailProvider {
  const factory = providers[type];
  if (!factory) {
    throw new Error(`Unknown email provider: ${type}`);
  }
  return factory();
}

export function registerProvider(type: ProviderType, factory: () => EmailProvider): void {
  providers[type] = factory;
}

export function isProviderSupported(type: string): type is ProviderType {
  return type in providers;
}

// Re-export types
export * from './types';
export { GmailProvider } from './gmail';
export { OutlookProvider } from './outlook';
export { ImapSmtpProvider } from './imap-smtp';
export { buildMimeMessage } from './gmail-mime';
export type { MimeAttachment, MimeMessageOptions } from './gmail-mime';
export { withRetry, isGoogleApiRetryable, RetryExhaustedError, TimeoutError } from './retry';
export type { RetryOptions } from './retry';
