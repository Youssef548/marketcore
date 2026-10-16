// An interface file is where a shape belongs, but a literal union is still an option set, so this
// must fail lint.
export interface Sized {
  size: 'lg' | 'md';
}
