import express from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { CheckObsSetupAction } from '../actions/CheckObsSetupAction.js';
import {
  ApplyObsSetupAction,
  ListAudioDevicesAction,
  ListCaptureDisplaysAction,
  PlanObsSetupAction,
  knownAliases,
  type ObsSetupRequest,
} from '../actions/ApplyObsSetupAction.js';
import {
  CheckPythonAction,
  InstallObsAction,
  InstallPythonAction,
  PlanObsInstallAction,
} from '../actions/InstallObsAction.js';
import { LaunchObsAction } from '../actions/LaunchObsAction.js';
import { suppressFirstRunWizard, undoObsSetup } from '../services/obs/setup.js';
import { SMART_REPLAYS, smartReplaysUrl } from '../services/obs/smartReplays.js';
import { PYTHON_DOWNLOAD_URL } from '../services/obs/python.js';
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

/** What the setup would install, named and attributed, before anything runs. */
obsRouter.get('/script-info', (_req, res) => {
  res.json({
    name: 'Smart Replays',
    version: SMART_REPLAYS.version,
    author: SMART_REPLAYS.author,
    licence: SMART_REPLAYS.licence,
    repository: SMART_REPLAYS.repository,
    forumPage: SMART_REPLAYS.forumPage,
    url: smartReplaysUrl(),
    commit: SMART_REPLAYS.commit,
    pythonDownload: PYTHON_DOWNLOAD_URL,
  });
});

/** The games this machine has, so the dialog can say how many it will name. */
obsRouter.get(
  '/aliases',
  asyncHandler(async (_req, res) => {
    const aliases = await knownAliases(loadSettings().videosRoot);
    res.json({
      count: aliases.length,
      names: aliases.map((entry) => entry.value.split(' > ')[1]).filter(Boolean),
    });
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

/** What Python this machine has, and whether OBS can load any of it. */
obsRouter.get(
  '/python',
  asyncHandler(async (_req, res) => {
    res.json(await new CheckPythonAction().execute());
  }),
);

/** Install one into GoodBit's own folder, for machines with none OBS can use. */
obsRouter.post(
  '/python/install',
  asyncHandler(async (_req, res) => {
    res.json(await new InstallPythonAction().execute());
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
