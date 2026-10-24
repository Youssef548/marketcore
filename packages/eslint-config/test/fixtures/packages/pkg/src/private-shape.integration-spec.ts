// A shape declared inside a test. Tests follow the same rule, so this must fail lint.
interface Captured {
  line: string;
}

export const captured: Captured[] = [];
