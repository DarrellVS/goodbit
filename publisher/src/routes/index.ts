import express from 'express';
import { publishRouter } from './publish.js';
import { requireToken } from '../middlewares/requireToken.js';
import { apiLimit } from '../middlewares/rateLimits.js';

export const apiRouter = express.Router();

/**
 * Everything under `/api/publish` writes to the disk, so everything under it
 * needs the token. Reading stays open: `/media/...` and the embed page are the
 * whole point of the thing.
 *
 * The limit runs before the token, so a wrong guess counts against it too.
 */
apiRouter.use('/publish', apiLimit, requireToken, publishRouter);


