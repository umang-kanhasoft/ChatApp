import { asyncHandler } from '../utils/asyncHandler.js';
import { getIceServers } from '../config/webrtc.js';
import { ensureConversationMember } from '../services/conversationService.js';
import { getActiveGroupCallSessionByConversation } from '../services/groupCallService.js';
import { ok } from '../utils/response.js';
import { listCallHistory } from '../services/callService.js';

const toStringId = (value) => String(value);

const mapGroupCallSession = (session) => ({
  _id: toStringId(session._id),
  conversationId: toStringId(session.conversation?._id || session.conversation),
  hostId: toStringId(session.host?._id || session.host),
  type: session.type,
  status: session.status,
  participants: (session.participants || []).map((entry) => {
    const participantUser = entry.user || {};
    const participantId = toStringId(participantUser._id || participantUser);
    return {
      user: {
        _id: participantId,
        username: participantUser.username || '',
        displayName: participantUser.displayName || '',
        avatar: participantUser.avatar || '',
      },
      joinedAt: entry.joinedAt,
    };
  }),
  startedAt: session.createdAt,
  endedAt: session.endedAt,
});

export const getCallHistory = asyncHandler(async (req, res) => {
  const items = await listCallHistory({
    userId: req.user.id,
    limit: Number(req.query.limit || 30),
  });

  ok(res, items);
});

export const getCallIceServers = asyncHandler(async (_req, res) => {
  ok(res, getIceServers());
});

export const getActiveGroupCall = asyncHandler(async (req, res) => {
  const { conversationId } = req.params;
  await ensureConversationMember(conversationId, req.user.id);
  const session = await getActiveGroupCallSessionByConversation({ conversationId });
  ok(res, session ? mapGroupCallSession(session) : null);
});
