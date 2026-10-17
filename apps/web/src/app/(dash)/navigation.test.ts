import { describe, expect, it } from 'vitest';
import { NAV_SECTIONS, breadcrumbFor } from './navigation';

/**
 * The console's pages, as the shell knows them.
 *
 * The rail groups `NAV_SECTIONS` under their heading and the top bar reads its
 * breadcrumb out of the same field, so these assertions are about one registry with
 * two readers rather than about two lists that happen to agree today.
 */
describe('the console\u2019s pages', () => {
  it('names each page and the section it sits in', () => {
    expect(breadcrumbFor('/admin')).toEqual({ group: 'Dashboard', label: 'Overview' });
    expect(breadcrumbFor('/admin/products')).toEqual({ group: 'Catalog', label: 'Products' });
  });

  it('says nothing for a path it was never told about', () => {
    // Null rather than a segment title-cased from the path: the shell claiming to know
    // a page it has not been told about is the failure mode this avoids.
    expect(breadcrumbFor('/admin/orders')).toBeNull();
    expect(breadcrumbFor('/dashboard')).toBeNull();
  });

  it('gives every entry a crumb naming its own group and label', () => {
    for (const { group, entries } of NAV_SECTIONS) {
      for (const { href, label } of entries) {
        expect(breadcrumbFor(href), `the crumb for ${href}`).toEqual({ group, label });
      }
    }
  });

  it('lists the two pages that exist, once each, under a heading each', () => {
    const hrefs = NAV_SECTIONS.flatMap(({ entries }) => entries.map(({ href }) => href));

    expect(hrefs).toEqual(['/admin', '/admin/products']);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(NAV_SECTIONS.map(({ group }) => group)).toEqual(['Dashboard', 'Catalog']);
    expect(NAV_SECTIONS.every(({ entries }) => entries.length > 0)).toBe(true);
  });
});
