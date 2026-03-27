import { Router } from 'express';
import {
  blockTargetUser,
  getBlockedUsers,
  unblockTargetUser,
} from '../controllers/moderationController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

router.get('/blocked', getBlockedUsers);
router.post('/:userId/block', blockTargetUser);
router.delete('/:userId/unblock', unblockTargetUser);

export default router;
