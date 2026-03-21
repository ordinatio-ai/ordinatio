// ===========================================
// ORDINATIO JOBS — BullMQ Adapter Tests
// ===========================================
// Tests the adapter's helper functions.
// Full queue integration requires Redis,
// so we test the pure functions here.
// ===========================================

import { describe, it, expect } from 'vitest';
import { buildRedisConnection } from '../bullmq-adapter';
import type { RedisConfig } from '../types';

describe('BullMQ Adapter', () => {
  describe('buildRedisConnection', () => {
    it('builds connection from config', () => {
      const config: RedisConfig = {
        host: 'redis.example.com',
        port: 6380,
        password: 'secret',
      };

      const conn = buildRedisConnection(config);
      expect(conn.host).toBe('redis.example.com');
      expect(conn.port).toBe(6380);
      expect(conn.password).toBe('secret');
      expect(conn.maxRetriesPerRequest).toBeNull();
    });

    it('omits password when empty', () => {
      const config: RedisConfig = {
        host: 'localhost',
        port: 6379,
        password: '',
      };

      const conn = buildRedisConnection(config);
      expect(conn.password).toBeUndefined();
    });

    it('omits password when undefined', () => {
      const config: RedisConfig = {
        host: 'localhost',
        port: 6379,
      };

      const conn = buildRedisConnection(config);
      expect(conn.password).toBeUndefined();
    });

    it('passes through custom maxRetriesPerRequest', () => {
      const config: RedisConfig = {
        host: 'localhost',
        port: 6379,
        maxRetriesPerRequest: 5,
      };

      const conn = buildRedisConnection(config);
      expect(conn.maxRetriesPerRequest).toBe(5);
    });

    it('defaults maxRetriesPerRequest to null', () => {
      const config: RedisConfig = {
        host: 'localhost',
        port: 6379,
      };

      const conn = buildRedisConnection(config);
      expect(conn.maxRetriesPerRequest).toBeNull();
    });

    it('passes through db number', () => {
      const config: RedisConfig = {
        host: 'localhost',
        port: 6379,
        db: 2,
      };

      const conn = buildRedisConnection(config);
      expect(conn.db).toBe(2);
    });
  });
});
