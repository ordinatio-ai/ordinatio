// ===========================================
// @ordinatio/security — Event Helper Functions
// ===========================================
// Utility functions for querying and filtering
// security event configuration data.
// ===========================================

import {
  RISK_LEVELS,
  type SecurityEventType,
  type SecurityEventConfig,
  type RiskLevel,
  type AlertThreshold,
} from './types';
import { SECURITY_EVENT_CONFIG } from './event-config';
import { ALERT_THRESHOLDS } from './alert-thresholds';

export function getSecurityEventConfig(eventType: SecurityEventType): SecurityEventConfig {
  return SECURITY_EVENT_CONFIG[eventType];
}

export function getAlertThresholdsForEvent(eventType: SecurityEventType): AlertThreshold[] {
  return ALERT_THRESHOLDS.filter(t => t.eventType === eventType);
}

export function shouldAlwaysAlert(eventType: SecurityEventType): boolean {
  return SECURITY_EVENT_CONFIG[eventType].alwaysAlert;
}

export function getEventTypesByTag(tag: string): SecurityEventType[] {
  return (Object.entries(SECURITY_EVENT_CONFIG) as [SecurityEventType, SecurityEventConfig][])
    .filter(([, config]) => config.tags.includes(tag))
    .map(([eventType]) => eventType);
}

export function getEventTypesByMinRiskLevel(minLevel: RiskLevel): SecurityEventType[] {
  return (Object.entries(SECURITY_EVENT_CONFIG) as [SecurityEventType, SecurityEventConfig][])
    .filter(([, config]) => RISK_LEVELS[config.defaultRiskLevel] >= RISK_LEVELS[minLevel])
    .map(([eventType]) => eventType);
}
