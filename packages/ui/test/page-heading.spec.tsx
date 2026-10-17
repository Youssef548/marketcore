import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HeadingLevels } from '../src/constants';
import { PageHeading } from '../src/page-heading';

describe('PageHeading', () => {
  it('is the page title, level 1, by default', () => {
    render(<PageHeading>Sign in</PageHeading>);

    expect(screen.getByRole('heading', { level: 1, name: 'Sign in' })).toBeTruthy();
  });

  it('takes level 2 for a section inside a page, whose own title is the h1', () => {
    render(<PageHeading level={HeadingLevels.H2}>All products</PageHeading>);

    expect(screen.getByRole('heading', { level: 2, name: 'All products' })).toBeTruthy();
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
  });

  it('passes an id through, so a section can be labelled by it', () => {
    render(<PageHeading id="title">Products</PageHeading>);

    expect(screen.getByRole('heading').id).toBe('title');
  });
});
