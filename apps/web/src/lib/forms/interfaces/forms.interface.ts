/** One refusal from a schema: zod's issue shape, narrowed to what a form reads. */
export interface ValidationIssue {
  path: PropertyKey[];
  message: string;
}

/** The message to show beside each field, keyed by the field's name. */
export type FieldErrors = Record<string, string>;

/** How a form's request ended: as the form expected, or with the message to show. */
export type SubmitResult = { ok: true } | { ok: false; message: string };
