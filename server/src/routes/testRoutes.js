import { Router } from 'express';
import { created, ok } from '../utils/response.js';
import { resetQaState, seedQaState } from '../testing/fixtures.js';
import { qaRouteManifest, qaSocketEventManifest } from '../testing/manifest.js';

const router = Router();

router.get('/manifest', (_req, res) => {
  ok(res, {
    routes: qaRouteManifest,
    socketEvents: qaSocketEventManifest,
  });
});

router.post('/reset', async (_req, res, next) => {
  try {
    await resetQaState();
    ok(res, { reset: true });
  } catch (error) {
    next(error);
  }
});

router.post('/bootstrap', async (_req, res, next) => {
  try {
    const data = await seedQaState();
    created(res, data);
  } catch (error) {
    next(error);
  }
});

export default router;
