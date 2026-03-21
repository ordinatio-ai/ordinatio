// IHS
/**
 * Reporting Engine Module Covenant (E-06)
 *
 * Ecclesial Extension
 *
 * Dashboards, analytics, exports, and KPI tracking. Generates reports in
 * multiple formats (PDF, Excel, CSV, PowerPoint). Agents can trigger report
 * generation and provide data summaries.
 *
 * In System 1701: Report generation service with multiple export formats,
 * tax position dashboard, order analytics.
 */

import type { ModuleCovenant } from '../covenant/types';

export const REPORTING_ENGINE_COVENANT: ModuleCovenant = {
  // ---------------------------------------------------------------------------
  // Identity
  // ---------------------------------------------------------------------------
  identity: {
    id: 'reporting-engine',
    canonicalId: 'E-06',
    version: '0.1.0',
    description:
      'Report generation and analytics. Multi-format exports (PDF, Excel, CSV, PowerPoint). Template-based report definitions. KPI dashboards. Agents generate reports and provide data summaries.',
    status: 'ecclesial',
    tier: 'memory',
    dedication: 'IHS',
  },

  // ---------------------------------------------------------------------------
  // Domain Model
  // ---------------------------------------------------------------------------
  domain: {
    entities: [
      {
        name: 'ReportDefinition',
        description: 'Template defining a report — data sources, layout, filters, export format',
        hasContextLayer: false,
      },
      {
        name: 'GeneratedReport',
        description: 'A generated report instance with file, parameters used, and generation metadata',
        hasContextLayer: true,
      },
    ],

    events: [
      {
        id: 'reporting.report_generated',
        description: 'Report was generated',
        payloadShape: '{ reportId, definitionId, format, generatedBy, durationMs }',
      },
      {
        id: 'reporting.report_downloaded',
        description: 'Report was downloaded by a user',
        payloadShape: '{ reportId, downloadedBy }',
      },
    ],

    subscriptions: [],
  },

  // ---------------------------------------------------------------------------
  // Capabilities
  // ---------------------------------------------------------------------------
  capabilities: [
    // --- Observe ---
    {
      id: 'reporting.list_definitions',
      description: 'List available report templates',
      type: 'query',
      risk: 'observe',
      dataSensitivity: 'none',
      inputs: [],
      output: '{ definitions: ReportDefinition[] }',
      whenToUse: 'When checking what reports can be generated.',
    },
    {
      id: 'reporting.list_generated',
      description: 'List previously generated reports',
      type: 'query',
      risk: 'observe',
      dataSensitivity: 'internal',
      inputs: [
        { name: 'definitionId', type: 'string', required: false, description: 'Filter by report type' },
        { name: 'limit', type: 'number', required: false, description: 'Max results' },
      ],
      output: '{ reports: GeneratedReport[] }',
      whenToUse: 'When looking for previously generated reports.',
    },

    // --- Act ---
    {
      id: 'reporting.generate',
      description: 'Generate a report from a template with specified parameters',
      type: 'action',
      risk: 'act',
      dataSensitivity: 'sensitive',
      inputs: [
        { name: 'definitionId', type: 'string', required: true, description: 'Report template to use' },
        { name: 'format', type: 'string', required: true, description: 'Output format', allowedValues: ['pdf', 'xlsx', 'csv', 'pptx'] },
        { name: 'parameters', type: 'object', required: false, description: 'Report-specific parameters (date range, filters)' },
      ],
      output: '{ reportId: string, downloadUrl: string }',
      whenToUse: 'When a report needs to be generated for download or sharing.',
    },
    {
      id: 'reporting.get_summary',
      description: 'Get a data summary without generating a full report — useful for quick answers',
      type: 'query',
      risk: 'act',
      dataSensitivity: 'sensitive',
      inputs: [
        { name: 'definitionId', type: 'string', required: true, description: 'Report template for data shape' },
        { name: 'parameters', type: 'object', required: false, description: 'Filters and date range' },
      ],
      output: '{ summary: object, dataPoints: number }',
      whenToUse: 'When you need quick data without a full report — "How many orders this month?"',
    },

    // --- Govern ---
    {
      id: 'reporting.manage_definition',
      description: 'Create or modify a report template. Affects what reports the entire org can generate.',
      type: 'mutation',
      risk: 'govern',
      dataSensitivity: 'none',
      inputs: [
        { name: 'action', type: 'string', required: true, description: 'create, update, or delete', allowedValues: ['create', 'update', 'delete'] },
        { name: 'definitionId', type: 'string', required: false, description: 'Definition ID (for update/delete)' },
        { name: 'name', type: 'string', required: false, description: 'Report name' },
        { name: 'config', type: 'object', required: false, description: 'Report configuration' },
      ],
      output: '{ definitionId: string, action: string }',
      whenToUse: 'CAREFULLY. Report definitions determine what data the organization can extract.',
    },
  ],

  // ---------------------------------------------------------------------------
  // Dependencies
  // ---------------------------------------------------------------------------
  dependencies: [
    {
      moduleId: 'auth-engine',
      required: true,
      capabilities: ['auth.get_session'],
    },
    {
      moduleId: 'audit-ledger',
      required: true,
      capabilities: ['audit.record'],
    },
    {
      moduleId: 'search-engine',
      required: false,
      capabilities: ['search.query'],
    },
  ],

  // ---------------------------------------------------------------------------
  // Invariants
  // ---------------------------------------------------------------------------
  invariants: {
    alwaysTrue: [
      'Generated reports are immutable — parameters and data are frozen at generation time',
      'Every report generation is audited with actor and parameters',
      'Report data respects tenant boundaries',
      'Generated reports have an expiration — cleaned up after configurable retention period',
    ],
    neverHappens: [
      'A generated report is modified after creation',
      'Report data includes information from another tenant',
      'Reports are generated without authentication',
    ],
  },

  // ---------------------------------------------------------------------------
  // Health Check
  // ---------------------------------------------------------------------------
  healthCheck: async () => ({
    healthy: true,
    message: 'Reporting Engine health check — stub implementation',
    checkedAt: new Date(),
  }),
};
