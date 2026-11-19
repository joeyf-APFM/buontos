import { describe, it, expect } from 'vitest';
import { entityPath, humanize } from './recent-activity';

describe('recent activity labels', () => {
  it('reads the change log\'s codes as words', () => {
    expect(humanize('MATURITY_CHANGED')).toBe('Maturity changed');
    expect(humanize('DataProduct')).toBe('Data product');
    expect(humanize('data_contract')).toBe('Data contract');
  });

  it('links an entity under either spelling of its type', () => {
    expect(entityPath('data_product', 'p1')).toBe('/data-products/p1');
    expect(entityPath('DataProduct', 'p1')).toBe('/data-products/p1');
    expect(entityPath('DataContract', 'c1')).toBe('/data-contracts/c1');
    expect(entityPath('data_domain', 'd1')).toBe('/settings/data-domains/d1');
  });

  it('gives no link to a type without a page, or an entry without an id', () => {
    expect(entityPath('SemanticLink', 'x')).toBeNull();
    expect(entityPath('data_product', null)).toBeNull();
  });
});
