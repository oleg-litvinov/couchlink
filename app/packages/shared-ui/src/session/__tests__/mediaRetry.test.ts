import { mediaRetryDelay } from '../mediaRetry';

describe('mediaRetryDelay', () => {
  it('retries a failed load quickly at first', () => {
    expect(mediaRetryDelay(1)).toBe(2000);
  });

  it('backs off on repeated failures', () => {
    expect(mediaRetryDelay(2)).toBeGreaterThan(mediaRetryDelay(1)!);
    expect(mediaRetryDelay(3)).toBeGreaterThan(mediaRetryDelay(2)!);
  });

  it('gives up after three automatic retries so the viewer can choose', () => {
    expect(mediaRetryDelay(4)).toBeNull();
  });
});
