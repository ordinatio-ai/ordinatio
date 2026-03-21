// ===========================================
// @ordinatio/entities — INTERACTION ANALYTICS
// ===========================================
// Pure functions for classifying user queries
// into intent and topic for the suggestion engine.
// ===========================================

const INTENT_PATTERNS: Array<{ pattern: RegExp; intent: string }> = [
  { pattern: /^\/report\b/i, intent: 'report' },
  { pattern: /^\/tour\b/i, intent: 'tour' },
  { pattern: /^\/automation\b/i, intent: 'command' },
  { pattern: /\b(generate|create|make|build|add|set up|configure)\b/i, intent: 'command' },
  { pattern: /\b(delete|remove|disable|turn off)\b/i, intent: 'command' },
  { pattern: /\b(update|change|modify|edit|fix)\b/i, intent: 'command' },
  { pattern: /\b(how|what|why|when|where|explain|tell me|describe)\b/i, intent: 'question' },
  { pattern: /\b(show|find|search|list|get|check|look up)\b/i, intent: 'search' },
];

const TOPIC_KEYWORDS: Record<string, string[]> = {
  'email campaigns': ['email campaign', 'newsletter', 'mass email', 'email blast', 'email marketing'],
  'email templates': ['email template', 'template', 'email format'],
  'fabric stock': ['fabric', 'stock', 'in stock', 'out of stock', 'availability'],
  'order management': ['order', 'placement', 'order status', 'delivery'],
  'client management': ['client', 'customer', 'contact', 'profile'],
  'fit profiles': ['fit profile', 'measurement', 'try-on', 'size', 'adjustment'],
  'tax operations': ['tax', 'transaction', 'categorize', 'deduction', 'irs'],
  'reports': ['report', 'export', 'pdf', 'csv', 'analytics', 'summary'],
  'automations': ['automation', 'workflow', 'trigger', 'automate'],
  'scheduling': ['schedule', 'calendar', 'deadline', 'reminder'],
  'billing': ['billing', 'invoice', 'payment', 'charge'],
  'inventory': ['inventory', 'stock', 'supply', 'reorder'],
  'social media': ['social media', 'post', 'tweet', 'instagram', 'facebook'],
  'customer support': ['support', 'ticket', 'complaint', 'help desk'],
  'onboarding': ['onboarding', 'training', 'getting started', 'tutorial'],
};

export function classifyIntent(query: string): string {
  const normalized = query.trim().toLowerCase();
  for (const { pattern, intent } of INTENT_PATTERNS) {
    if (pattern.test(normalized)) return intent;
  }
  if (normalized.includes('?')) return 'question';
  return 'search';
}

export function extractTopic(query: string): string | null {
  const normalized = query.toLowerCase();
  let bestTopic: string | null = null;
  let bestScore = 0;

  for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    for (const keyword of keywords) {
      if (normalized.includes(keyword)) {
        const score = keyword.length;
        if (score > bestScore) {
          bestScore = score;
          bestTopic = topic;
        }
      }
    }
  }

  return bestTopic;
}

export function extractModules(toolNames: string[]): string[] {
  const MODULE_MAP: Record<string, string> = {
    email: 'email',
    template: 'email',
    automation: 'automation',
    order: 'orders',
    client: 'clients',
    fabric: 'fabric',
    tax: 'tax',
    transaction: 'tax',
    report: 'reports',
    tour: 'tours',
    task: 'tasks',
    activity: 'activities',
    navigate: 'navigation',
    setting: 'settings',
  };

  const modules = new Set<string>();
  for (const tool of toolNames) {
    const lower = tool.toLowerCase();
    for (const [keyword, mod] of Object.entries(MODULE_MAP)) {
      if (lower.includes(keyword)) {
        modules.add(mod);
        break;
      }
    }
  }
  return Array.from(modules);
}
