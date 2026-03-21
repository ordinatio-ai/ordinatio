// IHS
import { describe, it, expect } from 'vitest';
import { generateModuleScaffold } from './module-scaffolder';
import type { ModuleIdentity } from '../covenant/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeIdentity(overrides: Partial<ModuleIdentity> = {}): ModuleIdentity {
  return {
    id: 'test-engine',
    canonicalId: 'C-20',
    version: '0.1.0',
    description: 'A test engine for scaffold verification',
    status: 'canonical',
    tier: 'being',
    dedication: 'IHS',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Module Scaffolder', () => {
  describe('generateModuleScaffold', () => {
    it('generates correct package name and directory', () => {
      const scaffold = generateModuleScaffold(makeIdentity());

      expect(scaffold.packageName).toBe('@ordinatio/test-engine');
      expect(scaffold.packageDir).toBe('packages/test-engine');
    });

    it('generates 9 total files (8 required + 1 optional)', () => {
      const scaffold = generateModuleScaffold(makeIdentity());

      expect(scaffold.totalFiles).toBe(9);
      expect(scaffold.requiredFiles).toBe(8);
      expect(scaffold.files).toHaveLength(9);
    });

    it('preserves the identity in the scaffold', () => {
      const identity = makeIdentity();
      const scaffold = generateModuleScaffold(identity);

      expect(scaffold.identity).toEqual(identity);
    });

    it('all files have IHS marker', () => {
      const scaffold = generateModuleScaffold(makeIdentity());

      const tsFiles = scaffold.files.filter(f => f.path.endsWith('.ts'));
      for (const file of tsFiles) {
        expect(file.content).toContain('// IHS');
      }
    });

    it('package.json has correct name', () => {
      const scaffold = generateModuleScaffold(makeIdentity());
      const pkgFile = scaffold.files.find(f => f.path.endsWith('package.json'));

      expect(pkgFile).toBeDefined();
      const pkg = JSON.parse(pkgFile!.content);
      expect(pkg.name).toBe('@ordinatio/test-engine');
      expect(pkg.dependencies['@ordinatio/core']).toBe('workspace:*');
    });

    it('covenant file has identity pre-filled', () => {
      const scaffold = generateModuleScaffold(makeIdentity({
        id: 'notification-engine',
        canonicalId: 'C-21',
        description: 'Notification delivery and channel management',
      }));

      const covenantFile = scaffold.files.find(f => f.path.endsWith('covenant.ts'));
      expect(covenantFile).toBeDefined();
      expect(covenantFile!.content).toContain("id: 'notification-engine'");
      expect(covenantFile!.content).toContain("canonicalId: 'C-21'");
      expect(covenantFile!.content).toContain('NOTIFICATION_ENGINE_COVENANT');
    });

    it('error registry has correct module prefix', () => {
      const scaffold = generateModuleScaffold(makeIdentity({ id: 'search-engine' }));
      const errorsFile = scaffold.files.find(f => f.path.endsWith('errors.ts'));

      expect(errorsFile).toBeDefined();
      expect(errorsFile!.content).toContain('SEARCH_ENGINE_ERRORS');
      expect(errorsFile!.content).toContain("module: 'search-engine'");
    });

    it('covenant test imports the correct constant', () => {
      const scaffold = generateModuleScaffold(makeIdentity({ id: 'audit-ledger' }));
      const testFile = scaffold.files.find(f => f.path.includes('__tests__/covenant.test.ts'));

      expect(testFile).toBeDefined();
      expect(testFile!.content).toContain('AUDIT_LEDGER_COVENANT');
      expect(testFile!.content).toContain('validateCovenant');
    });

    it('README has module title and metadata', () => {
      const scaffold = generateModuleScaffold(makeIdentity({
        id: 'workflow-engine',
        canonicalId: 'C-05',
        description: 'Orchestrates multi-step business processes',
      }));

      const readme = scaffold.files.find(f => f.path.endsWith('README.md'));
      expect(readme).toBeDefined();
      expect(readme!.content).toContain('WorkflowEngine');
      expect(readme!.content).toContain('C-05');
      expect(readme!.content).toContain('Orchestrates multi-step business processes');
    });

    it('all required files are marked as required', () => {
      const scaffold = generateModuleScaffold(makeIdentity());
      const required = scaffold.files.filter(f => f.required);

      expect(required).toHaveLength(8);
      // Check key files are in the required set
      const requiredPaths = required.map(f => f.path);
      expect(requiredPaths.some(p => p.endsWith('package.json'))).toBe(true);
      expect(requiredPaths.some(p => p.endsWith('index.ts'))).toBe(true);
      expect(requiredPaths.some(p => p.endsWith('covenant.ts'))).toBe(true);
      expect(requiredPaths.some(p => p.endsWith('errors.ts'))).toBe(true);
    });

    it('optional service file is marked as not required', () => {
      const scaffold = generateModuleScaffold(makeIdentity());
      const optional = scaffold.files.filter(f => !f.required);

      expect(optional).toHaveLength(1);
      expect(optional[0].path).toContain('service.ts');
    });

    it('generates different scaffolds for ecclesial modules', () => {
      const scaffold = generateModuleScaffold(makeIdentity({
        id: 'bespoke-orders',
        canonicalId: 'E-01',
        status: 'ecclesial',
      }));

      expect(scaffold.packageName).toBe('@ordinatio/bespoke-orders');
      const covenant = scaffold.files.find(f => f.path.endsWith('covenant.ts'));
      expect(covenant!.content).toContain("status: 'ecclesial'");
      expect(covenant!.content).toContain("canonicalId: 'E-01'");
    });

    it('every file has a purpose description', () => {
      const scaffold = generateModuleScaffold(makeIdentity());

      for (const file of scaffold.files) {
        expect(file.purpose).toBeTruthy();
        expect(file.purpose.length).toBeGreaterThan(5);
      }
    });
  });
});
