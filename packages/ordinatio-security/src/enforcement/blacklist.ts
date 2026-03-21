// ===========================================
// @ordinatio/security — Enforcement: Blacklist
// ===========================================
// IP, principal, and org-level blacklisting with TTL.
// ===========================================

export interface Blacklist {
  isBlacklisted(key: string): boolean;
  add(key: string, expiresAt?: Date): void;
  remove(key: string): void;
  readonly size: number;
  clear(): void;
}

/**
 * In-memory blacklist with optional TTL per entry.
 */
export class InMemoryBlacklist implements Blacklist {
  private entries: Map<string, number | null>; // key → expiresAt timestamp (null = permanent)

  constructor() {
    this.entries = new Map();
  }

  isBlacklisted(key: string): boolean {
    const expiresAt = this.entries.get(key);
    if (expiresAt === undefined) return false;
    if (expiresAt === null) return true; // permanent
    if (expiresAt > Date.now()) return true;
    // Expired — clean up
    this.entries.delete(key);
    return false;
  }

  add(key: string, expiresAt?: Date): void {
    this.entries.set(key, expiresAt?.getTime() ?? null);
  }

  remove(key: string): void {
    this.entries.delete(key);
  }

  get size(): number {
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
  }
}

/**
 * Composite blacklist: checks multiple dimensions (IP, principal, org).
 * Blocked on ANY dimension = blocked.
 */
export class CompositeBlacklist {
  private ipBlacklist: Blacklist;
  private principalBlacklist: Blacklist;
  private orgBlacklist: Blacklist;

  constructor(opts?: {
    ipBlacklist?: Blacklist;
    principalBlacklist?: Blacklist;
    orgBlacklist?: Blacklist;
  }) {
    this.ipBlacklist = opts?.ipBlacklist ?? new InMemoryBlacklist();
    this.principalBlacklist = opts?.principalBlacklist ?? new InMemoryBlacklist();
    this.orgBlacklist = opts?.orgBlacklist ?? new InMemoryBlacklist();
  }

  isBlacklisted(context: { ip?: string; principalId?: string; orgId?: string }): {
    blocked: boolean;
    dimension?: 'ip' | 'principal' | 'org';
    key?: string;
  } {
    if (context.ip && this.ipBlacklist.isBlacklisted(context.ip)) {
      return { blocked: true, dimension: 'ip', key: context.ip };
    }
    if (context.principalId && this.principalBlacklist.isBlacklisted(context.principalId)) {
      return { blocked: true, dimension: 'principal', key: context.principalId };
    }
    if (context.orgId && this.orgBlacklist.isBlacklisted(context.orgId)) {
      return { blocked: true, dimension: 'org', key: context.orgId };
    }
    return { blocked: false };
  }

  blockIp(ip: string, expiresAt?: Date): void {
    this.ipBlacklist.add(ip, expiresAt);
  }

  blockPrincipal(principalId: string, expiresAt?: Date): void {
    this.principalBlacklist.add(principalId, expiresAt);
  }

  blockOrg(orgId: string, expiresAt?: Date): void {
    this.orgBlacklist.add(orgId, expiresAt);
  }

  unblockIp(ip: string): void {
    this.ipBlacklist.remove(ip);
  }

  unblockPrincipal(principalId: string): void {
    this.principalBlacklist.remove(principalId);
  }

  unblockOrg(orgId: string): void {
    this.orgBlacklist.remove(orgId);
  }

  clear(): void {
    this.ipBlacklist.clear();
    this.principalBlacklist.clear();
    this.orgBlacklist.clear();
  }
}
