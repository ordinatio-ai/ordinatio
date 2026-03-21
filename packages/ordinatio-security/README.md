# @ordinatio/security

**Agentic-first Security Control Plane** for any Node.js application — 5-layer architecture with trust evaluation, policy engine, enforcement gates, integrity chains, and machine-readable recovery guidance on every decision.

Zero framework dependencies. Uses a minimal `SecurityDb` interface — works with Prisma, Drizzle, or any ORM that can read/write an ActivityLog-shaped table.

**500 tests. 35 error codes. 31 source files. 40+ security event types. 18-category enterprise test suite.**

## 5-Layer Architecture

```
Layer 5: Integrity       — SHA-256 hash chains, tamper detection, content verification
Layer 4: Enforcement     — blacklists (IP/principal/org), action gate, nonce replay protection
Layer 3: Policy          — trust evaluator, policy engine, security intents, playbooks
Layer 2: Detection       — brute force, account takeover, thresholds, pattern matching
Layer 1: Logging         — 40+ event types, queries, statistics, convenience functions
  +Principal Context     — trust binding (who, what type, which org, auth method)

Cross-cutting:
  Security Posture       — getSecurityPosture() — one call, full situational awareness
  Alert Recovery         — every alert includes impact + action + allowed followups
  Summary Layer          — summarizePosture() for agents and dashboards
```

**Design principle:** Agents never guess whether something is safe. They ask Security. Every response includes what happened, how severe it is, whether work can continue, and what to do next.

## Installation

```bash
npm install @ordinatio/security
```

Or via the Ordinatio Domus orchestrator:

```bash
npx ordinatio add security
```

## Quick Start

```typescript
import {
  logSecurityEvent,
  checkSecurityPatterns,
  evaluateTrust,
  evaluatePolicy,
  shouldBlockAction,
  getSecurityPosture,
  summarizePosture,
  buildPrincipalContext,
  SECURITY_EVENT_TYPES,
} from '@ordinatio/security';

// 1. Log a security event
const event = await logSecurityEvent(db, {
  eventType: SECURITY_EVENT_TYPES.AUTH_LOGIN_FAILED,
  ip: '192.168.1.1',
  principal: buildPrincipalContext({ principalId: 'unknown', principalType: 'user' }),
  details: { email: 'attacker@example.com', reason: 'user_not_found' },
});

// 2. Auto-detect attack patterns
const alerts = await checkSecurityPatterns(db, event);

// 3. Evaluate trust for an operation
const trust = evaluateTrust({
  issuer: 'vendor.com',
  signatureValid: true,
  dmarcStatus: 'pass',
  nonceValid: true,
  ttlValid: true,
  orgPolicy: { trustedDomains: ['vendor.com'] },
});
// → { trustTier: 1, trustScore: 100, reasons: ['All trust checks passed'] }

// 4. Check if an action should be blocked
const gate = await shouldBlockAction(db, {
  principal: { principalId: 'agent-coo', principalType: 'agent', trustTier: trust.trustTier },
  action: 'process_payment',
  nonce: 'unique-request-id',
}, { blacklist, nonceStore, policies });
// → { blocked: true, reason: '...', recovery: { nextAction: '...', safeAlternatives: [...] } }

// 5. Get full security posture in one call
const posture = await getSecurityPosture(db, {
  principal: { principalId: 'admin', principalType: 'user', trustTier: 2 },
});
console.log(summarizePosture(posture));
// "Security Posture: verified (tier 1, risk 30/100)\nActive alerts: 2 total\n  CRITICAL: 1\n..."
```

## Key Agentic-First Design Principles

1. **One call for full context** — `getSecurityPosture()` replaces querying 12 things
2. **Every denial includes recovery** — `{ nextAction, safeAlternatives[] }`, never just "no"
3. **Alerts are decision packets** — `{ impact, recovery, allowedFollowups }`, not just notifications
4. **Trust is centralized** — `evaluateTrust()` is one shared primitive, not per-module reinvention
5. **Playbooks are machine-readable** — agents follow incident response without human scripting
6. **Security intents** — uniform language: `VERIFY_IDENTITY`, `QUARANTINE_EVENT`, `ESCALATE_TO_HUMAN`
7. **Discoverable API** — `_actions` on posture responses so agents discover capabilities without docs

## Database Interface

The package never imports Prisma or any ORM. It accepts a `SecurityDb` object:

```typescript
interface SecurityDb {
  activityLog: {
    create: (args) => Promise<ActivityLogRecord>;
    findMany: (args) => Promise<ActivityLogRecord[]>;
    findFirst: (args) => Promise<ActivityLogRecord | null>;
    findUnique: (args) => Promise<ActivityLogRecord | null>;
    count: (args) => Promise<number>;
    update: (args) => Promise<ActivityLogRecord>;
  };
}
```

A Prisma client satisfies this naturally. Everything is stored in `ActivityLog` with action prefixes: `security.*` for events, `alert.*` for alerts.

## Event Types (40+)

| Category | Events | Default Risk |
|----------|--------|-------------|
| **Authentication** | login success/fail, logout, password change, session expired, account locked, suspicious activity, MFA, password reset | LOW–HIGH |
| **Access Control** | permission denied/granted/revoked, role changed, unauthorized resource | LOW–HIGH |
| **API Security** | rate limit exceeded, API key CRUD, header missing, CSRF failed, input blocked | MEDIUM–HIGH |
| **Data Security** | sensitive data accessed/exported, bulk operations, PII accessed | LOW–HIGH |
| **System** | config changed, feature flag toggled, scan completed, vulnerability detected, anomaly | LOW–CRITICAL |
| **Agent** | sensitive data to LLM, tool blocked by policy | MEDIUM–HIGH |
| **Integration** | OAuth refresh/revoke, webhook signature invalid, external API error | LOW–HIGH |

## Alert Thresholds (Configurable)

| Pattern | Threshold | Window | Alert Level |
|---------|-----------|--------|-------------|
| Failed logins | 5 | 15 min | HIGH |
| Failed logins (sustained) | 10 | 60 min | CRITICAL |
| Rate limit hits | 10 | 5 min | HIGH |
| Permission denials | 10 | 10 min | HIGH |
| Data exports | 5 | 60 min | CRITICAL |
| CSRF failures | 3 | 5 min | CRITICAL |
| Blocked inputs | 20 | 10 min | HIGH |
| Account lockouts | 3 | 60 min | CRITICAL |
| Invalid webhooks | 5 | 10 min | HIGH |

## Error Codes (SECMON_100–432)

| Range | Category | Count |
|-------|----------|-------|
| 100–106 | Event Logging | 7 |
| 200–206 | Alert Management | 7 |
| 300–304 | Detection Engine | 5 |
| 400–406 | Integrity Layer | 7 |
| 410–418 | Trust & Policy | 9 |
| 420–432 | Enforcement / Replay | 10 |

Every error includes: code, file, function, severity, recoverable flag, description, and diagnosis steps.

## API Reference

### Layer 1: Logging
- `logSecurityEvent(db, input, callbacks?)` — Core logging
- `logLoginSuccess/Failure/RateLimitExceeded/PermissionDenied/SuspiciousActivity` — Convenience wrappers
- `getSecurityEvents(db, options?)` — Query with filters, pagination
- `countSecurityEventsInWindow(db, options)` — Threshold checks
- `getUserSecurityHistory / getSecurityEventsByIp / getRecentHighRiskEvents / getSecurityEventStats`

### Layer 2: Detection
- `checkSecurityPatterns(db, event, callbacks?)` — Run all detectors
- `checkForBruteForce / checkForAccountTakeover / checkForSuspiciousPatterns`

### Layer 3: Policy
- `evaluateTrust(input)` → `{ trustTier: 0|1|2, trustScore: 0-100, reasons[] }`
- `evaluatePolicy(context, policies)` → `{ decision, recommendation, constraints }`
- `resolveIntent(intent, context, db, callbacks?)` — Named security operations
- `getPlaybookForAlert(alertType)` — Machine-readable incident response

### Layer 4: Enforcement
- `shouldBlockAction(db, context, config, callbacks?)` → `{ blocked, reason, recovery }`
- `InMemoryNonceStore` — LRU+TTL replay protection
- `CompositeBlacklist` — IP/principal/org with TTL
- `getThrottleDelay(excess, baseMs)` — Exponential backoff

### Layer 5: Integrity
- `computeEventHash / computeIntegrityHash` — SHA-256 deterministic hashing
- `verifyEventChain(events)` — Tamper-evident chain verification
- `verifyContentIntegrity / verifyChainLink / verifyHashChain` — Generic primitives
- `buildHashedEvent / buildIntegrityMetadata / getLastHash`

### Cross-cutting
- `buildPrincipalContext / validatePrincipal / describePrincipal` — Trust binding
- `getSecurityPosture(db, options?, callbacks?)` — Full situational awareness
- `summarizePosture(posture)` — Token-efficient text for LLM context windows
- `buildAlertRecovery(alert)` — Impact + action + followups
- `buildSecurityHeaders(isDev?) / SECURITY_HEADERS` — HTTP security headers
- `InMemoryKeyStore / resolveKeyForTrust` — Key rotation with grace windows

### Alert Management
- `createAlert / findExistingAlert / getActiveAlerts / getAlerts`
- `acknowledgeAlert / resolveAlert / getAlertStats / activityToAlert`

### Audit
- `runSecurityAudit(db, runner, triggeredBy?, callbacks?)` — Pluggable audit runner
- `getLastSecurityAudit(db)` — Most recent result

## Enterprise Test Suite (18 Categories)

| Category | Tests | What It Proves |
|----------|-------|----------------|
| Policy truth table | 25 | Correct allow/deny/escalate for every trust×action combination |
| Fail-safe | 15 | Safe degradation on DB failure, callback panic, malformed input |
| Tamper-evident chain | 17 | Modified/deleted/reordered/injected events detected |
| Replay attacks | 12 | Concurrent nonce replay blocked, exactly-once execution |
| Key rotation | 22 | Grace windows, revocation, trust continuity across rotation |
| Threshold edges | 9 | No off-by-one on alert boundaries |
| Posture snapshots | 6 | Deterministic posture output (golden tests) |
| Adversarial metadata | 18 | 10KB+ payloads, SQL/XSS injection, prototype pollution |
| Hypermedia contract | 21 | Every response includes _actions, recovery, constraints |
| Recovery paths | 10 | Every denial tells the agent what to do next |
| Summary contract | 18 | Summaries match machine state, don't omit restrictions |
| Stress/load | 8 | 10k trust evals, 100k nonces, 1k gate checks |
| Race conditions | 7 | No double-creation, no stale overwrites |
| Chaos | 9 | DB down, callback panic, clock skew — all fail safe |
| Red team scenarios | 6 | Fake vendor payment, brute force wave, malicious key rotation |
| Regression corpus | 17 | Known attack patterns still recognized |
| Adversarial tampering | 14 | Chain corruption at every position detected |
| Time edge cases | 11 | TTL boundary, nonce expiry, clock skew |

## Domus Integration

When used via `@ordinatio/domus`, the security module:
- Uses the existing `ActivityLog` table (no additional schema)
- Has no seed data (events are generated by application behavior)
- Provides `DomusSecurityApi` with 12 pre-wired methods

## License

MIT
