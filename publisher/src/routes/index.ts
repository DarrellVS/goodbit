import express from 'express';
import { publishRouter } from './publish.js';

export const apiRouter = express.Router();

apiRouter.use('/publish', publishRouter);


