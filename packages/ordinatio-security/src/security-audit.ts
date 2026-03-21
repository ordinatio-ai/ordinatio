// ===========================================
// @ordinatio/security — Security Audit Service
// ===========================================
// Runs vulnerability and outdated package checks.
// Uses AuditRunner callback — app layer provides the real implementation.
// ===========================================

import type {
  SecurityDb,
  SecurityCallbacks,
  AuditResult,
  AuditRunner,
} from './types';

/**
 * Run full security audit using the provided runner.
 * The runner is injected by the app layer (e.g., pnpm audit).
 */
export async function runSecurityAudit(
  db: SecurityDb,
  runner: AuditRunner,
  triggeredBy: string = 'system',
  callbacks?: SecurityCallbacks
): Promise<AuditResult> {
  const timestamp = new Date();
  const startTime = Date.now();

  callbacks?.log?.info('Starting security audit', { triggeredBy });

  try {
    const [vulnerabilities, outdatedPackages] = await Promise.all([
      runner.runVulnerabilityCheck(),
      runner.runOutdatedCheck(),
    ]);

    const durationMs = Date.now() - startTime;

    const result: AuditResult = {
      vulnerabilities,
      outdatedPackages,
      timestamp,
      success: true,
    };

    let statusMessage = 'No issues found';
    if (vulnerabilities.critical > 0 || vulnerabilities.high > 0) {
      statusMessage = `${vulnerabilities.critical} critical, ${vulnerabilities.high} high vulnerabilities`;
    } else if (vulnerabilities.moderate > 0 || vulnerabilities.low > 0) {
      statusMessage = `${vulnerabilities.total} low/moderate vulnerabilities`;
    } else if (outdatedPackages.length > 10) {
      statusMessage = `${outdatedPackages.length} packages need updates`;
    } else if (outdatedPackages.length > 0) {
      statusMessage = `${outdatedPackages.length} minor updates available`;
    }

    callbacks?.log?.info('Security audit completed', {
      triggeredBy,
      durationMs,
      vulnerabilities,
      outdatedCount: outdatedPackages.length,
      statusMessage,
    });

    // Log to activity feed via db
    try {
      await db.activityLog.create({
        data: {
          action: 'security.audit_completed',
          description: `Security Audit: ${statusMessage}`,
          system: true,
          severity: vulnerabilities.critical > 0 || vulnerabilities.high > 0 ? 'ERROR' : 'INFO',
          requiresResolution: vulnerabilities.critical > 0 || vulnerabilities.high > 0,
          userId: null,
          metadata: {
            triggeredBy,
            vulnerabilities,
            outdatedCount: outdatedPackages.length,
            outdatedPackages: outdatedPackages.slice(0, 10).map(p => ({
              name: p.name,
              current: p.current,
              latest: p.latest,
            })),
            durationMs,
          },
        },
      });
    } catch {
      // Activity logging is non-blocking
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const durationMs = Date.now() - startTime;

    callbacks?.log?.error('Security audit failed', { triggeredBy, durationMs }, error as Error);

    try {
      await db.activityLog.create({
        data: {
          action: 'security.audit_failed',
          description: `Security Audit Failed: ${errorMessage}`,
          system: true,
          severity: 'ERROR',
          requiresResolution: true,
          userId: null,
          metadata: { triggeredBy, error: errorMessage, durationMs },
        },
      });
    } catch {
      // Activity logging is non-blocking
    }

    return {
      vulnerabilities: { critical: 0, high: 0, moderate: 0, low: 0, total: 0 },
      outdatedPackages: [],
      timestamp,
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Get the most recent security audit from the activity log.
 */
export async function getLastSecurityAudit(db: SecurityDb): Promise<AuditResult | null> {
  const lastAudit = await db.activityLog.findFirst({
    where: { action: { startsWith: 'security.audit' } },
    orderBy: { createdAt: 'desc' },
  });

  if (!lastAudit || !lastAudit.metadata) return null;

  const metadata = lastAudit.metadata as Record<string, unknown>;

  return {
    vulnerabilities: (metadata.vulnerabilities as AuditResult['vulnerabilities']) || {
      critical: 0, high: 0, moderate: 0, low: 0, total: 0,
    },
    outdatedPackages: (metadata.outdatedPackages as AuditResult['vulnerabilities'][]) || [],
    timestamp: lastAudit.createdAt,
    success: lastAudit.action === 'security.audit_completed',
    error: metadata.error as string | undefined,
  } as AuditResult;
}
