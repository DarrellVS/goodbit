import axios, { AxiosHeaders, type AxiosAdapter, type AxiosResponse } from 'axios';

/**
 * axios, talking over IPC instead of the network.
 *
 * Swapping the adapter rather than rewriting the call sites is deliberate:
 * there are roughly forty of them across six service files, each already a thin
 * one-function-per-endpoint wrapper, and rewriting every signature by hand is
 * forty chances to change one by accident. The services, composables and
 * components above them are untouched; only the transport moved.
 *
 * There is no HTTP server any more. A port on 127.0.0.1 is reachable by every
 * other process on the machine, for an API that can delete clips, that is a
 * surface an installed app has no reason to expose.
 *
 * The Firebase token interceptor is gone with it: there is nobody to
 * authenticate to.
 */
const ipcAdapter: AxiosAdapter = async (config) => {
  const bridge = window.goodbit;
  if (!bridge) {
    throw new axios.AxiosError(
      'The GoodBit bridge is unavailable',
      'ERR_NO_BRIDGE',
      config,
    );
  }

  // Paths are written as `/api/clips/…` everywhere; the bridge prefixes /api
  // itself, so strip it rather than making every call site change.
  const rawUrl = config.url ?? '';
  const path = rawUrl.replace(/^\/api/, '');

  const { status, body } = await bridge.apiRequest({
    method: (config.method ?? 'get').toUpperCase(),
    path,
    query: (config.params ?? {}) as Record<string, unknown>,
    // axios has already serialised the body to a string by this point.
    body: typeof config.data === 'string' ? safeParse(config.data) : config.data,
  });

  const response: AxiosResponse = {
    data: body,
    status,
    statusText: String(status),
    headers: new AxiosHeaders(),
    config,
    request: null,
  };

  // Anything but a 2xx has to reject, or every `catch` in the app stops firing
  // and failures surface as success with an error-shaped body.
  if (status < 200 || status >= 300) {
    // Routes answer with `{ error }`, while anything that throws goes through
    // the error handler and comes back as `{ status, code, message }`. Reading
    // only the first turned every thrown error into "Request failed with
    // status 500" and threw away what actually went wrong.
    const failure = body as { error?: string; message?: string } | null;
    throw new axios.AxiosError(
      failure?.error ?? failure?.message ?? `Request failed with status ${status}`,
      status === 404 ? 'ERR_NOT_FOUND' : 'ERR_BAD_RESPONSE',
      config,
      null,
      response,
    );
  }

  return response;
};

function safeParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

axios.defaults.adapter = ipcAdapter;

export default axios;
