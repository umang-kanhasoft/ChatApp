import { Router } from 'express';
import { reportTarget } from '../controllers/moderationController.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { reportSchema } from './schemas.js';

const router = Router();

router.use(requireAuth);

router.post('/reports', validateBody(reportSchema), reportTarget);

export default router;
