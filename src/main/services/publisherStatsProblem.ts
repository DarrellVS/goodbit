/** Why the publisher gave no numbers. */
export interface PublisherStatsProblem {
  kind: 'unreachable' | 'unauthorized' | 'outdated';
  /** A sentence for the page, in the reader's words rather than the HTTP client's. */
  message: string;
}

/** What a failed stats request means, for somebody who has not read the code. */
export function describeStatsFailure(status: number | undefined, baseUrl: string): PublisherStatsProblem {
  if (status === 404) {
    return {
      kind: 'outdated',
      message:
        'Your publisher is older than the view counter, so it has nothing to report yet. ' +
        'Update its container and this page fills in.',
    };
  }
  if (status === 401 || status === 403 || status === 503) {
    return {
      kind: 'unauthorized',
      message:
        status === 503
          ? 'The publisher has no PUBLISH_TOKEN set, so it refuses to say what it holds.'
          : 'The publisher refused the token. It has to match PUBLISH_TOKEN on the server.',
    };
  }
  return {
    kind: 'unreachable',
    message: `Nothing answered at ${baseUrl}. The server may be off, or the address may be wrong.`,
  };
}
