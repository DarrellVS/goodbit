import { describe, expect, it } from 'vitest';
import { describeStatsFailure } from '../../../src/main/services/publisherStatsProblem';

/*
 * Every failure used to come back as zeros, which reads as an empty publisher.
 * Each one now names itself, and the page picks its way out from the kind.
 */
describe('describeStatsFailure', () => {
  it('reads no answer at all as unreachable, and names the address', () => {
    const problem = describeStatsFailure(undefined, 'http://localhost:4199');
    expect(problem.kind).toBe('unreachable');
    expect(problem.message).toContain('http://localhost:4199');
  });

  it('reads a 404 as a publisher older than the counter', () => {
    expect(describeStatsFailure(404, 'x').kind).toBe('outdated');
  });

  it('reads a refused token as unauthorized', () => {
    expect(describeStatsFailure(401, 'x').kind).toBe('unauthorized');
    expect(describeStatsFailure(403, 'x').kind).toBe('unauthorized');
  });

  it('says so when the server has no token at all', () => {
    const problem = describeStatsFailure(503, 'x');
    expect(problem.kind).toBe('unauthorized');
    expect(problem.message).toContain('PUBLISH_TOKEN');
  });

  it('reads a server error as unreachable rather than as a token problem', () => {
    expect(describeStatsFailure(500, 'x').kind).toBe('unreachable');
  });
});
