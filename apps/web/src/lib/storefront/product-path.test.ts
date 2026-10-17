import { describe, expect, it } from 'vitest';
import { productIdFromSlug, productPath } from './product-path';

const id = '66666666-6666-4666-8666-666666666666';

describe('product URLs (D76)', () => {
  it('is /p/{name-slug}-{id}', () => {
    expect(productPath({ id, name: 'Nile Cotton Shirt' })).toBe(`/p/nile-cotton-shirt-${id}`);
  });

  it('reads only the id: a renamed product keeps working at its old URL', () => {
    expect(productIdFromSlug(`nile-cotton-shirt-${id}`)).toBe(id);
    expect(productIdFromSlug(`anything-else-${id}`)).toBe(id);
  });

  it('survives a name with nothing sluggable in it', () => {
    expect(productPath({ id, name: '★★★' })).toBe(`/p/${id}`);
    expect(productIdFromSlug(id)).toBe(id);
  });
});
