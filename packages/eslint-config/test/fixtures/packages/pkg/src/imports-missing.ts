// A side-effect-only import whose target does not exist.
//
// This is the exact shape the README recorded as an enforcement hole: TypeScript
// deliberately ignores an unresolved side-effect-only import (it cannot tell a missing
// module from one that is declared elsewhere), and the boundary plugin stays quiet unless
// `no-unknown` is on. So nothing else in the toolchain can catch it — if the rule is not
// firing, this file passes and the hole is open.
import './does-not-exist';
