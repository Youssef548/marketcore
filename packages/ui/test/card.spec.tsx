import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Card } from '../src/card';

describe('Card', () => {
  it('is a div by default and keeps the caller layout beside its surface', () => {
    render(<Card className="p-5">Body</Card>);

    const card = screen.getByText('Body');
    expect(card.tagName).toBe('DIV');
    expect(card.className.split(' ')).toEqual(expect.arrayContaining(['bg-panel', 'border-rule', 'p-5']));
  });

  it('renders as the element the content needs, with its semantics', () => {
    render(
      <Card as="section" aria-labelledby="t">
        <h2 id="t">All products</h2>
      </Card>,
    );

    expect(screen.getByRole('region', { name: 'All products' }).tagName).toBe('SECTION');
  });

  it('lifts the raised variant off the canvas, which the panel variant does not', () => {
    render(
      <>
        <Card>Panel</Card>
        <Card variant="raised">Raised</Card>
      </>,
    );

    expect(screen.getByText('Panel').className).not.toContain('shadow-sm');
    expect(screen.getByText('Raised').className).toContain('shadow-sm');
  });
});
