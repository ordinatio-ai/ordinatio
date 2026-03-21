// ===========================================
// SYSTEM ACTIONS
// ===========================================
// Handlers for system-level automation actions.
// Uses dependency injection for SaaS extraction readiness.
// ===========================================
// DEPENDS ON: registry, condition-evaluator, default-deps, security
// USED BY: action-executor, automation tests
// ===========================================

import { AUTOMATION_ACTIVITY_ACTIONS, type ActivityAction } from '../db-types';
import { resolveTemplateVars } from '../condition-evaluator';
import {
  validateWebhookUrl,
  checkWebhookRateLimit,
  logSecurityEvent,
} from '../resilience/security';
import {
  registerAction,
  completedResult,
  failedResult,
  type ActionResult,
  type ExecutionContext,
} from './registry';
import type { ActionDependencies } from './types';
import { getDependencies } from './default-deps';

// ===========================================
// CALL_WEBHOOK
// ===========================================
// Config options:
//   - url (required): Webhook URL, supports {{template}} vars
//   - method (optional): HTTP method, defaults to 'POST'
//   - headers (optional): Additional headers to send
//   - body (optional): Request body (JSON), supports {{template}} vars
//   - timeoutMs (optional): Request timeout in milliseconds, defaults to 30000
// ===========================================

export async function executeCallWebhook(
  actionId: string,
  config: Record<string, unknown>,
  context: ExecutionContext,
  _customDeps?: ActionDependencies
): Promise<ActionResult> {
  // Note: Webhook action doesn't use deps, but we accept the parameter for consistency
  const url = resolveTemplateVars(String(config.url ?? ''), context.data);
  const method = (config.method as string) ?? 'POST';
  const headers = (config.headers as Record<string, string>) ?? {};
  const timeoutMs = (config.timeoutMs as number) ?? 30000;

  if (!url) {
    return failedResult(actionId, 'CALL_WEBHOOK', 'No URL provided');
  }

  // SECURITY: Validate URL is not internal/private (SSRF protection)
  const urlValidation = validateWebhookUrl(url);
  if (!urlValidation.safe) {
    logSecurityEvent('SSRF_BLOCKED', { url, reason: urlValidation.reason, actionId });
    return failedResult(actionId, 'CALL_WEBHOOK', `URL blocked: ${urlValidation.reason}`);
  }

  // SECURITY: Check rate limit for this destination
  const rateLimit = checkWebhookRateLimit(url);
  if (!rateLimit.allowed) {
    logSecurityEvent('RATE_LIMITED', { url, reason: rateLimit.reason, actionId });
    return failedResult(actionId, 'CALL_WEBHOOK', rateLimit.reason ?? 'Rate limit exceeded');
  }

  // Build body from config or use trigger data
  let body: unknown;
  if (config.body) {
    try {
      body = JSON.parse(resolveTemplateVars(JSON.stringify(config.body), context.data));
    } catch {
      body = config.body;
    }
  } else {
    body = context.data;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'System1701-Automation/1.0',
        ...headers,
      },
      body: method !== 'GET' ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const responseData = await response.text();

    if (!response.ok) {
      return failedResult(
        actionId,
        'CALL_WEBHOOK',
        `Webhook returned ${response.status}: ${responseData.substring(0, 500)}`
      );
    }

    // Try to parse response as JSON
    let parsedResponse: unknown = responseData;
    try {
      parsedResponse = JSON.parse(responseData);
    } catch {
      // Keep as string if not valid JSON
    }

    return completedResult(actionId, 'CALL_WEBHOOK', {
      statusCode: response.status,
      response: parsedResponse,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Webhook call failed';
    const isTimeout = errorMessage.includes('abort');

    return failedResult(
      actionId,
      'CALL_WEBHOOK',
      isTimeout ? `Webhook timed out after ${timeoutMs}ms` : errorMessage
    );
  }
}

// ===========================================
// LOG_ACTIVITY
// ===========================================
// Config options:
//   - action (optional): Activity action type, defaults to 'task.created'
//   - description (required): Activity description, supports {{template}} vars
//   - orderId (optional): Order ID, falls back to context.data.orderId
//   - clientId (optional): Client ID, falls back to context.data.clientId
// ===========================================

export async function executeLogActivity(
  actionId: string,
  config: Record<string, unknown>,
  context: ExecutionContext,
  customDeps?: ActionDependencies
): Promise<ActionResult> {
  const deps = getDependencies(customDeps);

  // Use a valid action from ACTIVITY_ACTIONS or default to task.created
  const actionStr = resolveTemplateVars(
    String(config.action ?? AUTOMATION_ACTIVITY_ACTIONS.TASK_CREATED),
    context.data
  );
  const description = resolveTemplateVars(String(config.description ?? ''), context.data);
  const orderId = (config.orderId ?? context.data.orderId) as string | undefined;
  const clientId = (config.clientId ?? context.data.clientId) as string | undefined;

  if (!description) {
    return failedResult(actionId, 'LOG_ACTIVITY', 'No description provided');
  }

  try {
    await deps.activityService.createActivity({
      action: actionStr as ActivityAction,
      description,
      orderId: orderId ?? null,
      clientId: clientId ?? null,
      system: true,
      metadata: {
        automationAction: true,
        triggerData: context.data,
      },
    });

    return completedResult(actionId, 'LOG_ACTIVITY', {
      action: actionStr,
      description,
    });
  } catch (err) {
    return failedResult(
      actionId,
      'LOG_ACTIVITY',
      err instanceof Error ? err.message : 'Failed to log activity'
    );
  }
}

// ===========================================
// DELAY
// ===========================================
// Config options:
//   - delayMs (optional): Delay in milliseconds
//   - seconds (optional): Delay in seconds (alternative to delayMs)
//   - Maximum delay is 5 minutes to prevent runaway automations
// ===========================================

export async function executeDelay(
  actionId: string,
  config: Record<string, unknown>,
  _context: ExecutionContext,
  _customDeps?: ActionDependencies
): Promise<ActionResult> {
  // Note: Delay action doesn't use deps, but we accept the parameter for consistency
  let delayMs = 1000; // Default 1 second
  if (typeof config.delayMs === 'number') {
    delayMs = config.delayMs;
  } else if (typeof config.seconds === 'number') {
    delayMs = config.seconds * 1000;
  }

  // Cap delay at 5 minutes to prevent runaway automations
  const maxDelay = 5 * 60 * 1000;
  const actualDelay = Math.min(delayMs, maxDelay);

  await new Promise((resolve) => setTimeout(resolve, actualDelay));

  return completedResult(actionId, 'DELAY', {
    delayedMs: actualDelay,
    requestedMs: delayMs,
    capped: delayMs > maxDelay,
  });
}

// ===========================================
// REGISTER ALL SYSTEM ACTIONS
// ===========================================

export function registerSystemActions(): void {
  // Wrap the exported functions to match the registry signature
  registerAction('CALL_WEBHOOK', (actionId, config, context) =>
    executeCallWebhook(actionId, config, context)
  );
  registerAction('LOG_ACTIVITY', (actionId, config, context) =>
    executeLogActivity(actionId, config, context)
  );
  registerAction('DELAY', (actionId, config, context) =>
    executeDelay(actionId, config, context)
  );
}
