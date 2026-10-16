/** Anything that can validate a value; a zod schema satisfies this as-is. */
export interface Schema<T> {
  parse(value: unknown): T;
}

export interface ApiClientOptions {
  /** Includes the API prefix, e.g. `http://localhost:3001/api/v1`. */
  baseUrl: string;
  getAccessToken?: () => string | undefined;
}

export interface RequestOptions {
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

/**
 * This package is transport, not domain. It owns exactly three things: attaching
 * auth, turning a response body into a typed value via the caller's schema, and
 * turning the error envelope into an `ApiError`.
 *
 * Resource methods (`tasks.create(...)`) belong to the app that owns the
 * resource, written on top of these helpers — that is why none ship here.
 */
export interface ApiClient {
  get<T>(path: string, schema: Schema<T>, options?: RequestOptions): Promise<T>;
  post<T>(path: string, schema: Schema<T>, options?: RequestOptions): Promise<T>;
  patch<T>(path: string, schema: Schema<T>, options?: RequestOptions): Promise<T>;
  put<T>(path: string, schema: Schema<T>, options?: RequestOptions): Promise<T>;
  /**
   * A 204 or empty body parses as `null`, so the schema must accept it
   * (e.g. `z.null()` or `z.unknown()`).
   */
  delete<T>(path: string, schema: Schema<T>, options?: RequestOptions): Promise<T>;
}
