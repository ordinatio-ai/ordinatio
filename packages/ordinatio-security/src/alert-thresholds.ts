// ===========================================
// @ordinatio/security — Alert Thresholds
// ===========================================
// Threshold definitions for when to generate alerts
// based on patterns of security events.
// ===========================================

import { SECURITY_EVENT_TYPES, type AlertThreshold } from './types';

export const ALERT_THRESHOLDS: AlertThreshold[] = [
  // Brute Force Detection
  {
    eventType: SECURITY_EVENT_TYPES.AUTH_LOGIN_FAILED,
    windowMinutes: 15,
    threshold: 5,
    alertLevel: 'HIGH',
    description: '5+ failed login attempts in 15 minutes suggests brute force attack',
  },
  {
    eventType: SECURITY_EVENT_TYPES.AUTH_LOGIN_FAILED,
    windowMinutes: 60,
    threshold: 10,
    alertLevel: 'CRITICAL',
    description: '10+ failed login attempts in 1 hour suggests sustained attack',
  },

  // Rate Limit Abuse
  {
    eventType: SECURITY_EVENT_TYPES.RATE_LIMIT_EXCEEDED,
    windowMinutes: 5,
    threshold: 10,
    alertLevel: 'HIGH',
    description: '10+ rate limit hits in 5 minutes suggests API abuse',
  },

  // Permission Escalation
  {
    eventType: SECURITY_EVENT_TYPES.PERMISSION_DENIED,
    windowMinutes: 10,
    threshold: 10,
    alertLevel: 'HIGH',
    description: '10+ permission denials in 10 minutes suggests privilege escalation attempt',
  },

  // Data Exfiltration
  {
    eventType: SECURITY_EVENT_TYPES.SENSITIVE_DATA_EXPORTED,
    windowMinutes: 60,
    threshold: 5,
    alertLevel: 'CRITICAL',
    description: '5+ data exports in 1 hour suggests potential data exfiltration',
  },

  // CSRF Attack
  {
    eventType: SECURITY_EVENT_TYPES.CSRF_VALIDATION_FAILED,
    windowMinutes: 5,
    threshold: 3,
    alertLevel: 'CRITICAL',
    description: '3+ CSRF failures in 5 minutes suggests active CSRF attack',
  },

  // Invalid Input (Potential Injection)
  {
    eventType: SECURITY_EVENT_TYPES.INVALID_INPUT_BLOCKED,
    windowMinutes: 10,
    threshold: 20,
    alertLevel: 'HIGH',
    description: '20+ blocked inputs in 10 minutes suggests injection attack',
  },

  // Account Lockouts
  {
    eventType: SECURITY_EVENT_TYPES.AUTH_ACCOUNT_LOCKED,
    windowMinutes: 60,
    threshold: 3,
    alertLevel: 'CRITICAL',
    description: '3+ account lockouts in 1 hour suggests coordinated attack',
  },

  // Webhook Attacks
  {
    eventType: SECURITY_EVENT_TYPES.WEBHOOK_SIGNATURE_INVALID,
    windowMinutes: 10,
    threshold: 5,
    alertLevel: 'HIGH',
    description: '5+ invalid webhooks in 10 minutes suggests webhook spoofing',
  },
];
