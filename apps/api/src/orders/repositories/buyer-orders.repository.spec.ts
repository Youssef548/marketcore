import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * SRS-FR-BORD-003 / RULE-BORD-001 is a statement about where a filter comes from,
 * so it is checked where it lives. The e2e suite proves the behaviour; this keeps
 * a later edit from "fixing" a query by reaching for the tenant filter.
 */
describe('BuyerOrdersRepository (structure)', () => {
  const source = readFileSync(join(__dirname, 'buyer-orders.repository.ts'), 'utf8');

  it('composes every query from buyerScope', () => {
    expect(source.match(/buyerScope\(buyer\)/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('never uses tenantScope', () => {
    expect(source).not.toContain('tenantScope');
  });
});
