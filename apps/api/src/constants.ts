/**
 * Implementation-level literal values for the API's HTTP layer, defined once.
 *
 * Wire-level values live in `@app/contracts`, because the apps and any client
 * must agree on them. These are the API's own plumbing, so they belong beside the
 * API's code rather than on the shared surface.
 */

/** `WEB_URL` carries a comma-separated list, so one deployment can allow several origins. */
export const ORIGIN_SEPARATOR = ',';
