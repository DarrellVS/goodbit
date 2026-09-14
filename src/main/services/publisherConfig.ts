import { loadSettings } from '../settings.js';

/**
 * Where the publisher lives, if there is one.
 *
 * Was `PUBLISHER_BASE_URL` in a .env file, which made the feature mandatory in
 * practice: the actions threw when it was unset, and the boot sequence logged
 * failures on every start for a server the user had never heard of. It is a
 * setting now, and empty means the feature is simply absent.
 */
export function publisherBaseUrl(): string {
  return (loadSettings().publisherBaseUrl || '').replace(/\/$/, '');
}

/** The secret the publisher wants on every write. Empty when not set yet. */
export function publisherToken(): string {
  return (loadSettings().publisherToken || '').trim();
}

/** Headers every write to the publisher has to carry. */
export function publisherAuthHeaders(): Record<string, string> {
  const token = publisherToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** True when publishing is available at all. */
export function isPublisherConfigured(): boolean {
  return publisherBaseUrl().length > 0;
}

/** The message shown when something tries to publish without a publisher. */
export const NO_PUBLISHER =
  'No publisher is set up. Add one under Settings → App to publish clips.';
