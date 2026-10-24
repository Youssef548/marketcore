/**
 * The products page's own load states, named once. The page's `State` union is built from
 * them, so the tags it narrows on and the tags it constructs are the same values by
 * construction — the same shape `lib/session/constants.ts` gives the session's states.
 */
export const PageStates = { LOADING: 'loading', READY: 'ready', FAILED: 'failed' } as const;
