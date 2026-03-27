import { Router } from 'express';
import {
  addMembersToGroup,
  createGroup,
  createPrivateConversation,
  deleteConversationMessage,
  editConversationMessage,
  forwardConversationMessage,
  getConversationScheduledMessages,
  getConversationMessages,
  getConversations,
  markConversationAsRead,
  pinConversationMessage,
  reactConversationMessage,
  removeMemberFromGroup,
  searchConversationMessages,
  sendConversationMessage,
  scheduleConversationMessage,
  starConversationMessage,
  updateMemberRoleInGroup,
  uploadConversationMedia,
  cancelConversationScheduledMessage,
  voteConversationPoll,
} from '../controllers/conversationController.js';
import { requireAuth } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import {
  cursorQuerySchema,
  forwardMessageSchema,
  groupAddMembersSchema,
  groupCreateSchema,
  groupRoleSchema,
  messageCreateSchema,
  messageDeleteSchema,
  messageEditSchema,
  pollVoteSchema,
  privateConversationSchema,
  reactionSchema,
  scheduleMessageSchema,
  searchMessagesQuerySchema,
  scheduledMessagesQuerySchema,
} from './schemas.js';

const router = Router();

router.use(requireAuth);

router.get('/', validateQuery(cursorQuerySchema), getConversations);
router.post('/private', validateBody(privateConversationSchema), createPrivateConversation);
router.post('/groups', validateBody(groupCreateSchema), createGroup);
router.post('/:conversationId/read', markConversationAsRead);
router.post('/:conversationId/members', validateBody(groupAddMembersSchema), addMembersToGroup);
router.delete('/:conversationId/members/:userId', removeMemberFromGroup);
router.patch(
  '/:conversationId/members/:userId/role',
  validateBody(groupRoleSchema),
  updateMemberRoleInGroup,
);
router.get(
  '/:conversationId/messages/search',
  validateQuery(searchMessagesQuerySchema),
  searchConversationMessages,
);
router.get('/:conversationId/messages', validateQuery(cursorQuerySchema), getConversationMessages);
router.post('/:conversationId/messages', validateBody(messageCreateSchema), sendConversationMessage);
router.get(
  '/:conversationId/messages/scheduled',
  validateQuery(scheduledMessagesQuerySchema),
  getConversationScheduledMessages,
);
router.post(
  '/:conversationId/messages/scheduled',
  validateBody(scheduleMessageSchema),
  scheduleConversationMessage,
);
router.delete(
  '/:conversationId/messages/scheduled/:scheduledMessageId',
  cancelConversationScheduledMessage,
);
router.post('/:conversationId/messages/media', upload.single('file'), uploadConversationMedia);
router.patch(
  '/:conversationId/messages/:messageId',
  validateBody(messageEditSchema),
  editConversationMessage,
);
router.delete(
  '/:conversationId/messages/:messageId',
  validateQuery(messageDeleteSchema),
  deleteConversationMessage,
);
router.post(
  '/:conversationId/messages/:messageId/reactions',
  validateBody(reactionSchema),
  reactConversationMessage,
);
router.post(
  '/:conversationId/messages/:messageId/poll/vote',
  validateBody(pollVoteSchema),
  voteConversationPoll,
);
router.post('/:conversationId/messages/:messageId/star', starConversationMessage);
router.post('/:conversationId/messages/:messageId/pin', pinConversationMessage);
router.post(
  '/:conversationId/messages/:messageId/forward',
  validateBody(forwardMessageSchema),
  forwardConversationMessage,
);

export default router;
