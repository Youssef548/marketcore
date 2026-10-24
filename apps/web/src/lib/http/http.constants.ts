/**
 * The media type the BFF accepts for a JSON body, and the request headers it reads
 * to decide where the request came from.
 *
 * Named here rather than in `@app/contracts`: nothing outside this app reads them.
 * The API never sees these headers, because the browser never talks to the API — so
 * they are this app's own boundary, and belong beside the code that enforces it.
 */
export const JSON_MEDIA_TYPE = 'application/json';

export const REQUEST_HEADERS = {
  CONTENT_TYPE: 'content-type',
  ORIGIN: 'origin',
  SEC_FETCH_SITE: 'sec-fetch-site',
} as const;

/**
 * `Sec-Fetch-Site` values that describe a request the user aimed at this origin.
 *
 * `none` is a direct navigation (typed URL, bookmark); `same-origin` is this app's own
 * script. `same-site` is deliberately absent: a sibling subdomain is a different
 * principal, and the cookies are host-only, so nothing legitimate needs it.
 */
export const SAME_ORIGIN_FETCH_SITES: ReadonlySet<string> = new Set(['same-origin', 'none']);
