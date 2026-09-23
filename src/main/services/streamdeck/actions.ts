import fs from 'node:fs/promises';
import { clipboard, nativeImage } from 'electron';
import { videoService } from '../videoService.js';
import { AppDataSource } from '../../data-source.js';
import { Clip } from '../../entity/Clip.js';
import { GoodBit } from '../../entity/GoodBit.js';
import { BatchAddTagsAction, BatchDeleteAction } from '../../actions/BatchOperationsAction.js';
import { PublishClipAction } from '../../actions/PublishClipAction.js';
import { incomingDir } from '../capture/incoming.js';
import { isVideoFile } from '@shared/constants/videoFiles.js';
import { discardableFromAKey } from './auth.js';
import { loadSettings } from '../../settings.js';
import { saveReplay } from '../obs/saveReplay.js';

/**
 * What each Stream Deck key does, and nothing more.
 *
 * **A transport, not a place for business logic.** Every handler here finds
 * the clip it is about and hands it to an Action that already exists: tagging
 * is `BatchAddTagsAction`, publishing is `PublishClipAction`, discarding is
 * `BatchDeleteAction` with its unpublish and its Recycle Bin. A second copy of
 * any of those here would be a second place for the unpublish to be forgotten.
 *
 * **"The latest clip" is not always the one on screen.** For a few seconds
 * after the replay key is pressed the new clip is still in staging, not yet in
 * the library, and the newest row is the *previous* clip. A key pressed in
 * that window would tag, publish or discard the wrong recording. The clip
 * toast already solved this: the first card is a promise and the second is the
 * receipt, and the receipt fires on the row, never on the key. So every key
 * that acts on the latest clip refuses while staging holds a file, and says
 * why.
 */

export interface KeyResult {
  status: number;
  body: Record<string, unknown>;
}

const ok = (body: Record<string, unknown>): KeyResult => ({ status: 200, body });
const refused = (status: number, error: string, extra: Record<string, unknown> = {}): KeyResult => ({
  status,
  body: { error, ...extra },
});

/** Whether a clip is between the replay key and the library. */
async function stillSaving(): Promise<boolean> {
  try {
    const entries = await fs.readdir(incomingDir());
    return entries.some((name) => isVideoFile(name) && !name.startsWith('.'));
  } catch {
    // No staging folder is no clip in flight.
    return false;
  }
}

/**
 * The newest recording in the library, never an export.
 *
 * A montage rendered a minute ago is not "the clip you just saved", and a key
 * that tagged or discarded it would be acting on the wrong thing.
 */
async function latestClip(): Promise<Clip | null> {
  return AppDataSource.getRepository(Clip)
    .createQueryBuilder('clip')
    .leftJoinAndSelect('clip.tags', 'tag')
    .where('clip.isExport = 0')
    .orderBy('COALESCE(clip.recordedAt, clip.fileModifiedAt)', 'DESC')
    .addOrderBy('clip.id', 'DESC')
    .getOne();
}

async function latestOrRefusal(): Promise<Clip | KeyResult> {
  if (await stillSaving()) {
    return refused(409, 'Still saving the last clip', { saving: true });
  }
  const clip = await latestClip();
  if (!clip) return refused(404, 'No clips yet');
  return clip;
}

const title = (clip: Clip): string => clip.displayName?.trim() || clip.filename;

export async function health(): Promise<KeyResult> {
  return ok({ ok: true });
}

/**
 * What the key LCD shows. Cheap: three counts and a name.
 *
 * Polled by the plugin, which is fine in a way polling a remote publisher is
 * not: this is a local query against a local database.
 */
export async function stats(): Promise<KeyResult> {
  const repo = AppDataSource.getRepository(Clip);
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [total, today, published, views] = await Promise.all([
    repo.createQueryBuilder('clip').where('clip.isExport = 0').getCount(),
    repo
      .createQueryBuilder('clip')
      .where('clip.isExport = 0')
      .andWhere('COALESCE(clip.recordedAt, clip.fileModifiedAt) >= :start', { start: startOfDay })
      .getCount(),
    repo.createQueryBuilder('clip').where('clip.published = 1').getCount(),
    repo
      .createQueryBuilder('clip')
      .select('COALESCE(SUM(clip.publisherViews), 0)', 'views')
      .getRawOne<{ views: number }>(),
  ]);

  const latest = await latestClip();
  return ok({
    clips: total,
    today,
    published,
    views: Number(views?.views ?? 0),
    latest: latest ? { id: latest.id, title: title(latest), game: latest.game } : null,
    saving: await stillSaving(),
  });
}

/** Tag the latest clip with the tag the key was set up with. */
export async function tagLatest(input: { tag?: unknown }): Promise<KeyResult> {
  const tag = typeof input.tag === 'string' ? input.tag.trim() : '';
  if (!tag) return refused(400, 'This key has no tag set');
  if (tag.length > 60) return refused(400, 'That tag is too long');

  const found = await latestOrRefusal();
  if (!(found instanceof Clip)) return found;

  await new BatchAddTagsAction().execute({ clipIds: [found.id], tags: [tag] });
  return ok({ id: found.id, title: title(found), tag });
}

/**
 * Publish the latest clip.
 *
 * Answered at once and run behind the answer, because an upload is minutes of
 * a home uplink and a key cannot wait that long for its reply. The desktop's
 * own publish progress card still shows where it is.
 */
export async function publishLatest(): Promise<KeyResult> {
  const found = await latestOrRefusal();
  if (!(found instanceof Clip)) return found;
  if (found.published) {
    // Already up: the link is what somebody pressing Publish wants, so it is copied now.
    if (found.publishedUrl) clipboard.writeText(found.publishedUrl);
    return ok({ id: found.id, title: title(found), already: true, url: found.publishedUrl ?? null });
  }
  if (!loadSettings().publisherBaseUrl) return refused(409, 'No publisher is set up');

  /*
   * The link goes on the clipboard once the upload lands, from here rather
   * than from the plugin: a key has no clipboard, and the URL only exists at
   * the end. The key asks `/v1/publish/status` meanwhile, so it can say when.
   */
  void new PublishClipAction()
    .execute({ id: found.id })
    .then(({ clip }) => {
      if (clip.publishedUrl) clipboard.writeText(clip.publishedUrl);
    })
    .catch((error: unknown) => {
      console.error('[streamdeck] publish failed:', error instanceof Error ? error.message : error);
    });
  return { status: 202, body: { id: found.id, title: title(found), publishing: true } };
}

/**
 * Throw the latest clip away, and only when it is safe to from a key.
 *
 * **Off unless switched on**, in Settings, and the plugin only sends this on a
 * long press, never a tap. The server checks both: a request without
 * `confirm: true` is refused, and so is any clip carrying something that only
 * exists in GoodBit (see `discardableFromAKey`). The file goes to the Recycle
 * Bin through `BatchDeleteAction`, the same deleter the library uses.
 */
export async function discardLatest(input: { confirm?: unknown }): Promise<KeyResult> {
  if (!loadSettings().streamDeckAllowDiscard) {
    return refused(403, 'Discarding from the Stream Deck is off in Settings');
  }
  if (input.confirm !== true) return refused(400, 'Hold the key to discard');

  const found = await latestOrRefusal();
  if (!(found instanceof Clip)) return found;

  const verdict = await discardVerdict(found);
  if (!verdict.ok) {
    return refused(409, `Kept: that clip is ${verdict.reason}`, { reason: verdict.reason });
  }

  const result = await new BatchDeleteAction().execute({ clipIds: [found.id] });
  if (result.failed > 0) return refused(500, 'Could not move it to the Recycle Bin');
  return ok({ id: found.id, title: title(found), discarded: true });
}

/**
 * Save the replay buffer: the key the plugin used to send people elsewhere for.
 *
 * `saveReplay` presses the hotkey OBS already has and answers only once a new
 * recording has landed, so a tick on the key means a file exists. The four
 * ways it does not are told apart for the key's title: OBS off, no key bound,
 * a key GoodBit cannot press, and a press that produced nothing, which is
 * almost always a replay buffer that is not running.
 */
export async function saveReplayFromKey(): Promise<KeyResult> {
  const result = await saveReplay();
  if (result.saved) return ok({ saved: true, key: result.key });
  const status = result.reason === 'nothing-landed' ? 504 : result.reason === 'helper' ? 500 : 409;
  return refused(status, result.message, { reason: result.reason });
}

/** Whether a key may throw this clip away. The one rule, used by the press and by the preview. */
async function discardVerdict(clip: Clip): Promise<ReturnType<typeof discardableFromAKey>> {
  const markCount = await AppDataSource.getRepository(GoodBit).count({ where: { clipId: clip.id } });
  return discardableFromAKey({
    displayName: clip.displayName,
    notes: clip.notes,
    starred: clip.starred,
    published: clip.published,
    tagCount: clip.tags?.length ?? 0,
    markCount,
  });
}

/**
 * The clip a discard would act on, before anybody presses anything.
 *
 * "Kept" after a five second hold was the first time somebody learned the
 * newest clip was protected, which is the wrong moment. So the key shows the
 * clip itself, its own thumbnail, and whether it would be kept, and the press
 * only confirms what is already on the key. The picture is 144 pixels square,
 * which is the key's own height at 2x; the cached thumbnail is 1280 wide.
 */
export async function latestPreview(): Promise<KeyResult> {
  if (await stillSaving()) return ok({ saving: true });
  const clip = await latestClip();
  if (!clip) return ok({ none: true });

  let thumbnail: string | null = null;
  try {
    const file = await videoService.ensureThumbnail(clip);
    const image = nativeImage.createFromPath(file);
    if (!image.isEmpty()) {
      /*
       * Cropped square here, not in the key's SVG. The Stream Deck app draws
       * SVG with a renderer that ignores `preserveAspectRatio="... slice"`, so
       * a 21:9 frame handed to it was squashed into the square key rather than
       * covering it. The middle of the frame is where the action is.
       */
      const { width, height } = image.getSize();
      const side = Math.min(width, height);
      const square = image.crop({
        x: Math.floor((width - side) / 2),
        y: Math.floor((height - side) / 2),
        width: side,
        height: side,
      });
      thumbnail = `data:image/jpeg;base64,${square.resize({ width: 144, height: 144 }).toJPEG(82).toString('base64')}`;
    }
  } catch {
    // No picture is a key with a plain face, not a failed key.
  }

  const verdict = await discardVerdict(clip);
  return ok({
    id: clip.id,
    title: title(clip),
    thumbnail,
    allowed: loadSettings().streamDeckAllowDiscard === true,
    discardable: verdict.ok,
    reason: verdict.ok ? null : verdict.reason,
  });
}

/** Whether a publish started from a key has landed, and its link. */
export async function publishStatus(input: { id?: unknown }): Promise<KeyResult> {
  const id = Number(input.id);
  if (!Number.isInteger(id)) return refused(400, 'Which clip?');
  const clip = await AppDataSource.getRepository(Clip).findOneBy({ id });
  if (!clip) return refused(404, 'That clip is gone');
  return ok({ published: clip.published === true, url: clip.published ? clip.publishedUrl ?? null : null });
}
