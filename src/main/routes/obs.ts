import express from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { CheckObsSetupAction } from '../actions/CheckObsSetupAction.js';
import {
  ApplyObsSetupAction,
  ListAudioDevicesAction,
  ListCaptureDisplaysAction,
  PlanObsSetupAction,
  type ObsSetupRequest,
} from '../actions/ApplyObsSetupAction.js';
import {
  InstallObsAction,
  PlanObsInstallAction,
} from '../actions/InstallObsAction.js';
import { LaunchObsAction } from '../actions/LaunchObsAction.js';
import { suppressFirstRunWizard, undoObsSetup } from '../services/obs/setup.js';
import { loadSettings } from '../settings.js';

/**
 * The OBS side of the app, which is most of what a first run is about.
 *
 * Reading is free and safe, so `GET /obs/status` is the endpoint everything
 * else is built on. Writing goes through a plan the user has seen.
 */
export const obsRouter = express.Router();

obsRouter.get(
  '/status',
  asyncHandler(async (_req, res) => {
    res.json(await new CheckObsSetupAction().execute());
  }),
);

/** The screens, with the identifier OBS needs for each one. */
obsRouter.get(
  '/displays',
  asyncHandler(async (_req, res) => {
    res.json(await new ListCaptureDisplaysAction().execute());
  }),
);

/** The audio devices, with the ids OBS stores. */
obsRouter.get(
  '/audio-devices',
  asyncHandler(async (_req, res) => {
    res.json(await new ListAudioDevicesAction().execute());
  }),
);

obsRouter.post(
  '/plan',
  asyncHandler(async (req, res) => {
    res.json(await new PlanObsSetupAction().execute((req.body ?? {}) as ObsSetupRequest));
  }),
);

obsRouter.post(
  '/apply',
  asyncHandler(async (req, res) => {
    res.json(await new ApplyObsSetupAction().execute((req.body ?? {}) as ObsSetupRequest));
  }),
);

/**
 * Stop OBS's own wizard opening, before OBS has ever run.
 *
 * Its own endpoint because it has to happen the moment OBS appears, which may
 * be long before anybody applies a setup: install today, configure tomorrow,
 * and the wizard has already had its turn.
 */
obsRouter.post('/skip-wizard', (_req, res) => {
  suppressFirstRunWizard();
  res.json({ ok: true });
});

obsRouter.post('/undo', (_req, res) => {
  res.json(undoObsSetup());
});

obsRouter.get(
  '/install-plan',
  asyncHandler(async (_req, res) => {
    res.json(await new PlanObsInstallAction().execute());
  }),
);

obsRouter.post(
  '/install',
  asyncHandler(async (req, res) => {
    const { method } = (req.body ?? {}) as { method?: 'winget' | 'download' };
    res.json(await new InstallObsAction().execute({ method }));
  }),
);

obsRouter.post(
  '/launch',
  asyncHandler(async (req, res) => {
    const body = (req.body ?? {}) as {
      startReplayBuffer?: boolean;
      minimized?: boolean;
    };
    res.json(await new LaunchObsAction().execute(body));
  }),
);
