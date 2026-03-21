// IHS
import { describe, it, expect } from 'vitest';
import {
  computeContentHash,
  verifyArtifactHash,
  createArtifact,
  supersede,
} from './artifact-helpers';
import type { CouncilArtifact, PropositioContent, ObjectionesContent } from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePropositio(): PropositioContent {
  return {
    type: 'propositio',
    signal: 'Test signal',
    proposal: 'Add feature X',
    benefit: 'Faster processing',
    affectedModules: ['mod-a', 'mod-b'],
    risk: 'Low',
    implementation: 'Add a new file',
  };
}

function makeObjectiones(): ObjectionesContent {
  return {
    type: 'objectiones',
    propositionId: 'art-123',
    objections: [
      { argument: 'Too complex', severity: 'major', evidence: 'Adds 3 deps' },
    ],
    recommendation: 'modify',
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Artifact Helpers', () => {
  describe('computeContentHash', () => {
    it('produces a 64-char hex SHA-256 hash', () => {
      const hash = computeContentHash(makePropositio());
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('is deterministic — same content produces same hash', () => {
      const content = makePropositio();
      const hash1 = computeContentHash(content);
      const hash2 = computeContentHash(content);
      expect(hash1).toBe(hash2);
    });

    it('differs for different content', () => {
      const hash1 = computeContentHash(makePropositio());
      const hash2 = computeContentHash(makeObjectiones());
      expect(hash1).not.toBe(hash2);
    });

    it('is insensitive to key order (sorted keys)', () => {
      const a = { type: 'propositio' as const, signal: 'x', proposal: 'y', benefit: 'z', affectedModules: [] as string[], risk: 'Low', implementation: 'n/a' };
      // Same object with keys in different insertion order
      const b = { proposal: 'y', type: 'propositio' as const, risk: 'Low', signal: 'x', benefit: 'z', implementation: 'n/a', affectedModules: [] as string[] };
      expect(computeContentHash(a)).toBe(computeContentHash(b));
    });
  });

  describe('verifyArtifactHash', () => {
    it('returns true for valid hash', () => {
      const content = makePropositio();
      const hash = computeContentHash(content);
      expect(verifyArtifactHash({ content, contentHash: hash })).toBe(true);
    });

    it('returns false for tampered content', () => {
      const content = makePropositio();
      const hash = computeContentHash(content);
      const tampered = { ...content, proposal: 'Tampered!' };
      expect(verifyArtifactHash({ content: tampered, contentHash: hash })).toBe(false);
    });

    it('returns false for wrong hash', () => {
      const content = makePropositio();
      expect(verifyArtifactHash({ content, contentHash: 'badhash' })).toBe(false);
    });
  });

  describe('createArtifact', () => {
    it('generates an ID with cycle, office, and timestamp', () => {
      const artifact = createArtifact({
        cycleId: 'cycle-42',
        producedBy: 'speculator',
        type: 'propositio',
        content: makePropositio(),
      });
      expect(artifact.id).toMatch(/^art-cycle-42-speculator-\d+-[0-9a-f]{8}$/);
    });

    it('computes content hash', () => {
      const content = makePropositio();
      const artifact = createArtifact({
        cycleId: 'c1',
        producedBy: 'speculator',
        type: 'propositio',
        content,
      });
      expect(artifact.contentHash).toBe(computeContentHash(content));
    });

    it('defaults version to 1 and status to submitted', () => {
      const artifact = createArtifact({
        cycleId: 'c1',
        producedBy: 'speculator',
        type: 'propositio',
        content: makePropositio(),
      });
      expect(artifact.version).toBe(1);
      expect(artifact.status).toBe('submitted');
    });

    it('accepts custom version and status', () => {
      const artifact = createArtifact({
        cycleId: 'c1',
        producedBy: 'speculator',
        type: 'propositio',
        content: makePropositio(),
        version: 3,
        status: 'accepted',
      });
      expect(artifact.version).toBe(3);
      expect(artifact.status).toBe('accepted');
    });

    it('defaults references to empty array', () => {
      const artifact = createArtifact({
        cycleId: 'c1',
        producedBy: 'speculator',
        type: 'propositio',
        content: makePropositio(),
      });
      expect(artifact.references).toEqual([]);
    });

    it('preserves provided references', () => {
      const artifact = createArtifact({
        cycleId: 'c1',
        producedBy: 'speculator',
        type: 'propositio',
        content: makePropositio(),
        references: ['ref-1', 'ref-2'],
      });
      expect(artifact.references).toEqual(['ref-1', 'ref-2']);
    });
  });

  describe('supersede', () => {
    it('bumps the version', () => {
      const original = createArtifact({
        cycleId: 'c1',
        producedBy: 'speculator',
        type: 'propositio',
        content: makePropositio(),
      });
      const newContent = { ...makePropositio(), proposal: 'Revised proposal' };
      const revised = supersede(original, newContent);
      expect(revised.version).toBe(original.version + 1);
    });

    it('references the original artifact', () => {
      const original = createArtifact({
        cycleId: 'c1',
        producedBy: 'speculator',
        type: 'propositio',
        content: makePropositio(),
      });
      const revised = supersede(original, makePropositio());
      expect(revised.references).toContain(original.id);
    });

    it('resets status to submitted', () => {
      const original: CouncilArtifact = {
        ...createArtifact({
          cycleId: 'c1',
          producedBy: 'speculator',
          type: 'propositio',
          content: makePropositio(),
          status: 'accepted',
        }),
      };
      const revised = supersede(original, makePropositio());
      expect(revised.status).toBe('submitted');
    });

    it('generates a new ID', () => {
      const original = createArtifact({
        cycleId: 'c1',
        producedBy: 'speculator',
        type: 'propositio',
        content: makePropositio(),
      });
      const revised = supersede(original, makePropositio());
      expect(revised.id).not.toBe(original.id);
    });

    it('preserves type and office', () => {
      const original = createArtifact({
        cycleId: 'c1',
        producedBy: 'contrarius',
        type: 'objectiones',
        content: makeObjectiones(),
      });
      const revised = supersede(original, makeObjectiones());
      expect(revised.type).toBe('objectiones');
      expect(revised.producedBy).toBe('contrarius');
      expect(revised.cycleId).toBe('c1');
    });
  });
});
