import express from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs/promises';
import { asyncHandler } from '../utils/asyncHandler.js';
import { clipsService } from '../services/clipsService.js';
import { UpdateGameMetadataAction } from '../actions/UpdateGameMetadataAction.js';
import { apiKeyAuth } from '../middlewares/apiKeyAuth.js';

const uploadDest = process.env.UPLOAD_DIR || path.resolve(process.cwd(), 'public');
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDest),
  filename: (_req, file, cb) => cb(null, file.originalname)
});
const upload = multer({ storage });

export const publishRouter = express.Router();

// Public endpoint - list published files
publishRouter.get('/', asyncHandler(async (_req, res) => {
  const dir = await fs.readdir(uploadDest, { withFileTypes: true });
  const files = dir.filter(d => d.isFile()).map(d => d.name);
  res.json({ files });
}));

// Protected endpoint - publish a clip
publishRouter.post('/', apiKeyAuth, upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Missing file' });
  const displayName = (req.body?.displayName as string | undefined) || req.file.originalname;
  const game = (req.body?.game as string | undefined) || '';
  const result = await clipsService.publish(req.file.path, req.file.originalname, displayName, game);
  res.json(result);
}));

// Protected endpoint - update game metadata
publishRouter.post('/update-game-metadata', apiKeyAuth, asyncHandler(async (req, res) => {
  const { filenames, newGame } = req.body as { filenames: string[]; newGame: string };
  
  if (!Array.isArray(filenames) || !newGame) {
    return res.status(400).json({ error: 'filenames (array) and newGame (string) are required' });
  }

  const action = new UpdateGameMetadataAction();
  const result = await action.execute({ filenames, newGame });
  
  res.json(result);
}));

// Protected endpoint - unpublish a clip
publishRouter.delete('/:filename', apiKeyAuth, asyncHandler(async (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(uploadDest, filename);
  const result = await clipsService.unpublish(filePath);
  res.json(result);
}));


