import { describe, expect, it } from 'vitest';
import { pageTitle } from './page-title';

describe('the page title', () => {
  it('names the page the console path belongs to', () => {
    expect(pageTitle('/admin')).toBe('Overview');
    expect(pageTitle('/admin/products')).toBe('Products');
  });

  it('says nothing rather than guessing for a path it does not know', () => {
    // Null is the honest answer: a title invented from a path segment would be the
    // shell claiming to know a page it has never been told about.
    expect(pageTitle('/admin/orders')).toBeNull();
  });
});
