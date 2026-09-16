import express from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs/promises';
import { asyncHandler } from '../utils/asyncHandler.js';
import { clipsService } from '../services/clipsService.js';
import { StoreThumbnailAction } from '../actions/StoreThumbnailAction.js';
import { UpdateMetadataAction } from '../actions/UpdateMetadataAction.js';

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

publishRouter.post('/', upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Missing file' });
  const displayName = (req.body?.displayName as string | undefined) || req.file.originalname;
  const game = (req.body?.game as string | undefined) || '';
  const result = await clipsService.publish(req.file.path, req.file.originalname, displayName, game);
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

  const action = new UpdateMetadataAction();
  const result = await action.execute({ filename, displayName, game });
  res.json(result);
}));

publishRouter.delete('/:filename', asyncHandler(async (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(uploadDest, filename);
  const result = await clipsService.unpublish(filePath);
  res.json(result);
}));
