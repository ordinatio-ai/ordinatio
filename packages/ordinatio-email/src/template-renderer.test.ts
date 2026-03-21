// ===========================================
// EMAIL ENGINE — TEMPLATE RENDERER TESTS
// ===========================================

import {
  renderTemplate,
  extractPlaceholders,
  validateTemplate,
  buildVariablesFromContext,
  AVAILABLE_VARIABLES,
  SAMPLE_VARIABLES,
} from './template-renderer';

// ===========================================
// renderTemplate
// ===========================================

describe('renderTemplate', () => {
  it('replaces a single placeholder with its value', () => {
    const result = renderTemplate('Hello, {{firstName}}!', { firstName: 'John' });
    expect(result).toBe('Hello, John!');
  });

  it('replaces multiple distinct placeholders', () => {
    const result = renderTemplate(
      'Dear {{firstName}} {{lastName}}, your order {{orderNumber}} is ready.',
      { firstName: 'John', lastName: 'Smith', orderNumber: 'ORD-2024-001' }
    );
    expect(result).toBe('Dear John Smith, your order ORD-2024-001 is ready.');
  });

  it('replaces the same placeholder multiple times', () => {
    const result = renderTemplate(
      '{{firstName}} said hello. Thank you, {{firstName}}.',
      { firstName: 'Jane' }
    );
    expect(result).toBe('Jane said hello. Thank you, Jane.');
  });

  it('leaves an undefined variable placeholder intact', () => {
    const result = renderTemplate('Hello, {{firstName}} {{lastName}}!', {
      firstName: 'John',
    });
    expect(result).toBe('Hello, John {{lastName}}!');
  });

  it('leaves an empty-string variable placeholder intact', () => {
    const result = renderTemplate('Hello, {{firstName}}!', { firstName: '' });
    expect(result).toBe('Hello, {{firstName}}!');
  });

  it('leaves all placeholders intact when no variables are provided', () => {
    const result = renderTemplate('Hello, {{firstName}} {{lastName}}!', {});
    expect(result).toBe('Hello, {{firstName}} {{lastName}}!');
  });

  it('returns the original string unchanged when there are no placeholders', () => {
    const result = renderTemplate('No placeholders here.', { firstName: 'John' });
    expect(result).toBe('No placeholders here.');
  });

  it('handles an empty template string', () => {
    const result = renderTemplate('', { firstName: 'John' });
    expect(result).toBe('');
  });

  it('handles multiline templates', () => {
    const template = 'Hi {{firstName}},\n\nYour order {{orderNumber}} is confirmed.\n\nRegards,\n{{clothierName}}';
    const result = renderTemplate(template, {
      firstName: 'John',
      orderNumber: 'ORD-001',
      clothierName: 'Max',
    });
    expect(result).toBe('Hi John,\n\nYour order ORD-001 is confirmed.\n\nRegards,\nMax');
  });

  it('treats variable names as case-sensitive ({{Name}} vs {{name}})', () => {
    const result = renderTemplate('Hello {{Name}}', { name: 'John' });
    // {{Name}} does not match key "name" — left intact
    expect(result).toBe('Hello {{Name}}');
  });

  it('handles a placeholder whose key contains only word characters', () => {
    // Non-word characters inside braces should not be treated as a placeholder
    const result = renderTemplate('{{valid}} and {{in-valid}}', { valid: 'yes' });
    expect(result).toBe('yes and {{in-valid}}');
  });

  it('does not replace extra variables that are not referenced in the template', () => {
    const result = renderTemplate('Hello, {{firstName}}!', {
      firstName: 'John',
      lastName: 'Smith',
      orderNumber: 'ORD-001',
    });
    expect(result).toBe('Hello, John!');
  });
});

// ===========================================
// extractPlaceholders
// ===========================================

describe('extractPlaceholders', () => {
  it('extracts a single placeholder', () => {
    const result = extractPlaceholders('Hello, {{firstName}}!');
    expect(result).toEqual(['firstName']);
  });

  it('extracts multiple distinct placeholders', () => {
    const result = extractPlaceholders(
      'Dear {{firstName}} {{lastName}}, order {{orderNumber}}.'
    );
    expect(result).toEqual(['firstName', 'lastName', 'orderNumber']);
  });

  it('deduplicates repeated placeholders', () => {
    const result = extractPlaceholders(
      '{{firstName}} said hello. Thank you, {{firstName}}.'
    );
    expect(result).toEqual(['firstName']);
  });

  it('returns an empty array when there are no placeholders', () => {
    const result = extractPlaceholders('No placeholders here.');
    expect(result).toEqual([]);
  });

  it('returns an empty array for an empty string', () => {
    const result = extractPlaceholders('');
    expect(result).toEqual([]);
  });

  it('preserves the order of first occurrence', () => {
    const result = extractPlaceholders(
      '{{orderNumber}} for {{firstName}} from {{companyName}}.'
    );
    expect(result).toEqual(['orderNumber', 'firstName', 'companyName']);
  });

  it('ignores patterns with non-word characters (not valid placeholders)', () => {
    // {{in-valid}} contains a hyphen — regex \w+ won't match
    const result = extractPlaceholders('{{valid}} and {{in-valid}}');
    expect(result).toEqual(['valid']);
  });

  it('handles a multiline template', () => {
    const template = 'Hi {{firstName}},\n\nOrder: {{orderNumber}}\n\nRegards, {{clothierName}}';
    expect(extractPlaceholders(template)).toEqual([
      'firstName',
      'orderNumber',
      'clothierName',
    ]);
  });
});

// ===========================================
// validateTemplate
// ===========================================

describe('validateTemplate', () => {
  it('returns valid=true and empty missing array when all placeholders are satisfied', () => {
    const result = validateTemplate('Hello {{firstName}} {{lastName}}', {
      firstName: 'John',
      lastName: 'Smith',
    });
    expect(result).toEqual({ valid: true, missing: [] });
  });

  it('returns valid=false with the missing key when a placeholder has no value', () => {
    const result = validateTemplate('Hello {{firstName}} {{lastName}}', {
      firstName: 'John',
    });
    expect(result.valid).toBe(false);
    expect(result.missing).toContain('lastName');
    expect(result.missing).toHaveLength(1);
  });

  it('reports a placeholder as missing when its value is an empty string', () => {
    const result = validateTemplate('Hello {{firstName}}', { firstName: '' });
    expect(result.valid).toBe(false);
    expect(result.missing).toEqual(['firstName']);
  });

  it('returns valid=true for a template with no placeholders', () => {
    const result = validateTemplate('No placeholders here.', {});
    expect(result).toEqual({ valid: true, missing: [] });
  });

  it('returns valid=true for an empty template', () => {
    const result = validateTemplate('', {});
    expect(result).toEqual({ valid: true, missing: [] });
  });

  it('lists all missing placeholders when none are provided', () => {
    const result = validateTemplate('{{firstName}} {{lastName}}', {});
    expect(result.valid).toBe(false);
    expect(result.missing).toEqual(expect.arrayContaining(['firstName', 'lastName']));
    expect(result.missing).toHaveLength(2);
  });

  it('does not list duplicate placeholders in missing more than once', () => {
    const result = validateTemplate('{{firstName}} and {{firstName}} again', {});
    expect(result.valid).toBe(false);
    expect(result.missing).toEqual(['firstName']);
  });

  it('ignores extra variables not referenced in the template', () => {
    const result = validateTemplate('Hello {{firstName}}', {
      firstName: 'John',
      lastName: 'Smith', // extra — should not affect validity
    });
    expect(result).toEqual({ valid: true, missing: [] });
  });
});

// ===========================================
// buildVariablesFromContext
// ===========================================

describe('buildVariablesFromContext', () => {
  it('always includes companyName as 1701 Bespoke', () => {
    const result = buildVariablesFromContext();
    expect(result.companyName).toBe('1701 Bespoke');
  });

  it('returns only companyName when called with no arguments', () => {
    const result = buildVariablesFromContext();
    expect(Object.keys(result)).toEqual(['companyName']);
  });

  it('returns only companyName when all arguments are null', () => {
    const result = buildVariablesFromContext(null, null, null);
    expect(Object.keys(result)).toEqual(['companyName']);
  });

  describe('client context', () => {
    it('sets clientName from client.name', () => {
      const result = buildVariablesFromContext({ name: 'John Smith' });
      expect(result.clientName).toBe('John Smith');
    });

    it('splits a two-part name into firstName and lastName', () => {
      const result = buildVariablesFromContext({ name: 'John Smith' });
      expect(result.firstName).toBe('John');
      expect(result.lastName).toBe('Smith');
    });

    it('sets firstName and leaves lastName undefined for a single-word name', () => {
      const result = buildVariablesFromContext({ name: 'Cher' });
      expect(result.firstName).toBe('Cher');
      expect(result.lastName).toBeUndefined();
    });

    it('joins all remaining parts into lastName for names with more than two words', () => {
      const result = buildVariablesFromContext({ name: 'Mary Jane Watson' });
      expect(result.firstName).toBe('Mary');
      expect(result.lastName).toBe('Jane Watson');
    });

    it('sets clientEmail from client.email', () => {
      const result = buildVariablesFromContext({ email: 'john@example.com' });
      expect(result.clientEmail).toBe('john@example.com');
    });

    it('sets clientPhone from client.phone', () => {
      const result = buildVariablesFromContext({ phone: '(555) 123-4567' });
      expect(result.clientPhone).toBe('(555) 123-4567');
    });

    it('does not set name-derived keys when client.name is absent', () => {
      const result = buildVariablesFromContext({ email: 'john@example.com' });
      expect(result.clientName).toBeUndefined();
      expect(result.firstName).toBeUndefined();
      expect(result.lastName).toBeUndefined();
    });
  });

  describe('order context', () => {
    it('sets orderNumber from order.orderNumber', () => {
      const result = buildVariablesFromContext(null, { orderNumber: 'ORD-2024-001' });
      expect(result.orderNumber).toBe('ORD-2024-001');
    });

    it('sets orderStatus from order.status', () => {
      const result = buildVariablesFromContext(null, { status: 'In Production' });
      expect(result.orderStatus).toBe('In Production');
    });

    it('sets fabricCode from order.fabricCode', () => {
      const result = buildVariablesFromContext(null, { fabricCode: 'A754-21' });
      expect(result.fabricCode).toBe('A754-21');
    });

    it('sets garmentType from order.garmentType', () => {
      const result = buildVariablesFromContext(null, { garmentType: '3-Piece Suit' });
      expect(result.garmentType).toBe('3-Piece Suit');
    });

    it('formats a Date object for deliveryDate using en-US locale', () => {
      // Use a fixed UTC date to avoid timezone differences in the formatted output
      const date = new Date('2026-03-15T12:00:00Z');
      const result = buildVariablesFromContext(null, { deliveryDate: date });
      // The exact string depends on the locale implementation, so verify it contains expected parts
      expect(result.deliveryDate).toContain('2026');
      expect(result.deliveryDate).toContain('15');
    });

    it('passes through a string deliveryDate unchanged', () => {
      const result = buildVariablesFromContext(null, { deliveryDate: 'March 15, 2026' });
      expect(result.deliveryDate).toBe('March 15, 2026');
    });

    it('does not set deliveryDate when order.deliveryDate is absent', () => {
      const result = buildVariablesFromContext(null, { orderNumber: 'ORD-001' });
      expect(result.deliveryDate).toBeUndefined();
    });
  });

  describe('clothier context', () => {
    it('sets clothierName from clothier.name', () => {
      const result = buildVariablesFromContext(null, null, { name: 'Max' });
      expect(result.clothierName).toBe('Max');
    });

    it('sets clothierEmail from clothier.email', () => {
      const result = buildVariablesFromContext(null, null, { email: 'max@1701bespoke.com' });
      expect(result.clothierEmail).toBe('max@1701bespoke.com');
    });
  });

  it('merges all three contexts together', () => {
    const result = buildVariablesFromContext(
      { name: 'John Smith', email: 'john@example.com', phone: '(555) 123-4567' },
      { orderNumber: 'ORD-001', status: 'In Production', fabricCode: 'A754-21', garmentType: '3-Piece Suit', deliveryDate: 'March 15, 2026' },
      { name: 'Max', email: 'max@1701bespoke.com' }
    );

    expect(result.clientName).toBe('John Smith');
    expect(result.firstName).toBe('John');
    expect(result.lastName).toBe('Smith');
    expect(result.clientEmail).toBe('john@example.com');
    expect(result.clientPhone).toBe('(555) 123-4567');
    expect(result.orderNumber).toBe('ORD-001');
    expect(result.orderStatus).toBe('In Production');
    expect(result.fabricCode).toBe('A754-21');
    expect(result.garmentType).toBe('3-Piece Suit');
    expect(result.deliveryDate).toBe('March 15, 2026');
    expect(result.clothierName).toBe('Max');
    expect(result.clothierEmail).toBe('max@1701bespoke.com');
    expect(result.companyName).toBe('1701 Bespoke');
  });

  it('produces variables that renderTemplate can consume correctly', () => {
    const variables = buildVariablesFromContext(
      { name: 'Jane Doe', email: 'jane@example.com' },
      { orderNumber: 'ORD-999', status: 'Ready' },
      { name: 'Max' }
    );
    const output = renderTemplate(
      'Hi {{firstName}}, order {{orderNumber}} is {{orderStatus}}. – {{clothierName}}',
      variables
    );
    expect(output).toBe('Hi Jane, order ORD-999 is Ready. – Max');
  });
});

// ===========================================
// AVAILABLE_VARIABLES
// ===========================================

describe('AVAILABLE_VARIABLES', () => {
  it('is an array', () => {
    expect(Array.isArray(AVAILABLE_VARIABLES)).toBe(true);
  });

  it('contains at least one category', () => {
    expect(AVAILABLE_VARIABLES.length).toBeGreaterThan(0);
  });

  it('contains a Client category', () => {
    const client = AVAILABLE_VARIABLES.find((c) => c.category === 'Client');
    expect(client).toBeDefined();
  });

  it('contains an Order category', () => {
    const order = AVAILABLE_VARIABLES.find((c) => c.category === 'Order');
    expect(order).toBeDefined();
  });

  it('contains a Business category', () => {
    const business = AVAILABLE_VARIABLES.find((c) => c.category === 'Business');
    expect(business).toBeDefined();
  });

  it('has the expected Client variables', () => {
    const client = AVAILABLE_VARIABLES.find((c) => c.category === 'Client')!;
    const keys = client.variables.map((v) => v.key);
    expect(keys).toContain('clientName');
    expect(keys).toContain('firstName');
    expect(keys).toContain('lastName');
    expect(keys).toContain('clientEmail');
    expect(keys).toContain('clientPhone');
  });

  it('has the expected Order variables', () => {
    const order = AVAILABLE_VARIABLES.find((c) => c.category === 'Order')!;
    const keys = order.variables.map((v) => v.key);
    expect(keys).toContain('orderNumber');
    expect(keys).toContain('orderStatus');
    expect(keys).toContain('fabricCode');
    expect(keys).toContain('garmentType');
    expect(keys).toContain('deliveryDate');
  });

  it('has the expected Business variables', () => {
    const business = AVAILABLE_VARIABLES.find((c) => c.category === 'Business')!;
    const keys = business.variables.map((v) => v.key);
    expect(keys).toContain('companyName');
    expect(keys).toContain('clothierName');
    expect(keys).toContain('clothierEmail');
  });

  it('every variable entry has a non-empty key, label, and example', () => {
    for (const category of AVAILABLE_VARIABLES) {
      for (const variable of category.variables) {
        expect(typeof variable.key).toBe('string');
        expect(variable.key.length).toBeGreaterThan(0);
        expect(typeof variable.label).toBe('string');
        expect(variable.label.length).toBeGreaterThan(0);
        expect(typeof variable.example).toBe('string');
        expect(variable.example.length).toBeGreaterThan(0);
      }
    }
  });
});

// ===========================================
// SAMPLE_VARIABLES
// ===========================================

describe('SAMPLE_VARIABLES', () => {
  it('is a plain object (record)', () => {
    expect(typeof SAMPLE_VARIABLES).toBe('object');
    expect(SAMPLE_VARIABLES).not.toBeNull();
    expect(Array.isArray(SAMPLE_VARIABLES)).toBe(false);
  });

  it('contains every key from AVAILABLE_VARIABLES', () => {
    const allKeys = AVAILABLE_VARIABLES.flatMap((c) => c.variables.map((v) => v.key));
    for (const key of allKeys) {
      expect(SAMPLE_VARIABLES).toHaveProperty(key);
      expect(SAMPLE_VARIABLES[key]).toBeTruthy();
    }
  });

  it('has string values for all entries', () => {
    for (const [, value] of Object.entries(SAMPLE_VARIABLES)) {
      if (value !== undefined) {
        expect(typeof value).toBe('string');
      }
    }
  });

  it('can be used directly with renderTemplate to fill every placeholder', () => {
    const template = Object.keys(SAMPLE_VARIABLES)
      .map((k) => `{{${k}}}`)
      .join(' ');
    const rendered = renderTemplate(template, SAMPLE_VARIABLES);
    // No leftover {{...}} placeholders should remain
    expect(rendered).not.toMatch(/\{\{\w+\}\}/);
  });

  it('validates cleanly against a template using all known keys', () => {
    const template = Object.keys(SAMPLE_VARIABLES)
      .map((k) => `{{${k}}}`)
      .join(' ');
    const { valid, missing } = validateTemplate(template, SAMPLE_VARIABLES);
    expect(valid).toBe(true);
    expect(missing).toHaveLength(0);
  });
});
