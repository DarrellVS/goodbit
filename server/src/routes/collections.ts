import express from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { CreateCollectionAction } from '../actions/CreateCollectionAction.js';
import { UpdateCollectionAction } from '../actions/UpdateCollectionAction.js';
import { DeleteCollectionAction } from '../actions/DeleteCollectionAction.js';
import { GetCollectionsAction } from '../actions/GetCollectionsAction.js';
import { GetCollectionClipsAction } from '../actions/GetCollectionClipsAction.js';
import { AddClipToCollectionAction } from '../actions/AddClipToCollectionAction.js';
import { RemoveClipFromCollectionAction } from '../actions/RemoveClipFromCollectionAction.js';

export const collectionsRouter = express.Router();

collectionsRouter.get('/', asyncHandler(async (req, res) => {
  const action = new GetCollectionsAction();
  const result = await action.execute();
  res.json(result.collections);
}));

collectionsRouter.post('/', asyncHandler(async (req, res) => {
  const { name } = req.body;
  const action = new CreateCollectionAction();
  const result = await action.execute({ name });
  res.json(result.collection);
}));

collectionsRouter.patch('/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const { name } = req.body;
  const action = new UpdateCollectionAction();
  const result = await action.execute({ id, name });
  res.json(result.collection);
}));

collectionsRouter.delete('/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const action = new DeleteCollectionAction();
  await action.execute({ id });
  res.json({ ok: true });
}));

collectionsRouter.get('/:id/clips', asyncHandler(async (req, res) => {
  const collectionId = Number(req.params.id);
  const { game, q, tags, published, starred, page, pageSize } = req.query as Record<string, string>;
  
  const action = new GetCollectionClipsAction();
  const result = await action.execute({
    collectionId,
    game,
    q,
    tags,
    published,
    starred,
    page: page ? parseInt(page, 10) : undefined,
    pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
  });
  
  res.json(result);
}));

collectionsRouter.post('/:id/clips/:clipId', asyncHandler(async (req, res) => {
  const collectionId = Number(req.params.id);
  const clipId = Number(req.params.clipId);
  const action = new AddClipToCollectionAction();
  const result = await action.execute({ collectionId, clipId });
  res.json(result.collection);
}));

collectionsRouter.delete('/:id/clips/:clipId', asyncHandler(async (req, res) => {
  const collectionId = Number(req.params.id);
  const clipId = Number(req.params.clipId);
  const action = new RemoveClipFromCollectionAction();
  const result = await action.execute({ collectionId, clipId });
  res.json(result.collection);
}));

