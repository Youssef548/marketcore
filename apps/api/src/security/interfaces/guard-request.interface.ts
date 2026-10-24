/** The slice of a request the security guards read and write, as a spec builds it. */
export interface GuardRequest {
  user?: GuardRequestUser;
  buyer?: unknown;
}

export interface GuardRequestUser {
  id: string;
}
