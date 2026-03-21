import { describe, it, expect } from 'vitest';
import { secmonError, SECMON_ERRORS } from '../errors';

describe('Error Registry', () => {
  it('secmonError generates timestamped ref', () => {
    const err = secmonError('SECMON_100');
    expect(err.code).toBe('SECMON_100');
    expect(err.ref).toMatch(/^SECMON_100-\d{8}T\d{6}$/);
  });

  it('all SECMON codes have required fields', () => {
    for (const [key, entry] of Object.entries(SECMON_ERRORS)) {
      expect(entry.code).toBe(key);
      expect(entry.file).toBeTruthy();
      expect(entry.function).toBeTruthy();
      expect(entry.severity).toBeTruthy();
      expect(typeof entry.recoverable).toBe('boolean');
      expect(entry.description).toBeTruthy();
      expect(entry.diagnosis.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('has codes for all three categories', () => {
    const codes = Object.keys(SECMON_ERRORS);
    const eventCodes = codes.filter(c => parseInt(c.replace('SECMON_', '')) < 200);
    const alertCodes = codes.filter(c => {
      const n = parseInt(c.replace('SECMON_', ''));
      return n >= 200 && n < 300;
    });
    const detectionCodes = codes.filter(c => parseInt(c.replace('SECMON_', '')) >= 300);

    expect(eventCodes.length).toBeGreaterThanOrEqual(5);
    expect(alertCodes.length).toBeGreaterThanOrEqual(5);
    expect(detectionCodes.length).toBeGreaterThanOrEqual(3);
  });
});
