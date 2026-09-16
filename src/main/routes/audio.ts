import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ListAudioTracksAction } from '../actions/ListAudioTracksAction.js';
import { ImportAudioFilesAction } from '../actions/ImportAudioFilesAction.js';
import { DeleteAudioTrackAction } from '../actions/DeleteAudioTrackAction.js';
import { audioMimeType, resolveAudioPath } from '../services/audioLibrary.js';

export const audioRouter = express.Router();

audioRouter.get('/', asyncHandler(async (_req, res) => {
  const result = await new ListAudioTracksAction().execute();
  res.json(result);
}));

/*
 * Uploading a track does not come through here either. See the note on the
 * same subject in `routes/clips.ts`: the bridge sends JSON and only JSON, so
 * the multipart route was unreachable. `audio:import` over IPC is the one that
 * works, and `ImportAudioFilesAction` is unchanged.
 */

audioRouter.delete('/:id', asyncHandler(async (req, res) => {
  const result = await new DeleteAudioTrackAction().execute({ id: req.params.id });
  res.json(result);
}));
