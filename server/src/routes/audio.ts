import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ListAudioTracksAction } from '../actions/ListAudioTracksAction.js';
import { ImportAudioFilesAction } from '../actions/ImportAudioFilesAction.js';
import { DeleteAudioTrackAction } from '../actions/DeleteAudioTrackAction.js';
import { audioMimeType, resolveAudioPath } from '../services/audioLibrary.js';

// 200 MB is well past any track worth laying under a game clip.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
});

export const audioRouter = express.Router();

audioRouter.get('/', asyncHandler(async (_req, res) => {
  const result = await new ListAudioTracksAction().execute();
  res.json(result);
}));

audioRouter.post('/upload', upload.array('files'), asyncHandler(async (req, res) => {
  const files = req.files as Express.Multer.File[];

  if (!files || files.length === 0) {
    return res.status(400).json({ error: 'No files provided' });
  }

  const result = await new ImportAudioFilesAction().execute({
    files: files.map((f) => ({ name: f.originalname, data: f.buffer })),
  });

  res.json(result);
}));

audioRouter.get('/:id/stream', asyncHandler(async (req, res) => {
  const filePath = resolveAudioPath(req.params.id);
  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Audio track not found' });
  }

  const fileSize = fs.statSync(filePath).size;
  const contentType = audioMimeType(path.extname(filePath));
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    let start = parseInt(parts[0], 10);
    let end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    if (!Number.isFinite(start) || start < 0) start = 0;
    if (!Number.isFinite(end) || end >= fileSize) end = fileSize - 1;
    if (start >= fileSize || start > end) { start = 0; end = fileSize - 1; }

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
      'Content-Type': contentType,
      'Cache-Control': 'no-store',
    });
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Accept-Ranges': 'bytes',
      'Content-Type': contentType,
      'Cache-Control': 'no-store',
    });
    fs.createReadStream(filePath).pipe(res);
  }
}));

audioRouter.delete('/:id', asyncHandler(async (req, res) => {
  const result = await new DeleteAudioTrackAction().execute({ id: req.params.id });
  res.json(result);
}));
