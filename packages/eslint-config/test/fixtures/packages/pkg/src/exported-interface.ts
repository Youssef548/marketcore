// An exported, hand-written shape declared in an implementation file. It belongs in an
// interfaces/ file, so this must fail lint.
export interface Shape {
  name: string;
}

export type Handler = (value: string) => void;
