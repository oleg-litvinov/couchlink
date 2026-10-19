/** Wait before each automatic retry of a failed media load; then the viewer decides. */
export const MEDIA_RETRY_DELAYS_MS = [2000, 5000, 10000];

/** Delay before retrying after the given number of consecutive failures, or null to stop. */
export function mediaRetryDelay(failures: number): number | null {
  return MEDIA_RETRY_DELAYS_MS[failures - 1] ?? null;
}
