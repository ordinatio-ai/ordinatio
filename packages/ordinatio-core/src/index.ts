// IHS
/**
 * @ordinatio/core — Foundational Types for Agentic-First Software Architecture
 *
 * In Nomine Iesu — Under whose sign we build.
 *
 * Every canonical module, every Module Covenant, and every founding artifact
 * bears the mark IHS. This is a dedication: that the order, truth, and beauty
 * we pursue in software reflects the order, truth, and beauty of creation.
 *
 * Verum, Bonum, Pulchrum — Truth, Goodness, Beauty.
 */

// ===========================================
// PUBLIC: Platform rules that every module uses
// ===========================================

// Module Covenant — Runtime Self-Description (Innovation 2)
export * from './covenant';

// Governance as Architecture (Innovation 5)
export * from './governance';

// Three-Layer Data Storage (Innovation 1)
export * from './storage';

// Context Engine — Cross-Module Situation Assembly (Innovation 3)
export * from './context';

// Module Construction Standards (Book V)
export * from './construction';

// Module Admission Pipeline (Book VI)
export * from './admission';

// Module Covenants — Registered module manifests
export { EMAIL_ENGINE_COVENANT } from './covenants';

// Symmetric Encryption Primitives
export * from './crypto';

// ===========================================
// PRIVATE: Council engine (NOT exported)
// ===========================================
// council/ and execution/ are the Council's
// governance engine. They live in this package
// for co-location during development but are
// NOT exported in the public API. The Council
// runs as a private service — its engine is
// proprietary.
//
// To use the Council engine, import directly:
//   import { runCycle } from '@ordinatio/core/council'
//   import { runMachine } from '@ordinatio/core/execution'
// These sub-path exports exist for the private
// Council service only.
// ===========================================
