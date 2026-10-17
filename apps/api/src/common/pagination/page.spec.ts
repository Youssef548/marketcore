import { toPage } from './page';

const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `r${i}` }));

describe('toPage', () => {
  it('returns a cursor when one row more than the page size came back', () => {
    expect(toPage(rows(3), 2, (row) => row.id)).toEqual({ items: ['r0', 'r1'], nextCursor: 'r1' });
  });

  it('returns no cursor on the last page', () => {
    expect(toPage(rows(2), 2, (row) => row.id)).toEqual({ items: ['r0', 'r1'], nextCursor: null });
    expect(toPage(rows(0), 2, (row) => row.id)).toEqual({ items: [], nextCursor: null });
  });
});
