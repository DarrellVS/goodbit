/**
 * The contract of GoodBit's local API, written once.
 *
 * Main serves it, and anything else on this machine that runs as the same
 * Windows user can speak it: a stream deck plugin, a status bar, a PowerShell
 * script. Nothing here names a client, and nothing here imports Electron, so
 * a client written in TypeScript can import this file as it is and a client
 * in another language can read it as the specification.
 *
 * ## What is in here, and why it is not in main
 *
 * - **The wire**: hello, the discovery file, the snapshot sections, the four
 *   kinds of NDJSON line, the six event names, the route table, the error
 *   codes. Main writes them and a client reads them, and two copies of one
 *   shape is how a client and a server end up describing different things.
 * - **The rules that must not drift**: what counts as a changed section, what
 *   a session has been told, which clip is the latest, which route a view
 *   opens. Each is a pure function so `tests/unit` owns it with no pipe, no
 *   window and no database.
 *
 * ## Transport, in one paragraph
 *
 * HTTP/1.1 on a named pipe whose name is random per launch, found through a
 * discovery file. `GET /v1/events` never ends and carries NDJSON; everything
 * else is one request and one reply. The client always speaks first, which
 * matters because the default pipe descriptor lets everybody read: a server
 * that wrote first would leak state to other accounts.
 *
 * ## Versioning
 *
 * `api` is the major and lives in the path (`/v1`). Within a major, changes
 * are additive only: new keys, new events, new capabilities, new sections. A
 * client ignores what it does not know. `minor` says which additions exist.
 */

// ---------------------------------------------------------------------------
// Versions, names and limits
// ---------------------------------------------------------------------------

export const LOCAL_API_VERSION = 1;
export const LOCAL_API_MINOR = 0;
export const LOCAL_API_APP_NAME = 'GoodBit';

/** In the profile's data folder, next to `settings.json`. */
export const LOCAL_API_DISCOVERY_FILE = 'local-api.json';

/** Written to a temp name beside the real one and renamed, so it is never half there. */
export const LOCAL_API_DISCOVERY_TMP_SUFFIX = '.tmp';

export const LOCAL_API_PIPE_PREFIX = '\\\\.\\pipe\\goodbit-api-';

/** Settings keys the transport owner adds to `settings.json`. Off until turned on. */
export const LOCAL_API_SETTINGS = {
  enabled: 'localApiEnabled',
  allowDiscard: 'localApiAllowDiscard',
} as const;

export const LOCAL_API_LIMITS = {
  /** A request body. A key press sends a few bytes. */
  bodyBytes: 4 * 1024,
  /** Past this many unwritten bytes the subscriber is dropped, never buffered further. */
  backpressureBytes: 1024 * 1024,
  maxSubscribers: 8,
  /** Quiet for this long and the server writes a `ping`. */
  pingMs: 15_000,
  /** A client that has heard nothing for this long should reconnect. */
  clientStaleMs: 45_000,
  /** Jobs push at most this often: progress is set per ffmpeg tick. */
  jobsPushMinMs: 250,
  /** OBS and the drive are re-read this often, and only while somebody is subscribed. */
  slowPollMs: 15_000,
  /** A session lives this long after its last use. */
  sessionTtlMs: 10 * 60 * 1000,
  /** One "saving": the raw watch, and how long it is believed with no confirmation from staging. */
  savingFallbackMs: 45_000,
  /** How many ids a batch route accepts. */
  maxBatchClips: 200,
  maxTagsPerRequest: 20,
  maxTagNameLength: 100,
  /** A client's reconnect backoff, documented here so every client agrees. */
  reconnectBackoffMs: [500, 5_000] as readonly [number, number],
  /** `POST /v1/publisher/refresh` is refused inside this window, whatever the client asks. */
  publisherRefreshMaxAgeMs: 15 * 60 * 1000,
} as const;

export const SESSION_HEADER = 'GoodBit-Session';
/** Node lowercases incoming header names. */
export const SESSION_HEADER_LOWER = 'goodbit-session';

export const NDJSON_CONTENT_TYPE = 'application/x-ndjson';

/** Thumbnail widths GoodBit will resize to. Anything else is a 400. */
export const THUMBNAIL_WIDTHS = [160, 320, 640] as const;
export type ThumbnailWidth = (typeof THUMBNAIL_WIDTHS)[number];

/** Art kinds, as `steam/` already names them. For display on this machine, never uploaded. */
export const GAME_ART_KINDS = ['header', 'hero', 'portrait', 'logo', 'icon'] as const;
export type GameArtKind = (typeof GAME_ART_KINDS)[number];

// ---------------------------------------------------------------------------
// Hello, and capabilities
// ---------------------------------------------------------------------------

export const CAPABILITIES = [
  'state',
  'events',
  'clips.read',
  'clips.star',
  'clips.tags',
  'clips.publish',
  'clips.discard',
  'app.show',
  'games.launch',
  'media.thumbnail',
  'media.art',
  'publisher.refresh',
] as const;
export type Capability = (typeof CAPABILITIES)[number];

export interface LocalApiHello {
  api: number;
  minor: number;
  app: { name: string; version: string };
  capabilities: Capability[];
}

/**
 * Capabilities follow the settings. A client draws what it is offered and
 * nothing else, so a capability that is off must be absent, not refused later.
 *
 * - No publisher configured: no `clips.publish`, no `publisher.refresh`.
 * - "Allow deleting clips" off: no `clips.discard`.
 */
export function capabilitiesFor(opts: { publisherConfigured: boolean; allowDiscard: boolean }): Capability[] {
  return CAPABILITIES.filter((capability) => {
    if (capability === 'clips.publish' || capability === 'publisher.refresh') return opts.publisherConfigured;
    if (capability === 'clips.discard') return opts.allowDiscard;
    return true;
  });
}

export function buildHello(version: string, capabilities: readonly Capability[]): LocalApiHello {
  return {
    api: LOCAL_API_VERSION,
    minor: LOCAL_API_MINOR,
    app: { name: LOCAL_API_APP_NAME, version },
    capabilities: [...capabilities],
  };
}

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

export interface LocalApiDiscovery {
  api: number;
  /** `\\.\pipe\goodbit-api-<uuid>`, new at every start. */
  pipe: string;
  pid: number;
  app: typeof LOCAL_API_APP_NAME;
  version: string;
  /** ISO 8601. */
  startedAt: string;
}

/** `\\.\pipe\goodbit-api-<uuid>`. The uuid is generated by main, so this only formats. */
export function localApiPipeName(uuid: string): string {
  return `${LOCAL_API_PIPE_PREFIX}${uuid}`;
}

const UUID_PART = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isLocalApiPipeName(name: unknown): name is string {
  if (typeof name !== 'string' || !name.startsWith(LOCAL_API_PIPE_PREFIX)) return false;
  return UUID_PART.test(name.slice(LOCAL_API_PIPE_PREFIX.length));
}

/** A parsed discovery file that has every field and a pipe that is really one of ours. */
export function isLocalApiDiscovery(value: unknown): value is LocalApiDiscovery {
  if (!isRecord(value)) return false;
  return (
    typeof value.api === 'number' &&
    Number.isInteger(value.api) &&
    isLocalApiPipeName(value.pipe) &&
    typeof value.pid === 'number' &&
    Number.isInteger(value.pid) &&
    value.pid > 0 &&
    value.app === LOCAL_API_APP_NAME &&
    typeof value.version === 'string' &&
    typeof value.startedAt === 'string' &&
    !Number.isNaN(Date.parse(value.startedAt))
  );
}

// ---------------------------------------------------------------------------
// The snapshot
// ---------------------------------------------------------------------------

export interface ApiGameRef {
  /** A slug, stable for the game's folder name. */
  id: string;
  name: string;
  steamAppId: string | null;
}

export interface ApiClip {
  id: number;
  name: string;
  game: ApiGameRef | null;
  lengthSec: number | null;
  /** ISO 8601, null when OBS did not say when it was recorded. */
  recordedAt: string | null;
  /** The file's mtime in ms. Part of a thumbnail's URL, so a new cut is a new picture. */
  modifiedAt: number;
  starred: boolean;
  published: boolean;
  views: number;
  goodBits: number;
  tags: string[];
}

export interface ApiGame extends ApiGameRef {
  /** A Steam appid is matched, so `POST /v1/games/{id}/launch` can work. */
  launchable: boolean;
}

export interface ApiJob {
  id: string;
  label: string;
  /** 0 to 100. */
  progress: number;
  etaSec: number | null;
}

export interface SavingSection {
  active: boolean;
}
export interface ObsSection {
  installed: boolean;
  running: boolean;
  /** The replay key as OBS names it, `F8`, or null when none is bound. */
  replayKey: string | null;
}
export interface DriveSection {
  drive: string;
  /** 0 to 1. */
  used: number;
  freeBytes: number;
  hoursLeft: number | null;
}
export interface TotalSection {
  count: number;
  totalSec: number;
}
export interface SessionSection {
  /** Game id, null when the session holds more than one or none. */
  game: string | null;
  clipIds: number[];
  count: number;
  goodBits: number;
}
export interface FoundSection {
  goodBits: number;
  clipIds: number[];
}
export interface TagsSection {
  top: string[];
}
export interface WeekSection extends TotalSection {
  /** `[gameId, clipCount]`, most clips first. */
  games: [string, number][];
}
export interface ViewsSection {
  total: number;
  published: number;
  /** The view count of the most watched clip. */
  top: number;
}
export interface PublisherSection {
  configured: boolean;
  /** The host only, never the base URL or anything after it. */
  host: string | null;
}

/**
 * Every section a snapshot carries. A state line replaces whole sections,
 * never a field inside one, so a client can never hold half of one.
 */
export interface LocalApiState {
  saving: SavingSection;
  obs: ObsSection;
  drive: DriveSection | null;
  today: TotalSection;
  latest: ApiClip | null;
  session: SessionSection | null;
  recent: number[];
  found: FoundSection;
  tags: TagsSection;
  week: WeekSection;
  views: ViewsSection | null;
  jobs: ApiJob[];
  /** Every clip referenced by another section, keyed by id as a string. */
  clips: Record<string, ApiClip>;
  games: Record<string, ApiGame>;
  publisher: PublisherSection;
}

export type SectionName = keyof LocalApiState;

export const SECTION_NAMES: readonly SectionName[] = [
  'saving',
  'obs',
  'drive',
  'today',
  'latest',
  'session',
  'recent',
  'found',
  'tags',
  'week',
  'views',
  'jobs',
  'clips',
  'games',
  'publisher',
];

// ---------------------------------------------------------------------------
// The stream
// ---------------------------------------------------------------------------

export const EVENT_NAMES = [
  'clip.saving',
  'clip.saved',
  'sweep.started',
  'sweep.finished',
  'sweep.dismissed',
  'publish.progress',
] as const;
export type EventName = (typeof EVENT_NAMES)[number];

/** Moments, not state. A dropped connection loses these, never state. */
export type LocalApiEvent =
  | { event: 'clip.saving'; at: string }
  | { event: 'clip.saved'; at: string; clip: ApiClip }
  | { event: 'sweep.started'; at: string; game: string | null; clips: number }
  | { event: 'sweep.finished'; at: string; found: number; clips: number; clipIds: number[] }
  | { event: 'sweep.dismissed'; at: string }
  | {
      event: 'publish.progress';
      at: string;
      clipId: number;
      name: string;
      stage: string;
      percent: number;
      message?: string;
    };

export interface SnapshotLine {
  type: 'snapshot';
  rev: number;
  session: string;
  state: LocalApiState;
}
export interface StateLine {
  type: 'state';
  rev: number;
  /** Whole sections, replacing the same keys outright. */
  set: Partial<LocalApiState>;
}
export type EventLine = { type: 'event'; rev: number } & LocalApiEvent;
export interface PingLine {
  type: 'ping';
  rev: number;
  at: string;
}
export type LocalApiLine = SnapshotLine | StateLine | EventLine | PingLine;

/** `GET /v1/state`: the same truth as a snapshot line, for a client that does not stream. */
export type StateResponse = Omit<SnapshotLine, 'type'>;

/** One line, newline terminated. `JSON.stringify` never emits a raw newline. */
export function encodeLine(line: LocalApiLine): string {
  return `${JSON.stringify(line)}\n`;
}

const LINE_TYPES = new Set<string>(['snapshot', 'state', 'event', 'ping']);

/** One line back into a value, or null for anything that is not one of ours. Never throws. */
export function parseLine(text: string): LocalApiLine | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(value) || typeof value.type !== 'string' || !LINE_TYPES.has(value.type)) return null;
  if (typeof value.rev !== 'number' || !Number.isFinite(value.rev)) return null;
  if (value.type === 'snapshot' && (typeof value.session !== 'string' || !isRecord(value.state))) return null;
  if (value.type === 'state' && !isRecord(value.set)) return null;
  if (value.type === 'event' && typeof value.event !== 'string') return null;
  return value as unknown as LocalApiLine;
}

/** What a client does with a state line: replace the named sections and keep the rest. */
export function applySet(state: LocalApiState, set: Partial<LocalApiState>): LocalApiState {
  const next: LocalApiState = { ...state };
  for (const name of SECTION_NAMES) {
    if (Object.prototype.hasOwnProperty.call(set, name) && set[name] !== undefined) {
      (next as unknown as Record<string, unknown>)[name] = set[name];
    }
  }
  return next;
}

// ---------------------------------------------------------------------------
// Which sections changed
// ---------------------------------------------------------------------------

/** Structural equality over JSON values. Key order does not matter, array order does. */
export function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, index) => jsonEqual(item, b[index]));
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const leftKeys = Object.keys(left).filter((key) => left[key] !== undefined);
  const rightKeys = Object.keys(right).filter((key) => right[key] !== undefined);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every(
    (key) => Object.prototype.hasOwnProperty.call(right, key) && jsonEqual(left[key], right[key]),
  );
}

/**
 * The sections whose value is different, in `SECTION_NAMES` order.
 *
 * `prev` null means nobody has been told anything yet, so every section is a
 * change. Sections are compared as wholes, which is the same unit a state line
 * carries.
 */
export function sectionsChanged(prev: Partial<LocalApiState> | null, next: LocalApiState): SectionName[] {
  return SECTION_NAMES.filter((name) => prev === null || !jsonEqual(prev[name], next[name]));
}

/** The `set` of a state line: the changed sections, whole. Null when nothing changed. */
export function stateDelta(prev: Partial<LocalApiState> | null, next: LocalApiState): Partial<LocalApiState> | null {
  const changed = sectionsChanged(prev, next);
  if (changed.length === 0) return null;
  const set: Record<string, unknown> = {};
  for (const name of changed) set[name] = next[name];
  return set as Partial<LocalApiState>;
}

// ---------------------------------------------------------------------------
// What a session has been told
// ---------------------------------------------------------------------------

/** Every clip id a state, or part of one, names. */
export function clipIdsInState(state: Partial<LocalApiState>): number[] {
  const ids = new Set<number>();
  if (state.latest) ids.add(state.latest.id);
  for (const id of state.session?.clipIds ?? []) ids.add(id);
  for (const id of state.recent ?? []) ids.add(id);
  for (const id of state.found?.clipIds ?? []) ids.add(id);
  for (const clip of Object.values(state.clips ?? {})) ids.add(clip.id);
  return [...ids].filter(isClipId);
}

/** Every tag name a state, or part of one, names. */
export function tagNamesInState(state: Partial<LocalApiState>): string[] {
  const names = new Set<string>();
  for (const name of state.tags?.top ?? []) names.add(name);
  for (const name of state.latest?.tags ?? []) names.add(name);
  for (const clip of Object.values(state.clips ?? {})) for (const name of clip.tags) names.add(name);
  return [...names];
}

/**
 * The ids and tag names one session has been sent.
 *
 * **A write is accepted only for an id GoodBit sent on that session**, and a
 * tag only if GoodBit sent that name. It is the notch's "only ids it drew"
 * rule made to work for any client. It stops a confused client acting on
 * something it never saw, and it is not a lock against a hostile one: anybody
 * running as this user can open a session and be sent the library.
 *
 * Pure: time is passed in, so expiry is a number and not a timer.
 * A session expires `ttlMs` after its last use. Checking does not count as
 * use; `touch` does, and the route layer calls it for every request it accepts.
 * Tag names are matched exactly, after trimming: GoodBit sent that spelling.
 */
export class SessionSeen {
  private readonly clips = new Set<number>();
  private readonly tags = new Set<string>();
  private lastUsed: number;

  constructor(
    now: number,
    private readonly ttlMs: number = LOCAL_API_LIMITS.sessionTtlMs,
  ) {
    this.lastUsed = now;
  }

  rememberClips(ids: Iterable<number>): void {
    for (const id of ids) if (isClipId(id)) this.clips.add(id);
  }

  rememberTags(names: Iterable<string>): void {
    for (const name of names) if (typeof name === 'string') this.tags.add(name.trim());
  }

  /** Remember everything a line sent. Pings send nothing. */
  rememberLine(line: LocalApiLine): void {
    switch (line.type) {
      case 'snapshot':
        this.rememberClips(clipIdsInState(line.state));
        this.rememberTags(tagNamesInState(line.state));
        return;
      case 'state':
        this.rememberClips(clipIdsInState(line.set));
        this.rememberTags(tagNamesInState(line.set));
        return;
      case 'event':
        if (line.event === 'clip.saved') {
          this.rememberClips([line.clip.id]);
          this.rememberTags(line.clip.tags);
        } else if (line.event === 'sweep.finished') {
          this.rememberClips(line.clipIds);
        } else if (line.event === 'publish.progress') {
          this.rememberClips([line.clipId]);
        }
        return;
      case 'ping':
        return;
    }
  }

  knowsClip(id: number, now: number): boolean {
    return !this.isExpired(now) && this.clips.has(id);
  }

  knowsTag(name: string, now: number): boolean {
    return !this.isExpired(now) && this.tags.has(name.trim());
  }

  /** Every id in `ids` is known and the session is alive. An empty list is not known. */
  knowsAllClips(ids: readonly number[], now: number): boolean {
    return ids.length > 0 && ids.every((id) => this.knowsClip(id, now));
  }

  knowsAllTags(names: readonly string[], now: number): boolean {
    return names.length > 0 && names.every((name) => this.knowsTag(name, now));
  }

  touch(now: number): void {
    if (!this.isExpired(now)) this.lastUsed = now;
  }

  isExpired(now: number): boolean {
    return now - this.lastUsed >= this.ttlMs;
  }

  /** Forget everything. An expired session is dead for good; it is not revived by a later touch. */
  expire(): void {
    this.clips.clear();
    this.tags.clear();
    this.lastUsed = Number.NEGATIVE_INFINITY;
  }

  get clipCount(): number {
    return this.clips.size;
  }

  get tagCount(): number {
    return this.tags.size;
  }
}

// ---------------------------------------------------------------------------
// The one "latest"
// ---------------------------------------------------------------------------

/**
 * The newest recording, defined once. It was three definitions: the Stream
 * Deck's, the island's and the wings'. This is the Stream Deck's, which is the
 * principled one: an export is rendered, not recorded, and a montage cut a
 * minute ago is not "the clip you just saved".
 *
 * As data so the SQL and the comparator below are visibly the same rule.
 */
export const LATEST_CLIP_ORDER = {
  excludeExports: true,
  /** Newest first. The first present value wins, then the next key breaks ties. */
  by: [
    { keys: ['recordedAt', 'fileModifiedAt'], direction: 'desc' },
    { keys: ['id'], direction: 'desc' },
  ],
  sql: {
    where: 'clip.isExport = 0',
    primary: 'COALESCE(clip.recordedAt, clip.fileModifiedAt)',
    secondary: 'clip.id',
    direction: 'DESC',
  },
} as const;

export interface LatestCandidate {
  id: number;
  isExport: boolean;
  recordedAt?: Date | string | number | null;
  fileModifiedAt: Date | string | number;
}

function momentOf(value: Date | string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const ms = value instanceof Date ? value.getTime() : typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/** `COALESCE(recordedAt, fileModifiedAt)` as a number of milliseconds. */
export function clipMoment(clip: Pick<LatestCandidate, 'recordedAt' | 'fileModifiedAt'>): number {
  return momentOf(clip.recordedAt) ?? momentOf(clip.fileModifiedAt) ?? 0;
}

/** Sort comparator: negative when `a` is the later pick. */
export function compareLatest(a: LatestCandidate, b: LatestCandidate): number {
  const byMoment = clipMoment(b) - clipMoment(a);
  return byMoment !== 0 ? byMoment : b.id - a.id;
}

/** The latest recording among `clips`, never an export, or null. */
export function pickLatest<T extends LatestCandidate>(clips: readonly T[]): T | null {
  let best: T | null = null;
  for (const clip of clips) {
    if (LATEST_CLIP_ORDER.excludeExports && clip.isExport) continue;
    if (best === null || compareLatest(clip, best) < 0) best = clip;
  }
  return best;
}

// ---------------------------------------------------------------------------
// Show in app
// ---------------------------------------------------------------------------

export const SHOW_IN_APP_VIEWS = [
  'library',
  'clip',
  'trim',
  'editor-highlights',
  'storage',
  'publisher',
  'stats',
  'settings',
] as const;
export type ShowInAppView = (typeof SHOW_IN_APP_VIEWS)[number];

export function isShowInAppView(value: unknown): value is ShowInAppView {
  return typeof value === 'string' && (SHOW_IN_APP_VIEWS as readonly string[]).includes(value);
}

/**
 * The renderer route a view opens, built here and never taken from a caller.
 * A path is never accepted: a client that could send one could send anything
 * the router understands. Null when the view needs a clip and has none.
 */
export function showInAppPath(view: ShowInAppView, clipId?: number, clipIds?: readonly number[]): string | null {
  switch (view) {
    case 'library':
      return '/';
    case 'clip':
      return isClipId(clipId) ? `/clips/${clipId}` : null;
    case 'trim':
      return isClipId(clipId) ? `/trim/${clipId}` : null;
    case 'editor-highlights': {
      const ids = (clipIds ?? []).filter(isClipId);
      return ids.length > 0 ? `/editor?clips=${ids.join(',')}&highlights=1` : null;
    }
    case 'storage':
      return '/storage';
    case 'publisher':
      return '/publisher';
    case 'stats':
      return '/stats';
    case 'settings':
      return '/settings';
  }
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * Every error body is `{ error: "<code>", message: "<sentence>" }`.
 * 400 bad body, 401 no or expired session, 403 capability off, 404 unknown
 * id or route, 409 latest changed or saving, 413 body over 4 KB, 503 still
 * starting or too many streams.
 */
export const LOCAL_API_ERRORS = {
  bad_request: 400,
  session_required: 401,
  capability_off: 403,
  not_found: 404,
  latest_changed: 409,
  saving: 409,
  payload_too_large: 413,
  internal: 500,
  starting: 503,
  too_many_streams: 503,
} as const;
export type LocalApiErrorCode = keyof typeof LOCAL_API_ERRORS;

export interface LocalApiErrorBody {
  error: LocalApiErrorCode;
  message: string;
}

export function errorStatus(code: LocalApiErrorCode): number {
  return LOCAL_API_ERRORS[code];
}

export function errorBody(code: LocalApiErrorCode, message: string): LocalApiErrorBody {
  return { error: code, message };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export interface RouteDef {
  /** `METHOD /v1/path/:param`. The key a `switch` in main is written over. */
  key: string;
  method: 'GET' | 'POST';
  /** `core` is the generic API, `streamdeck` is the legacy group kept under its old paths. */
  group: 'core' | 'streamdeck';
  /** Absent from `hello.capabilities` means 403 `capability_off`. Null: the route has its own rules. */
  capability: Capability | null;
  /** Needs a `GoodBit-Session` header naming a live session. */
  session: boolean;
  /** The status a success answers with. */
  status: 200 | 202;
}

/**
 * The route table. Main dispatches over `key` with a `switch`, never a lookup
 * that lets a request choose what is called.
 *
 * Left out on purpose: saving a replay (the key works in the game, and it
 * sends a keypress to the foreground window), renaming, notes and trims.
 * The Stream Deck group keeps its old paths, bodies and rules, because the
 * plugin ships separately and lags.
 */
export const ROUTES = [
  { key: 'GET /v1/hello', method: 'GET', group: 'core', capability: null, session: false, status: 200 },
  { key: 'GET /v1/state', method: 'GET', group: 'core', capability: 'state', session: false, status: 200 },
  { key: 'GET /v1/events', method: 'GET', group: 'core', capability: 'events', session: false, status: 200 },
  {
    key: 'GET /v1/clips/:id/thumbnail',
    method: 'GET',
    group: 'core',
    capability: 'media.thumbnail',
    session: true,
    status: 200,
  },
  {
    key: 'GET /v1/games/:id/art/:kind',
    method: 'GET',
    group: 'core',
    capability: 'media.art',
    session: true,
    status: 200,
  },
  { key: 'POST /v1/clips/star', method: 'POST', group: 'core', capability: 'clips.star', session: true, status: 200 },
  {
    key: 'POST /v1/clips/:id/star',
    method: 'POST',
    group: 'core',
    capability: 'clips.star',
    session: true,
    status: 200,
  },
  {
    key: 'POST /v1/clips/:id/tags',
    method: 'POST',
    group: 'core',
    capability: 'clips.tags',
    session: true,
    status: 200,
  },
  {
    key: 'POST /v1/clips/:id/publish',
    method: 'POST',
    group: 'core',
    capability: 'clips.publish',
    session: true,
    status: 202,
  },
  {
    key: 'POST /v1/clips/:id/discard',
    method: 'POST',
    group: 'core',
    capability: 'clips.discard',
    session: true,
    status: 200,
  },
  { key: 'POST /v1/app/show', method: 'POST', group: 'core', capability: 'app.show', session: true, status: 200 },
  {
    key: 'POST /v1/games/:id/launch',
    method: 'POST',
    group: 'core',
    capability: 'games.launch',
    session: true,
    status: 200,
  },
  {
    key: 'POST /v1/publisher/refresh',
    method: 'POST',
    group: 'core',
    capability: 'publisher.refresh',
    session: false,
    status: 200,
  },
  { key: 'GET /v1/health', method: 'GET', group: 'streamdeck', capability: null, session: false, status: 200 },
  { key: 'GET /v1/stats', method: 'GET', group: 'streamdeck', capability: null, session: false, status: 200 },
  { key: 'POST /v1/latest/tag', method: 'POST', group: 'streamdeck', capability: null, session: false, status: 200 },
  {
    key: 'POST /v1/latest/publish',
    method: 'POST',
    group: 'streamdeck',
    capability: null,
    session: false,
    status: 200,
  },
  {
    key: 'POST /v1/latest/discard',
    method: 'POST',
    group: 'streamdeck',
    capability: null,
    session: false,
    status: 200,
  },
  { key: 'POST /v1/replay/save', method: 'POST', group: 'streamdeck', capability: null, session: false, status: 200 },
  {
    key: 'GET /v1/latest/preview',
    method: 'GET',
    group: 'streamdeck',
    capability: null,
    session: false,
    status: 200,
  },
  {
    key: 'POST /v1/publish/status',
    method: 'POST',
    group: 'streamdeck',
    capability: null,
    session: false,
    status: 200,
  },
] as const satisfies readonly RouteDef[];

export type RouteKey = (typeof ROUTES)[number]['key'];

export interface RouteParams {
  id?: string;
  kind?: string;
}

export interface RouteMatch {
  route: (typeof ROUTES)[number];
  params: RouteParams;
}

/**
 * Which route a method and a path name, or null. `pathname` is the path
 * alone, no query. A literal segment beats a parameter, so `/v1/clips/star`
 * is the batch route and never a clip called `star`.
 */
export function matchRoute(method: string, pathname: string): RouteMatch | null {
  const parts = pathname.split('/').filter((part, index) => index === 0 || part !== '');
  const segments = parts.slice(1);
  let best: { match: RouteMatch; literals: number } | null = null;
  for (const route of ROUTES) {
    if (route.method !== method.toUpperCase()) continue;
    const pattern = route.key.slice(route.key.indexOf(' ') + 1).split('/').slice(1);
    if (pattern.length !== segments.length) continue;
    const params: RouteParams = {};
    let literals = 0;
    let ok = true;
    for (let i = 0; i < pattern.length; i += 1) {
      const want = pattern[i];
      const got = segments[i];
      if (want.startsWith(':')) {
        let decoded: string;
        try {
          decoded = decodeURIComponent(got);
        } catch {
          ok = false;
          break;
        }
        if (decoded === '') {
          ok = false;
          break;
        }
        (params as Record<string, string>)[want.slice(1)] = decoded;
      } else if (want === got) {
        literals += 1;
      } else {
        ok = false;
        break;
      }
    }
    if (ok && (best === null || literals > best.literals)) best = { match: { route, params }, literals };
  }
  return best ? best.match : null;
}

// ---------------------------------------------------------------------------
// Requests and replies, as main's modules pass them to one another
// ---------------------------------------------------------------------------

/** What the transport hands to the routes, after framing, the body limit and JSON parsing. */
export interface RouteRequest {
  route: RouteKey;
  params: RouteParams;
  query: Record<string, string>;
  /** Parsed JSON, `{}` for a GET, never a string. */
  body: unknown;
  /** The `GoodBit-Session` header, or null. */
  sessionId: string | null;
  /** `Date.now()` at arrival, so expiry in a test is a number. */
  now: number;
}

export type RouteReply =
  | { status: number; json: unknown }
  | {
      status: number;
      /** `Buffer` is a `Uint8Array`. */
      bytes: Uint8Array;
      contentType: string;
      /** Thumbnails and art answer `immutable`: the URL carries `modifiedAt`. */
      cacheControl?: string;
    };

export function jsonReply(status: number, json: unknown): RouteReply {
  return { status, json };
}

export function errorReply(code: LocalApiErrorCode, message: string): RouteReply {
  return { status: errorStatus(code), json: errorBody(code, message) };
}

// ---------------------------------------------------------------------------
// Request bodies, parsed once
// ---------------------------------------------------------------------------

export type Parsed<T> = { ok: true; value: T } | { ok: false; message: string };

export interface StarBody {
  starred: boolean;
}
export interface StarBatchBody {
  clipIds: number[];
  starred: boolean;
}
export interface TagsBody {
  add: string[];
}
export interface ShowBody {
  view: ShowInAppView;
  clipId?: number;
  clipIds?: number[];
}
export interface DiscardBody {
  confirm: true;
}
/** What `POST /v1/clips/:id/publish` answers with, status 202. The client copies the URL. */
export interface PublishAccepted {
  accepted: true;
  clipId: number;
  publishedUrl: string | null;
}

export function isClipId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function fail<T>(message: string): Parsed<T> {
  return { ok: false, message };
}

function parseClipIds(value: unknown): Parsed<number[]> {
  if (!Array.isArray(value) || value.length === 0) return fail('clipIds must be a list of clip ids');
  if (value.length > LOCAL_API_LIMITS.maxBatchClips) {
    return fail(`clipIds takes at most ${LOCAL_API_LIMITS.maxBatchClips} ids`);
  }
  if (!value.every(isClipId)) return fail('clipIds must be positive whole numbers');
  return { ok: true, value: [...new Set(value as number[])] };
}

export function parseStarBody(raw: unknown): Parsed<StarBody> {
  if (!isRecord(raw) || typeof raw.starred !== 'boolean') return fail('starred must be true or false');
  return { ok: true, value: { starred: raw.starred } };
}

export function parseStarBatchBody(raw: unknown): Parsed<StarBatchBody> {
  if (!isRecord(raw)) return fail('Expected a JSON object');
  if (typeof raw.starred !== 'boolean') return fail('starred must be true or false');
  const ids = parseClipIds(raw.clipIds);
  if (!ids.ok) return ids;
  return { ok: true, value: { clipIds: ids.value, starred: raw.starred } };
}

export function parseTagsBody(raw: unknown): Parsed<TagsBody> {
  if (!isRecord(raw) || !Array.isArray(raw.add) || raw.add.length === 0) {
    return fail('add must be a list of tag names');
  }
  if (raw.add.length > LOCAL_API_LIMITS.maxTagsPerRequest) {
    return fail(`add takes at most ${LOCAL_API_LIMITS.maxTagsPerRequest} names`);
  }
  const names: string[] = [];
  for (const entry of raw.add) {
    if (typeof entry !== 'string') return fail('Tag names must be text');
    const name = entry.trim();
    if (name === '' || name.length > LOCAL_API_LIMITS.maxTagNameLength) {
      return fail(`A tag name is 1 to ${LOCAL_API_LIMITS.maxTagNameLength} characters`);
    }
    if (!names.includes(name)) names.push(name);
  }
  return { ok: true, value: { add: names } };
}

/** Any object, including the empty one. For routes that take no input. */
export function parseEmptyBody(raw: unknown): Parsed<Record<string, never>> {
  return isRecord(raw) ? { ok: true, value: {} } : fail('Expected a JSON object');
}

export function parseShowBody(raw: unknown): Parsed<ShowBody> {
  if (!isRecord(raw) || !isShowInAppView(raw.view)) {
    return fail(`view must be one of ${SHOW_IN_APP_VIEWS.join(', ')}`);
  }
  const body: ShowBody = { view: raw.view };
  if (raw.clipId !== undefined) {
    if (!isClipId(raw.clipId)) return fail('clipId must be a positive whole number');
    body.clipId = raw.clipId;
  }
  if (raw.clipIds !== undefined) {
    const ids = parseClipIds(raw.clipIds);
    if (!ids.ok) return ids;
    body.clipIds = ids.value;
  }
  if (showInAppPath(body.view, body.clipId, body.clipIds) === null) {
    return fail(body.view === 'editor-highlights' ? 'clipIds is required for this view' : 'clipId is required for this view');
  }
  return { ok: true, value: body };
}

export function parseDiscardBody(raw: unknown): Parsed<DiscardBody> {
  if (!isRecord(raw) || raw.confirm !== true) return fail('confirm must be true');
  return { ok: true, value: { confirm: true } };
}

/** A clip id from a path segment: digits only, so `1e3` and `0x10` are refused. */
export function parseClipIdParam(value: string | undefined): number | null {
  if (value === undefined || !/^[1-9]\d{0,14}$/.test(value)) return null;
  const id = Number(value);
  return isClipId(id) ? id : null;
}

/** A thumbnail width from a query value, defaulting to 320. Null for one GoodBit will not make. */
export function parseThumbnailWidth(value: string | undefined): ThumbnailWidth | null {
  if (value === undefined) return 320;
  const width = Number(value);
  return (THUMBNAIL_WIDTHS as readonly number[]).includes(width) ? (width as ThumbnailWidth) : null;
}

export function isGameArtKind(value: unknown): value is GameArtKind {
  return typeof value === 'string' && (GAME_ART_KINDS as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
