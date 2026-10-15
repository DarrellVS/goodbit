/**
 * OWNER: actions.
 *
 * Request routes onto Actions. One `switch` over `RouteKey`. Per route:
 * capability (403 when off), session (401), body parsed with the `parse*Body`
 * helpers, ids checked against the session's seen-set, then an Action.
 * Stream Deck group keys are forwarded to `../streamdeck/actions.js` unchanged.
 *
 * May import: `@shared/localApi`, `./session.js`, `./snapshot.js`
 * (`currentSnapshot`, `toApiClip`, `latestClipId`, `isSaving`), `../../actions/*`, `../streamdeck/actions.js`,
 * `../steam/*`, `../videoService.js`.
 * Never `server.js`, `stream.js`, `pipe.js`, `discovery.js`.
 * Imported by: `server.ts` (`handleRoute`).
 *
 * **A transport, not a place for business logic.** Every route finds what it
 * is about and hands it to an Action that already exists. Discard keeps the
 * Stream Deck's three locks (a setting, `confirm: true`, `discardableFromAKey`)
 * and adds the two that a stateless client needs: the clip must still be the
 * latest, and nothing may be arriving in staging.
 *
 * Never throws: an unexpected error is a 500 `internal` reply.
 */
import path from 'node:path';
import fs from 'node:fs/promises';
import { app, nativeImage } from 'electron';
import {
  ROUTES,
  buildHello,
  capabilitiesFor,
  errorReply,
  isGameArtKind,
  jsonReply,
  parseClipIdParam,
  parseDiscardBody,
  parseEmptyBody,
  parseShowBody,
  parseStarBatchBody,
  parseStarBody,
  parseTagsBody,
  parseThumbnailWidth,
  LOCAL_API_LIMITS,
  LOCAL_API_SETTINGS,
  type Capability,
  type PublishAccepted,
  type RouteReply,
  type RouteRequest,
  type SessionSeen,
  type StateResponse,
  type ThumbnailWidth,
} from '@shared/localApi';
import { AppDataSource } from '../../data-source.js';
import { Clip } from '../../entity/Clip.js';
import { Game } from '../../entity/Game.js';
import { GoodBit } from '../../entity/GoodBit.js';
import { BatchAddTagsAction, BatchDeleteAction, BatchStarAction } from '../../actions/BatchOperationsAction.js';
import { PublishClipAction } from '../../actions/PublishClipAction.js';
import { SyncPublisherStatsAction } from '../../actions/SyncPublisherStatsAction.js';
import { ShowInAppAction } from '../../actions/ShowInAppAction.js';
import { LaunchSteamGameAction } from '../../actions/LaunchSteamGameAction.js';
import { loadSettings } from '../../settings.js';
import { videoService } from '../videoService.js';
import { artworkFile } from '../steam/artwork.js';
import { discardableFromAKey } from '../streamdeck/auth.js';
import * as deck from '../streamdeck/actions.js';
import { requireSession, openSession } from './session.js';
import { currentSnapshot, isSaving, latestClipId, toApiGame } from './snapshot.js';

/** The capabilities this profile's settings allow right now (`capabilitiesFor` over the publisher and discard settings). Serves `GET /v1/hello` and the 403 check. */
export function currentCapabilities(): Capability[] {
  const settings = loadSettings() as unknown as Record<string, unknown>;
  return capabilitiesFor({
    publisherConfigured: typeof settings.publisherBaseUrl === 'string' && settings.publisherBaseUrl.trim() !== '',
    allowDiscard: settings[LOCAL_API_SETTINGS.allowDiscard] === true,
  });
}

const notFoundClip = (): RouteReply => errorReply('not_found', 'No such clip on this session.');
const bad = (message: string): RouteReply => errorReply('bad_request', message);

/** Answer one request. Never throws. */
export async function handleRoute(req: RouteRequest): Promise<RouteReply> {
  try {
    return await dispatch(req);
  } catch (error) {
    console.error('[localApi] route failed:', req.route, error instanceof Error ? error.message : error);
    return errorReply('internal', 'Something went wrong in GoodBit.');
  }
}

async function dispatch(req: RouteRequest): Promise<RouteReply> {
  const def = ROUTES.find((route) => route.key === req.route);
  if (!def) return errorReply('not_found', 'No such route.');

  // Legacy Stream Deck keys keep their own rules and bodies, unchanged.
  if (def.group === 'streamdeck') return legacy(req);

  if (def.capability !== null && !currentCapabilities().includes(def.capability)) {
    return errorReply('capability_off', 'That is switched off in GoodBit.');
  }

  let seen: SessionSeen | null = null;
  if (def.session) {
    const session = requireSession(req.sessionId, req.now);
    if (!session.ok) return { status: session.status, json: session.body };
    seen = session.seen;
  }

  switch (req.route) {
    case 'GET /v1/hello':
      return jsonReply(200, buildHello(app.getVersion(), currentCapabilities()));
    case 'GET /v1/state':
      return state(req);
    case 'GET /v1/events':
      // The stream is the transport's; reaching here means the server routed it wrongly.
      return errorReply('not_found', 'The event stream is not served here.');
    case 'GET /v1/clips/:id/thumbnail':
      return thumbnail(req, seen!);
    case 'GET /v1/games/:id/art/:kind':
      return gameArt(req);
    case 'POST /v1/clips/star':
      return starBatch(req, seen!);
    case 'POST /v1/clips/:id/star':
      return starOne(req, seen!);
    case 'POST /v1/clips/:id/tags':
      return addTags(req, seen!);
    case 'POST /v1/clips/:id/publish':
      return publish(req, seen!);
    case 'POST /v1/clips/:id/discard':
      return discard(req, seen!);
    case 'POST /v1/app/show':
      return show(req, seen!);
    case 'POST /v1/games/:id/launch':
      return launch(req);
    case 'POST /v1/publisher/refresh':
      return refreshPublisher(req);
    default:
      return errorReply('not_found', 'No such route.');
  }
}

// ---------------------------------------------------------------------------
// Legacy Stream Deck group
// ---------------------------------------------------------------------------

async function legacy(req: RouteRequest): Promise<RouteReply> {
  const body = (typeof req.body === 'object' && req.body !== null ? req.body : {}) as Record<string, unknown>;
  let result: deck.KeyResult;
  switch (req.route) {
    case 'GET /v1/health':
      result = await deck.health();
      break;
    case 'GET /v1/stats':
      result = await deck.stats();
      break;
    case 'POST /v1/latest/tag':
      result = await deck.tagLatest(body);
      break;
    case 'POST /v1/latest/publish':
      result = await deck.publishLatest();
      break;
    case 'POST /v1/latest/discard':
      result = await deck.discardLatest(body);
      break;
    case 'POST /v1/replay/save':
      result = await deck.saveReplayFromKey();
      break;
    case 'GET /v1/latest/preview':
      result = await deck.latestPreview();
      break;
    case 'POST /v1/publish/status':
      result = await deck.publishStatus(body);
      break;
    default:
      return errorReply('not_found', 'No such route.');
  }
  return { status: result.status, json: result.body };
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

async function state(req: RouteRequest): Promise<RouteReply> {
  const { rev, state: current } = await currentSnapshot();
  const session = openSession(req.now);
  const got = requireSession(session, req.now);
  if (!got.ok) return { status: got.status, json: got.body };
  got.seen.rememberLine({ type: 'snapshot', rev, session, state: current });
  const response: StateResponse = { rev, session, state: current };
  return jsonReply(200, response);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Seen = SessionSeen;

async function loadClip(id: number): Promise<Clip | null> {
  return AppDataSource.getRepository(Clip).findOne({ where: { id }, relations: { tags: true } });
}

/** The clip id from the path, when it is one and this session was sent it. Else the reply to give. */
function knownClipId(req: RouteRequest, seen: Seen): number | RouteReply {
  const id = parseClipIdParam(req.params.id);
  if (id === null) return bad('The clip id must be a whole number.');
  if (!seen.knowsClip(id, req.now)) return notFoundClip();
  return id;
}

/**
 * The Game row for an id GoodBit sent. The id is whatever the snapshot calls
 * the game; `toApiGame` is the one place that knows what it means, so this
 * asks it and then finds the row by the name it answers with. The appid is
 * always read from the row, never from the request.
 */
async function gameRow(gameId: string): Promise<Game | null> {
  const known = await toApiGame(gameId);
  if (!known) return null;
  const repo = AppDataSource.getRepository(Game);
  const byName = await repo.findOneBy({ name: known.name });
  if (byName) return byName;
  const byDisplay = await repo.findOneBy({ displayName: known.name });
  if (byDisplay) return byDisplay;
  return repo.findOneBy({ name: gameId });
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

async function starOne(req: RouteRequest, seen: Seen): Promise<RouteReply> {
  const id = knownClipId(req, seen);
  if (typeof id !== 'number') return id;
  const body = parseStarBody(req.body);
  if (!body.ok) return bad(body.message);
  const result = await new BatchStarAction().execute({ clipIds: [id], starred: body.value.starred });
  if (result.failed > 0) return notFoundClip();
  return jsonReply(200, { clipId: id, starred: body.value.starred });
}

async function starBatch(req: RouteRequest, seen: Seen): Promise<RouteReply> {
  const body = parseStarBatchBody(req.body);
  if (!body.ok) return bad(body.message);
  if (!seen.knowsAllClips(body.value.clipIds, req.now)) return notFoundClip();
  const result = await new BatchStarAction().execute({
    clipIds: body.value.clipIds,
    starred: body.value.starred,
  });
  return jsonReply(200, { starred: body.value.starred, updated: result.success, failed: result.failed });
}

/** Tagging only adds, and only a name GoodBit sent on this session. Taking one off is decided where the clip is. */
async function addTags(req: RouteRequest, seen: Seen): Promise<RouteReply> {
  const id = knownClipId(req, seen);
  if (typeof id !== 'number') return id;
  const body = parseTagsBody(req.body);
  if (!body.ok) return bad(body.message);
  if (!seen.knowsAllTags(body.value.add, req.now)) {
    return errorReply('not_found', 'A tag name was not sent on this session.');
  }
  const result = await new BatchAddTagsAction().execute({ clipIds: [id], tags: body.value.add });
  if (result.failed > 0) return notFoundClip();
  const clip = await loadClip(id);
  return jsonReply(200, { clipId: id, tags: (clip?.tags ?? []).map((tag) => tag.name) });
}

/**
 * Accepted at once, run behind the answer: an upload is minutes of a home
 * uplink. No clipboard here, that is the client's job: the answer carries the
 * link when there already is one, and `publish.progress` plus a later state
 * carry it otherwise.
 */
async function publish(req: RouteRequest, seen: Seen): Promise<RouteReply> {
  const id = knownClipId(req, seen);
  if (typeof id !== 'number') return id;
  const body = parseEmptyBody(req.body);
  if (!body.ok) return bad(body.message);
  const clip = await loadClip(id);
  if (!clip) return notFoundClip();

  const accepted: PublishAccepted = {
    accepted: true,
    clipId: id,
    publishedUrl: clip.published ? clip.publishedUrl ?? null : null,
  };
  if (!clip.published) {
    void new PublishClipAction().execute({ id }).catch((error: unknown) => {
      console.error('[localApi] publish failed:', error instanceof Error ? error.message : error);
    });
  }
  return jsonReply(202, accepted);
}

/**
 * Throw the latest clip away, and only when it is safe to from a client.
 *
 * Locks, in the order they are cheapest to check: the capability (setting) has
 * been checked by the caller; `confirm: true`; the id was sent on this
 * session; nothing is arriving in staging (409 `saving`); the clip is still the
 * latest (409 `latest_changed`); and `discardableFromAKey`, which keeps any clip
 * carrying something that exists only in GoodBit. The file goes to the Recycle
 * Bin through `BatchDeleteAction`, the same deleter the library uses.
 */
async function discard(req: RouteRequest, seen: Seen): Promise<RouteReply> {
  const body = parseDiscardBody(req.body);
  if (!body.ok) return bad(body.message);
  const id = knownClipId(req, seen);
  if (typeof id !== 'number') return id;

  if (isSaving()) return errorReply('saving', 'Still saving the last clip.');
  if ((await latestClipId()) !== id) {
    return errorReply('latest_changed', 'That is no longer the latest clip.');
  }

  const clip = await loadClip(id);
  if (!clip) return notFoundClip();
  const markCount = await AppDataSource.getRepository(GoodBit).count({ where: { clipId: id } });
  const verdict = discardableFromAKey({
    displayName: clip.displayName,
    notes: clip.notes,
    starred: clip.starred,
    published: clip.published,
    tagCount: clip.tags?.length ?? 0,
    markCount,
  });
  if (!verdict.ok) {
    return errorReply('capability_off', `Kept: that clip is ${verdict.reason}.`);
  }

  const result = await new BatchDeleteAction().execute({ clipIds: [id] });
  if (result.failed > 0) return errorReply('internal', 'Could not move it to the Recycle Bin.');
  return jsonReply(200, { clipId: id, discarded: true });
}

async function show(req: RouteRequest, seen: Seen): Promise<RouteReply> {
  const body = parseShowBody(req.body);
  if (!body.ok) return bad(body.message);
  const { view, clipId, clipIds } = body.value;
  if (clipId !== undefined && !seen.knowsClip(clipId, req.now)) return notFoundClip();
  if (clipIds !== undefined && !seen.knowsAllClips(clipIds, req.now)) return notFoundClip();

  const result = await new ShowInAppAction().execute({ view, clipId, clipIds });
  if (!result.shown) {
    return result.reason === 'no-window'
      ? errorReply('starting', 'GoodBit has no window to show yet.')
      : bad('That view cannot be shown.');
  }
  return jsonReply(200, { shown: true, view });
}

async function launch(req: RouteRequest): Promise<RouteReply> {
  const body = parseEmptyBody(req.body);
  if (!body.ok) return bad(body.message);
  const row = await gameRow(req.params.id ?? '');
  if (!row) return errorReply('not_found', 'No such game.');
  const result = await new LaunchSteamGameAction().execute({ game: row.name });
  if (!result.launched) return errorReply('not_found', 'That game is not a Steam game.');
  return jsonReply(200, { launched: true });
}

/** A floor on how often the publisher is asked, whatever the client wants. */
async function refreshPublisher(req: RouteRequest): Promise<RouteReply> {
  const body = parseEmptyBody(req.body);
  if (!body.ok) return bad(body.message);
  const result = await new SyncPublisherStatsAction().execute({
    maxAgeMs: LOCAL_API_LIMITS.publisherRefreshMaxAgeMs,
  });
  return jsonReply(200, { refreshed: !result.skipped, updated: result.updated });
}

// ---------------------------------------------------------------------------
// Pictures
// ---------------------------------------------------------------------------

const THUMB_CACHE_MAX = 64;
const thumbCache = new Map<string, Buffer>();

function remember(key: string, bytes: Buffer): void {
  thumbCache.delete(key);
  thumbCache.set(key, bytes);
  while (thumbCache.size > THUMB_CACHE_MAX) {
    const oldest = thumbCache.keys().next();
    if (oldest.done) break;
    thumbCache.delete(oldest.value);
  }
}

/** The cached 1280 wide thumbnail, resized with `nativeImage`. Never enlarged. */
async function resizedThumbnail(clip: Clip, width: ThumbnailWidth): Promise<Buffer | null> {
  const key = `${clip.id}:${new Date(clip.fileModifiedAt).getTime()}:${width}`;
  const hit = thumbCache.get(key);
  if (hit) return hit;

  const file = await videoService.ensureThumbnail(clip);
  const image = nativeImage.createFromPath(file);
  if (image.isEmpty()) return null;
  const size = image.getSize();
  const scaled = size.width > width ? image.resize({ width, quality: 'best' }) : image;
  const bytes = scaled.toJPEG(82);
  if (bytes.length === 0) return null;
  remember(key, bytes);
  return bytes;
}

/**
 * Pictures answer `immutable`: the URL carries `modifiedAt` as a query value,
 * so a new cut is a new URL. The shared `RouteReply` has no ETag field, so
 * the cache header does that job.
 */
const IMMUTABLE = 'private, max-age=31536000, immutable';

async function thumbnail(req: RouteRequest, seen: Seen): Promise<RouteReply> {
  const id = knownClipId(req, seen);
  if (typeof id !== 'number') return id;
  const width = parseThumbnailWidth(req.query.w);
  if (width === null) return bad('w must be 160, 320 or 640.');
  const clip = await loadClip(id);
  if (!clip) return notFoundClip();
  const bytes = await resizedThumbnail(clip, width);
  if (!bytes) return errorReply('not_found', 'No picture for that clip yet.');
  return { status: 200, bytes, contentType: 'image/jpeg', cacheControl: IMMUTABLE };
}

const ART_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

/**
 * Steam's own artwork, bytes only: never a URL and never a path, for display
 * on this machine. It is Valve's and the publisher's, so it is not for
 * `publisher/` or a public link. The appid comes from the Game row.
 */
async function gameArt(req: RouteRequest): Promise<RouteReply> {
  const kind = req.params.kind;
  if (!isGameArtKind(kind)) return bad('Unknown art kind.');
  const row = await gameRow(req.params.id ?? '');
  if (!row || !row.steamAppId) return errorReply('not_found', 'No art for that game.');
  const file = await artworkFile(row.steamAppId, kind);
  if (!file) return errorReply('not_found', 'No art for that game.');
  const contentType = ART_TYPES[path.extname(file).toLowerCase()];
  if (!contentType) return errorReply('not_found', 'No art for that game.');
  const bytes = await fs.readFile(file);
  // Valve re-cuts an image under a new content hash, so this is not immutable for ever: a day.
  return { status: 200, bytes, contentType, cacheControl: 'private, max-age=86400' };
}
