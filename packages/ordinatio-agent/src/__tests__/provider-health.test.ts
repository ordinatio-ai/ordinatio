import { describe, it, expect, beforeEach } from 'vitest';
import { recordProviderResult, isProviderHealthy, resetAllProviderHealth } from '../health/provider-health';

describe('Provider Health', () => {
  beforeEach(() => resetAllProviderHealth());

  it('starts healthy for any provider', () => {
    expect(isProviderHealthy('claude')).toBe(true);
    expect(isProviderHealthy('unknown')).toBe(true);
  });

  it('stays healthy after success', () => {
    recordProviderResult('claude', true);
    recordProviderResult('claude', true);
    expect(isProviderHealthy('claude')).toBe(true);
  });

  it('becomes unhealthy after consecutive failures', () => {
    for (let i = 0; i < 5; i++) {
      recordProviderResult('claude', false);
    }
    expect(isProviderHealthy('claude')).toBe(false);
  });

  it('recovers after a success following failures', () => {
    for (let i = 0; i < 5; i++) recordProviderResult('claude', false);
    expect(isProviderHealthy('claude')).toBe(false);

    recordProviderResult('claude', true);
    expect(isProviderHealthy('claude')).toBe(true);
  });

  it('tracks providers independently', () => {
    for (let i = 0; i < 5; i++) recordProviderResult('deepseek', false);
    expect(isProviderHealthy('deepseek')).toBe(false);
    expect(isProviderHealthy('claude')).toBe(true);
  });

  it('resets all provider health', () => {
    for (let i = 0; i < 5; i++) recordProviderResult('claude', false);
    resetAllProviderHealth();
    expect(isProviderHealthy('claude')).toBe(true);
  });
});
