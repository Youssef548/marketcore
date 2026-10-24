// Private shapes declared in an implementation file. Unexported is no exception: every
// hand-written shape belongs in an interfaces/ file, so both of these must fail lint.
interface Local {
  name: string;
}

type Pair = { left: Local; right: Local };

export const pair: Pair | null = null;
