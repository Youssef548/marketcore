// An option set written as a union of literals. It belongs in a const-object enum, so this must
// fail lint.
function pick(size: 'lg' | 'md'): string {
  return size;
}

export const picked = pick('lg');
