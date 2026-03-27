import { Router } from 'express';
import {
  createStatus,
  createStatusFromUpload,
  deleteStatus,
  getStatusFeed,
  reactStatus,
  viewStatus,
} from '../controllers/statusController.js';
import { requireAuth } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';
import { validateBody } from '../middleware/validate.js';
import { statusCreateSchema, statusReactionSchema } from './schemas.js';

const router = Router();

router.use(requireAuth);

router.get('/', getStatusFeed);
router.post('/', validateBody(statusCreateSchema), createStatus);
router.post('/media', upload.single('file'), createStatusFromUpload);
router.post('/:statusId/view', viewStatus);
router.post('/:statusId/react', validateBody(statusReactionSchema), reactStatus);
router.delete('/:statusId', deleteStatus);

export default router;
