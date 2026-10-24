// A test helper outside src/ declaring its own shape. It must fail lint.
export interface HelperResult {
  ok: boolean;
}

export const helperResult: HelperResult = { ok: true };
