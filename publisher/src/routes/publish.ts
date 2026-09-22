import express from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs/promises';
import { asyncHandler } from '../utils/asyncHandler.js';
import { clipsService } from '../services/clipsService.js';
import { StoreThumbnailAction } from '../actions/StoreThumbnailAction.js';
import { UpdateMetadataAction } from '../actions/UpdateMetadataAction.js';
import { parseGoodBits } from '../utils/goodBits.js';
import { allViewCounts, viewsFor } from '../services/viewCounter.js';

const uploadDest = process.env.UPLOAD_DIR || path.resolve(process.cwd(), 'public');
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDest),
  /*
   * The clip keeps the name it was uploaded with, because every link, the
   * metadata sidecar, the poster and `DELETE /api/publish/:filename` are all
   * addressed by it. `path.basename` because that name came off the network
   * and lands in a `path.join`: it changes nothing about a real upload, which
   * sends a bare filename, and a name with a `../` in it cannot choose where
   * in the filesystem this writes.
   */
  filename: (_req, file, cb) => cb(null, path.basename(file.originalname)),
});
const upload = multer({ storage });

export const publishRouter = express.Router();

publishRouter.get('/', asyncHandler(async (_req, res) => {
  const dir = await fs.readdir(uploadDest, { withFileTypes: true });
  const files = dir.filter(d => d.isFile()).map(d => d.name);
  res.json({ files });
}));

/**
 * What each published clip weighs and how often it has been opened.
 *
 * One document rather than a route per clip: every question the insights
 * screen asks is an aggregate, and the desktop mirrors the answer onto its own
 * rows so the library stays one query.
 *
 * Token-protected like the rest of this router. The counts are not secret, but
 * they are a list of what somebody has published and how popular each one is,
 * which is theirs rather than the internet's.
 *
 * **Counts start at zero on upgrade.** Nothing was recorded before this, so a
 * two-year-old clip and one published this morning both read 0 on day one.
 * `countingSince` is here so a reader can tell "nobody watched it" from
 * "nothing was counting yet", and anything suggesting a cleanup has to respect
 * that or it will confidently recommend deleting the whole library the first
 * time it is opened.
 */
publishRouter.get('/stats', asyncHandler(async (_req, res) => {
  const entries = await fs.readdir(uploadDest, { withFileTypes: true });
  const names = entries
    .filter((entry) => entry.isFile() && !entry.name.endsWith('.meta.json'))
    .map((entry) => entry.name)
    .filter((name) => /\.(mp4|mov|mkv)$/i.test(name));

  const clips = [];
  let totalBytes = 0;
  let totalViews = 0;

  for (const filename of names) {
    let sizeBytes = 0;
    let publishedAt = '';
    try {
      const stat = await fs.stat(path.join(uploadDest, filename));
      sizeBytes = stat.size;
      publishedAt = stat.mtime.toISOString();
    } catch {
      // Vanished between the readdir and the stat. Not an error worth a 500.
      continue;
    }

    const { views, lastViewedAt } = viewsFor(filename);
    totalBytes += sizeBytes;
    totalViews += views;
    clips.push({ filename, sizeBytes, publishedAt, views, lastViewedAt });
  }

  res.json({
    clips,
    totals: { clips: clips.length, bytes: totalBytes, views: totalViews },
    countingSince: countingSince(),
  });
}));

/**
 * When this publisher started counting at all.
 *
 * The oldest `lastViewedAt` it holds, which is the best available answer: the
 * counter keeps no birthday of its own, and an empty file is indistinguishable
 * from one that has never seen a viewer.
 */
function countingSince(): string | null {
  const dates = Object.values(allViewCounts())
    .map((record) => record.lastViewedAt)
    .filter(Boolean)
    .sort();
  return dates[0] ?? null;
}

publishRouter.post('/', upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Missing file' });
  const displayName = (req.body?.displayName as string | undefined) || req.file.originalname;
  const game = (req.body?.game as string | undefined) || '';
  // A multipart field, so a JSON string. Unparseable or absent is no marks,
  // which is what every desktop older than the chaptered player sends.
  const goodBits = parseGoodBits(req.body?.goodBits);
  const result = await clipsService.publish(
    req.file.path,
    req.file.originalname,
    displayName,
    game,
    goodBits,
  );
  res.json(result);
}));

/**
 * The poster frame for a clip that has just been uploaded.
 *
 * A request of its own, rather than a second file on the upload, because the
 * app and the publisher are versioned and shipped separately and neither may
 * assume the other's age. A `thumbnail` part added to `POST /api/publish`
 * would be an unexpected file to every publisher already running, and multer
 * refuses the whole request over one, so publishing would break outright for
 * anybody who updated GoodBit and not their container. Asked for separately, an
 * older publisher answers 404, the app logs it and carries on, and that
 * publisher still has the ffmpeg to draw its own. It is the same bargain
 * `PATCH /:filename/metadata` already lives under.
 *
 * Raw bytes rather than multipart: this is one small JPEG, and multer is here
 * for a file of a few hundred megabytes.
 */
publishRouter.put(
  '/:filename/thumbnail',
  express.raw({ type: 'image/jpeg', limit: '8mb' }),
  asyncHandler(async (req, res) => {
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res
        .status(415)
        .json({ error: 'Expected a JPEG body, with Content-Type: image/jpeg' });
    }

    const filename = path.basename(req.params.filename);

    // A poster for a clip that is not here is a file nothing would ever serve
    // and nothing would ever clean up.
    try {
      await fs.access(path.join(uploadDest, filename));
    } catch {
      return res.status(404).json({ error: 'No such clip' });
    }

    const result = await new StoreThumbnailAction().execute({ filename, jpeg: req.body });
    res.json(result);
  }),
);

publishRouter.patch('/:filename/metadata', asyncHandler(async (req, res) => {
  const filename = path.basename(req.params.filename);
  const { displayName, game } = req.body;

  if (!displayName || !game) {
    return res.status(400).json({ error: 'displayName and game are required' });
  }

  /*
   * `goodBits` is optional and its absence means something: keep what is
   * already in the sidecar. An app that only knows how to rename a clip must
   * not wipe the bands off its player by saying nothing about them.
   */
  const goodBits = parseGoodBits(req.body?.goodBits);

  const action = new UpdateMetadataAction();
  const result = await action.execute({ filename, displayName, game, goodBits });
  res.json(result);
}));

publishRouter.delete('/:filename', asyncHandler(async (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(uploadDest, filename);
  const result = await clipsService.unpublish(filePath);
  res.json(result);
}));
