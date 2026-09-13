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

audioRouter.delete('/:id', asyncHandler(async (req, res) => {
  const result = await new DeleteAudioTrackAction().execute({ id: req.params.id });
  res.json(result);
}));
