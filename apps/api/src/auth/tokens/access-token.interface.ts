/** What an access token carries. `sub` is the user id; the tenant never travels in it. */
export interface AccessTokenPayload {
  sub: string;
}
