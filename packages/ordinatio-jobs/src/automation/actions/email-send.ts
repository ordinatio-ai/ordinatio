// ===========================================
// SEND EMAIL ACTIONS
// ===========================================
// Handlers for sending emails via automation.
// Includes send, reply, and forward actions.
// Uses dependency injection for SaaS extraction readiness.
// ===========================================
// DEPENDS ON: registry, condition-evaluator, default-deps, types
// USED BY: actions/email.ts
// ===========================================

import { resolveTemplateVars } from '../condition-evaluator';
import {
  completedResult,
  failedResult,
  type ActionResult,
  type ExecutionContext,
} from './registry';
import type { ActionDependencies, EmailAccountData, IEmailProvider } from './types';
import { getDependencies } from './default-deps';

/**
 * Refresh token if needed and return valid access token
 */
export async function getValidAccessToken(
  account: EmailAccountData,
  emailProvider: IEmailProvider,
  deps: Required<ActionDependencies>
): Promise<string> {
  if (account.tokenExpiresAt && new Date(account.tokenExpiresAt) < new Date()) {
    if (!account.refreshToken) {
      throw new Error('Token expired and no refresh token available');
    }
    const newTokens = await emailProvider.refreshAccessToken(account.refreshToken);

    await deps.emailService.updateAccountTokens(
      account.id,
      newTokens.accessToken,
      newTokens.expiresAt
    );

    return newTokens.accessToken;
  }
  return account.accessToken;
}

/**
 * SEND_EMAIL action
 * Config options:
 *   - to (required): Recipient email, supports {{template}} vars
 *   - subject (optional): Email subject, supports {{template}} vars
 *   - body/bodyHtml (optional): Email body HTML, supports {{template}} vars
 */
export async function executeSendEmail(
  actionId: string,
  config: Record<string, unknown>,
  context: ExecutionContext,
  customDeps?: ActionDependencies
): Promise<ActionResult> {
  const deps = getDependencies(customDeps);

  const to = resolveTemplateVars(String(config.to ?? ''), context.data);
  const subject = resolveTemplateVars(String(config.subject ?? ''), context.data);
  const bodyHtml = resolveTemplateVars(
    String(config.body ?? config.bodyHtml ?? ''),
    context.data
  );

  if (!to) {
    return failedResult(actionId, 'SEND_EMAIL', 'No recipient (to) specified');
  }

  const account = await deps.emailService.getActiveEmailAccount();

  if (!account) {
    return failedResult(actionId, 'SEND_EMAIL', 'No active email account configured');
  }

  try {
    const accessToken = await getValidAccessToken(account, deps.emailProvider, deps);

    await deps.emailProvider.sendEmail(accessToken, { to, subject, bodyHtml });

    return completedResult(actionId, 'SEND_EMAIL', { to, subject, sent: true });
  } catch (err) {
    return failedResult(
      actionId,
      'SEND_EMAIL',
      err instanceof Error ? err.message : 'Failed to send email'
    );
  }
}

/**
 * REPLY_TO_EMAIL action
 * Config options:
 *   - emailId (optional): Email ID, falls back to context.data.emailId
 *   - body/bodyHtml (optional): Reply body HTML, supports {{template}} vars
 */
export async function executeReplyToEmail(
  actionId: string,
  config: Record<string, unknown>,
  context: ExecutionContext,
  customDeps?: ActionDependencies
): Promise<ActionResult> {
  const deps = getDependencies(customDeps);

  const emailId = (config.emailId ?? context.data.emailId) as string;
  const bodyHtml = resolveTemplateVars(
    String(config.body ?? config.bodyHtml ?? ''),
    context.data
  );

  if (!emailId) {
    return failedResult(actionId, 'REPLY_TO_EMAIL', 'No emailId provided');
  }

  const email = await deps.emailService.findEmailById(emailId);

  if (!email) {
    return failedResult(actionId, 'REPLY_TO_EMAIL', `Email not found: ${emailId}`);
  }

  try {
    const accessToken = await getValidAccessToken(email.account, deps.emailProvider, deps);

    await deps.emailProvider.sendReply(accessToken, {
      inReplyTo: email.providerId,
      bodyHtml,
      threadId: email.threadId ?? undefined,
    });

    await deps.emailService.archiveEmail(emailId, 'automation');

    return completedResult(actionId, 'REPLY_TO_EMAIL', {
      emailId,
      replied: true,
      archived: true,
    });
  } catch (err) {
    return failedResult(
      actionId,
      'REPLY_TO_EMAIL',
      err instanceof Error ? err.message : 'Failed to reply to email'
    );
  }
}

/**
 * FORWARD_EMAIL action
 * Config options:
 *   - emailId (optional): Email ID, falls back to context.data.emailId
 *   - to (required): Recipient email, supports {{template}} vars
 *   - message (optional): Additional message to prepend, supports {{template}} vars
 */
export async function executeForwardEmail(
  actionId: string,
  config: Record<string, unknown>,
  context: ExecutionContext,
  customDeps?: ActionDependencies
): Promise<ActionResult> {
  const deps = getDependencies(customDeps);

  const emailId = (config.emailId ?? context.data.emailId) as string;
  const to = resolveTemplateVars(String(config.to ?? ''), context.data);
  const additionalMessage = config.message
    ? resolveTemplateVars(String(config.message), context.data)
    : undefined;

  if (!emailId) {
    return failedResult(actionId, 'FORWARD_EMAIL', 'No emailId provided');
  }

  if (!to) {
    return failedResult(actionId, 'FORWARD_EMAIL', 'No recipient (to) specified');
  }

  const email = await deps.emailService.findEmailById(emailId);

  if (!email) {
    return failedResult(actionId, 'FORWARD_EMAIL', `Email not found: ${emailId}`);
  }

  try {
    const accessToken = await getValidAccessToken(email.account, deps.emailProvider, deps);

    const forwardedBody = `
      ${additionalMessage ? `<p>${additionalMessage}</p><hr/>` : ''}
      <p>---------- Forwarded message ----------</p>
      <p>From: ${email.fromName ?? email.fromEmail} &lt;${email.fromEmail}&gt;</p>
      <p>Date: ${email.emailDate.toISOString()}</p>
      <p>Subject: ${email.subject}</p>
      <p>To: ${email.toEmail}</p>
      <hr/>
      ${email.bodyHtml ?? email.bodyText ?? email.snippet}
    `;

    await deps.emailProvider.sendEmail(accessToken, {
      to,
      subject: `Fwd: ${email.subject}`,
      bodyHtml: forwardedBody,
    });

    return completedResult(actionId, 'FORWARD_EMAIL', { emailId, forwardedTo: to });
  } catch (err) {
    return failedResult(
      actionId,
      'FORWARD_EMAIL',
      err instanceof Error ? err.message : 'Failed to forward email'
    );
  }
}
