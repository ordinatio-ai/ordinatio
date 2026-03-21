// IHS
/**
 * Finance Engine Module Covenant (E-01)
 *
 * Ecclesial Extension
 *
 * Full accounting: transaction management, categorization, tax position,
 * forecasting, advisory, bank integration. Every business that handles money
 * needs financial tracking. Builds on C-18 Payments (when built).
 *
 * In System 1701: Tax module with 9 phases — import, categorization (270+ rules),
 * calculator (1120-S, 1040), compliance, tax position, scenario engine,
 * forecasting, advisory, Plaid bank sync.
 */

import type { ModuleCovenant } from '../covenant/types';

export const FINANCE_ENGINE_COVENANT: ModuleCovenant = {
  // ---------------------------------------------------------------------------
  // Identity
  // ---------------------------------------------------------------------------
  identity: {
    id: 'finance-engine',
    canonicalId: 'E-01',
    version: '0.1.0',
    description:
      'Financial management — transaction import, categorization, tax position, forecasting, advisory. Multi-format import (CSV, QBO, Excel). 270+ categorization rules. Bank integration via Plaid. What-if scenario analysis.',
    status: 'ecclesial',
    tier: 'governance',
    dedication: 'IHS',
  },

  // ---------------------------------------------------------------------------
  // Domain Model
  // ---------------------------------------------------------------------------
  domain: {
    entities: [
      {
        name: 'Transaction',
        description: 'Financial transaction with amount, date, description, category, account, and tax classification',
        hasContextLayer: true,
      },
      {
        name: 'CategorizationRule',
        description: 'Pattern-matching rule for auto-categorizing transactions by vendor/description',
        hasContextLayer: false,
      },
      {
        name: 'TaxYear',
        description: 'Tax year aggregation with income, expenses, deductions, and calculated tax',
        hasContextLayer: true,
      },
      {
        name: 'BankConnection',
        description: 'Connected bank account via Plaid with sync state',
        hasContextLayer: false,
      },
    ],

    events: [
      {
        id: 'finance.transactions_imported',
        description: 'Batch of transactions imported',
        payloadShape: '{ count, source, accountName, duplicatesSkipped }',
      },
      {
        id: 'finance.transaction_categorized',
        description: 'Transaction received a category (manual or auto)',
        payloadShape: '{ transactionId, category, method: "auto" | "manual" | "ai" }',
      },
      {
        id: 'finance.bank_synced',
        description: 'Bank account sync completed via Plaid',
        payloadShape: '{ connectionId, newTransactions: number, accountName }',
      },
      {
        id: 'finance.tax_position_changed',
        description: 'Tax position recalculated due to new data',
        payloadShape: '{ year, previousTaxOwed, newTaxOwed, delta }',
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
      id: 'finance.get_tax_position',
      description: 'Get real-time tax position for a year — income, COGS, expenses, deductions, tax owed',
      type: 'query',
      risk: 'observe',
      dataSensitivity: 'critical',
      inputs: [
        { name: 'year', type: 'number', required: true, description: 'Tax year' },
      ],
      output: '{ revenue, cogs, grossProfit, expenses, netIncome, taxOwed, effectiveRate }',
      whenToUse: 'When you need to understand the current financial position for a tax year.',
    },
    {
      id: 'finance.list_transactions',
      description: 'List transactions with filtering by category, date range, account, and amount',
      type: 'query',
      risk: 'observe',
      dataSensitivity: 'critical',
      inputs: [
        { name: 'year', type: 'number', required: false, description: 'Filter by tax year' },
        { name: 'category', type: 'string', required: false, description: 'Filter by category' },
        { name: 'account', type: 'string', required: false, description: 'Filter by account' },
        { name: 'uncategorized', type: 'boolean', required: false, description: 'Only uncategorized' },
        { name: 'page', type: 'number', required: false, description: 'Page number' },
      ],
      output: '{ transactions: Transaction[], total: number, hasMore: boolean }',
      whenToUse: 'When reviewing financial transactions or looking for uncategorized items.',
    },
    {
      id: 'finance.get_forecast',
      description: 'Get revenue and expense forecast based on historical trends',
      type: 'query',
      risk: 'observe',
      dataSensitivity: 'critical',
      inputs: [
        { name: 'months', type: 'number', required: false, description: 'Months to forecast (default 12)' },
      ],
      output: '{ projections: { month: string, revenue: number, expenses: number, net: number }[] }',
      whenToUse: 'When planning ahead — revenue projections, expense trends, cash flow estimates.',
    },
    {
      id: 'finance.get_advisory',
      description: 'Get tax advisory recommendations based on current position',
      type: 'query',
      risk: 'observe',
      dataSensitivity: 'critical',
      inputs: [],
      output: '{ recommendations: { priority: string, strategy: string, estimatedSavings: number }[] }',
      whenToUse: 'When looking for tax optimization strategies.',
    },
    {
      id: 'finance.get_filing_deadlines',
      description: 'Get upcoming tax filing deadlines',
      type: 'query',
      risk: 'observe',
      dataSensitivity: 'internal',
      inputs: [],
      output: '{ deadlines: { form: string, dueDate: string, status: string }[] }',
      whenToUse: 'When checking what tax filings are due.',
    },

    // --- Act ---
    {
      id: 'finance.import_transactions',
      description: 'Import transactions from CSV, QBO, or Excel file',
      type: 'action',
      risk: 'act',
      dataSensitivity: 'critical',
      inputs: [
        { name: 'source', type: 'string', required: true, description: 'Format: csv, qbo, xlsx' },
        { name: 'accountName', type: 'string', required: true, description: 'Account name' },
        { name: 'data', type: 'string', required: true, description: 'File content' },
      ],
      output: '{ imported: number, duplicatesSkipped: number, autoCategorized: number }',
      whenToUse: 'When new financial data needs to be imported into the system.',
    },
    {
      id: 'finance.categorize',
      description: 'Categorize a transaction or batch of similar transactions',
      type: 'mutation',
      risk: 'act',
      dataSensitivity: 'sensitive',
      inputs: [
        { name: 'transactionId', type: 'string', required: true, description: 'Transaction to categorize' },
        { name: 'category', type: 'string', required: true, description: 'Target category' },
        { name: 'applyToSimilar', type: 'boolean', required: false, description: 'Apply to all similar transactions' },
      ],
      output: '{ categorized: number }',
      whenToUse: 'When a transaction needs a category assignment or correction.',
    },
    {
      id: 'finance.create_rule',
      description: 'Create a categorization rule for auto-categorizing future transactions',
      type: 'mutation',
      risk: 'act',
      dataSensitivity: 'internal',
      inputs: [
        { name: 'pattern', type: 'string', required: true, description: 'Vendor/description pattern' },
        { name: 'category', type: 'string', required: true, description: 'Target category' },
      ],
      output: '{ ruleId: string }',
      whenToUse: 'When a recurring vendor should always be categorized the same way.',
    },
    {
      id: 'finance.run_scenario',
      description: 'Run a what-if tax scenario — add deduction, change income, reclassify expenses',
      type: 'query',
      risk: 'act',
      dataSensitivity: 'critical',
      inputs: [
        { name: 'changes', type: 'object[]', required: true, description: 'Scenario changes to apply' },
      ],
      output: '{ baseline: object, adjusted: object, delta: object, totalSavings: number }',
      whenToUse: 'When exploring "what if" tax scenarios before making real changes.',
    },

    // --- Govern ---
    {
      id: 'finance.generate_cpa_package',
      description: 'Generate a CPA handoff package with all tax data for filing',
      type: 'action',
      risk: 'govern',
      dataSensitivity: 'critical',
      inputs: [
        { name: 'years', type: 'number[]', required: true, description: 'Tax years to include' },
      ],
      output: '{ packageId: string, years: number[], warnings: string[] }',
      whenToUse: 'When tax data is ready to be handed off to a CPA for filing.',
      pitfalls: ['Ensure all transactions are categorized before generating — uncategorized items are flagged as warnings'],
    },
  ],

  // ---------------------------------------------------------------------------
  // Dependencies
  // ---------------------------------------------------------------------------
  dependencies: [
    {
      moduleId: 'entity-registry',
      required: true,
      capabilities: ['entity.get'],
    },
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
      'Imported transactions are deduplicated by hash (date + description + amount + account)',
      'Tax position recalculates automatically when transactions change',
      'Auto-categorization runs on every import',
      'Financial data is tenant-scoped — never leaks across organizations',
      'Every categorization is auditable (who, when, manual vs auto vs AI)',
    ],
    neverHappens: [
      'Duplicate transactions are imported (hash dedup prevents this)',
      'Financial data crosses tenant boundaries',
      'A transaction is silently recategorized without audit trail',
      'Tax calculations use stale data — always recalculates from source',
    ],
  },

  // ---------------------------------------------------------------------------
  // Health Check
  // ---------------------------------------------------------------------------
  healthCheck: async () => ({
    healthy: true,
    message: 'Finance Engine health check — stub implementation',
    checkedAt: new Date(),
  }),
};
