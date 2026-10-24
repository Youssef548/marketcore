/**
 * What body-parser throws, and anything else built on `http-errors`. `expose`
 * is that library's own verdict that the message is safe to show the caller.
 */
export interface ExposedHttpError extends Error {
  status: number;
  expose: true;
}
