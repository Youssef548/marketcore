export interface AutoCancelResult {
  cancelled: number;
  restoredUnits: number;
}

export interface AutoCancelPolicy {
  windowMs: number;
  batchSize: number;
}

/** The one call the job makes, so the job can be tested without a database. */
export interface AutoCancelStore {
  cancelExpired(cutoff: Date, batchSize: number): Promise<AutoCancelResult>;
}
