import { Router } from 'express';
import {
  getActiveGroupCall,
  getCallHistory,
  getCallIceServers,
} from '../controllers/callController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);

router.get('/history', getCallHistory);
router.get('/ice-servers', getCallIceServers);
router.get('/group/active/:conversationId', getActiveGroupCall);

export default router;
