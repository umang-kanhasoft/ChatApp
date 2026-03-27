import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import ChatUiApp from '../chat-ui/App.jsx';
import CallOverlay from '../chat-ui/components/CallOverlay.jsx';
import GroupCallOverlay from '../chat-ui/components/GroupCallOverlay.jsx';
import { useChatSocket } from '../hooks/useChatSocket.js';
import { isSessionInvalidError, refreshSession } from '../services/api.js';
import { logoutApi, meApi } from '../services/authApi.js';
import {
  createGroupConversationApi,
  createPrivateConversationApi,
  deleteMessageApi,
  editMessageApi,
  forwardMessageApi,
  listConversationsApi,
  listMessagesApi,
  markConversationReadApi,
  pinMessageApi,
  reactMessageApi,
  sendMessageApi,
  starMessageApi,
  uploadMediaApi,
} from '../services/chatApi.js';
import { getActiveGroupCallApi, listCallHistoryApi, listIceServersApi } from '../services/callApi.js';
import { emitSocketAck, getSocket } from '../services/socket.js';
import {
  createStatusApi,
  listStatusFeedApi,
  markStatusViewedApi,
  uploadStatusMediaApi,
} from '../services/statusApi.js';
import { useAuthStore } from '../store/authStore.js';
import { createClientMessageId } from '../utils/ids.js';
import { applyReceiptProgress, getReceiptSummary } from '../utils/messageReceipts.js';

const toStringId = (value) => String(value ?? '');
const PRIVATE_CALL_DISCONNECT_GRACE_MS = 8000;

const getMessageConversationId = (message) =>
  typeof message?.conversation === 'string' ? message.conversation : message?.conversation?._id;

const getConversationItems = (value) => {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  return [];
};

const mapConversationCache = (previous, updater) => {
  const nextItems = updater(getConversationItems(previous));

  if (Array.isArray(previous?.items)) {
    return { ...previous, items: nextItems };
  }

  return {
    items: nextItems,
    nextCursor: previous?.nextCursor || null,
  };
};

const upsertConversation = (previousItems, nextConversation) => {
  const items = [...(previousItems || [])];
  const existingIndex = items.findIndex((item) => toStringId(item._id) === toStringId(nextConversation._id));

  if (existingIndex >= 0) {
    items[existingIndex] = { ...items[existingIndex], ...nextConversation };
  } else {
    items.unshift(nextConversation);
  }

  items.sort((left, right) => new Date(right.lastActivityAt || 0) - new Date(left.lastActivityAt || 0));
  return items;
};

const dedupeMessages = (items) => {
  const seen = new Set();
  const output = [];

  for (const item of items) {
    const key = toStringId(item?._id);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }

  return output;
};

const getInitials = (value) => {
  const words = String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (words.length === 0) return '👤';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
};

const normalizePhoneForLookup = (input) => {
  if (input === null || input === undefined) return '';
  let raw = String(input).trim();
  if (!raw) return '';

  raw = raw.replace(/[\s().-]/g, '');
  if (raw.startsWith('00')) raw = `+${raw.slice(2)}`;

  if (raw.startsWith('+')) {
    raw = `+${raw.slice(1).replace(/\D/g, '')}`;
  } else {
    raw = `+${raw.replace(/\D/g, '')}`;
  }

  if (!/^\+[1-9]\d{7,14}$/.test(raw)) return '';
  return raw;
};

const getConversationPeer = (conversation, currentUserId) =>
  conversation?.participants
    ?.map((entry) => entry.user)
    .find((entry) => toStringId(entry?._id) !== toStringId(currentUserId)) || null;

const getConversationTitle = (conversation, currentUserId) => {
  if (!conversation) return 'Conversation';
  if (conversation.type !== 'private') return conversation.title || 'Group';

  const peer = getConversationPeer(conversation, currentUserId);
  return peer?.displayName || peer?.username || peer?.phone || 'Direct chat';
};

const getConversationPreview = (conversation) => {
  const text = conversation.lastMessage?.content?.text;
  if (text) return text;

  const type = conversation.lastMessage?.type;
  if (type === 'image') return '📷 Photo';
  if (type === 'video') return '🎥 Video';
  if (type === 'audio' || type === 'voice') return '🎤 Audio';
  if (type === 'document') return '📄 Document';
  if (type === 'poll') return '📊 Poll';
  return 'No messages yet';
};

const formatConversationTime = (value) => {
  if (!value) return '';
  const date = dayjs(value);
  if (!date.isValid()) return '';
  return date.isSame(dayjs(), 'day') ? date.format('h:mm A') : date.format('MMM D');
};

const formatLastSeen = (value) => {
  if (!value) return 'last seen recently';
  const date = dayjs(value);
  if (!date.isValid()) return 'last seen recently';
  return `last seen ${date.format('MMM D [at] h:mm A')}`;
};

const formatStatusTime = (value) => {
  if (!value) return '';
  const date = dayjs(value);
  if (!date.isValid()) return '';

  const minutes = dayjs().diff(date, 'minute');
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;

  const hours = dayjs().diff(date, 'hour');
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  return date.format('MMM D, h:mm A');
};

const getUnreadCount = (conversation, currentUserId) => {
  const participant = conversation.participants?.find(
    (entry) => toStringId(entry.user?._id || entry.user) === toStringId(currentUserId),
  );
  return Number(participant?.unreadCount || 0);
};

const isMutedConversation = (conversation, currentUserId) => {
  const participant = conversation.participants?.find(
    (entry) => toStringId(entry.user?._id || entry.user) === toStringId(currentUserId),
  );
  return Boolean(participant?.isMuted);
};

const getMessageStatus = (message, currentUserId, participantCount) => {
  const senderId = toStringId(message.sender?._id || message.sender);
  if (senderId !== toStringId(currentUserId)) return '';

  const { deliveredCount, readCount, peers } = getReceiptSummary(message, participantCount);

  if (readCount - 1 >= peers) return 'read';
  if (deliveredCount - 1 >= peers) return 'delivered';
  return 'sent';
};

const buildOptimisticMessage = ({
  clientTempId,
  conversationId,
  user,
  text,
  replyTo = null,
  createdAt = new Date().toISOString(),
}) => ({
  _id: clientTempId,
  conversation: conversationId,
  sender: {
    _id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatar: user.avatar || '',
  },
  type: 'text',
  content: {
    text,
  },
  replyTo,
  createdAt,
  deliveredTo: [{ user: user.id, at: createdAt }],
  readBy: [{ user: user.id, at: createdAt }],
  optimistic: true,
});

const mapGroupCallSession = (session) => ({
  _id: toStringId(session?._id),
  conversationId: toStringId(session?.conversationId || session?.conversation?._id || session?.conversation),
  hostId: toStringId(session?.hostId || session?.host?._id || session?.host),
  type: session?.type || 'voice',
  status: session?.status || 'active',
  participants: (session?.participants || []).map((entry) => {
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
  startedAt: session?.startedAt || session?.createdAt || null,
  endedAt: session?.endedAt || null,
});

const dialogInputClass =
  'w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition focus:border-[#0A7CFF] focus:bg-white/10';

function ModalOverlay({ children, onClose }) {
  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div onClick={(event) => event.stopPropagation()}>{children}</div>
    </div>
  );
}

function DialogCard({ title, description = '', children, footer, maxWidth = 'max-w-md' }) {
  return (
    <div
      className={`w-[min(100vw-2rem,40rem)] ${maxWidth} overflow-hidden rounded-[28px] border border-white/10 bg-[#10191f] text-white shadow-[0_30px_80px_rgba(0,0,0,0.45)]`}
    >
      <div className="border-b border-white/10 px-6 py-5">
        <h2 className="text-lg font-semibold">{title}</h2>
        {description ? <p className="mt-2 text-sm text-white/65">{description}</p> : null}
      </div>
      <div className="px-6 py-5">{children}</div>
      {footer ? <div className="flex justify-end gap-3 border-t border-white/10 px-6 py-4">{footer}</div> : null}
    </div>
  );
}

export default function ChatPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const storedUser = useAuthStore((state) => state.user);
  const accessToken = useAuthStore((state) => state.accessToken);
  const refreshToken = useAuthStore((state) => state.refreshToken);
  const setAuth = useAuthStore((state) => state.setAuth);
  const clearAuth = useAuthStore((state) => state.clearAuth);

  const [activeConversationId, setActiveConversationId] = useState('');
  const [activeConversationDraft, setActiveConversationDraft] = useState(null);
  const [typingByConversation, setTypingByConversation] = useState({});

  const [callState, setCallState] = useState('idle');
  const [callType, setCallType] = useState('voice');
  const [incomingCall, setIncomingCall] = useState(null);
  const [activeCallId, setActiveCallId] = useState('');
  const [callPartnerId, setCallPartnerId] = useState('');
  const [groupCallSession, setGroupCallSession] = useState(null);
  const [groupCallState, setGroupCallState] = useState('idle');
  const [groupRemoteUserIds, setGroupRemoteUserIds] = useState([]);
  const [groupCallMediaByUser, setGroupCallMediaByUser] = useState({});
  const [groupLocalAudioEnabled, setGroupLocalAudioEnabled] = useState(true);
  const [groupLocalVideoEnabled, setGroupLocalVideoEnabled] = useState(true);

  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const activeCallIdRef = useRef('');
  const incomingCallRef = useRef(null);
  const callStateRef = useRef('idle');
  const callPartnerIdRef = useRef('');
  const callTypeRef = useRef('voice');
  const callDisconnectTimerRef = useRef(null);
  const privateCallBootstrapRef = useRef(false);
  const sessionRestoreAttemptedRef = useRef(false);
  const callStartedAtRef = useRef(0);
  const pendingSignalsRef = useRef({});
  const groupLocalStreamRef = useRef(null);
  const groupLocalVideoRef = useRef(null);
  const groupPeerConnectionsRef = useRef({});
  const groupRemoteStreamsRef = useRef({});
  const groupPendingSignalsRef = useRef({});
  const groupRemoteVideoRefsRef = useRef({});
  const groupRemoteAudioRefsRef = useRef({});
  const currentGroupCallSessionIdRef = useRef('');
  const currentGroupCallJoinedRef = useRef(false);
  const joinedConversationsRef = useRef(new Set());
  const lastReadEmitRef = useRef({});
  const statusFileInputRef = useRef(null);

  const [noticeDialog, setNoticeDialog] = useState(null);
  const [groupDialog, setGroupDialog] = useState({
    open: false,
    title: '',
    memberIds: [],
  });
  const [deleteDialog, setDeleteDialog] = useState({
    open: false,
    messageId: '',
    scope: 'everyone',
  });
  const [forwardDialog, setForwardDialog] = useState({
    open: false,
    message: null,
    targetConversationId: '',
  });
  const [statusComposer, setStatusComposer] = useState({
    open: false,
    text: '',
    privacy: 'all',
    file: null,
  });

  useEffect(() => {
    activeCallIdRef.current = activeCallId;
  }, [activeCallId]);

  useEffect(() => {
    incomingCallRef.current = incomingCall;
  }, [incomingCall]);

  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  useEffect(() => {
    callPartnerIdRef.current = callPartnerId;
  }, [callPartnerId]);

  useEffect(() => {
    callTypeRef.current = callType;
  }, [callType]);

  useEffect(() => {
    if (accessToken) {
      sessionRestoreAttemptedRef.current = false;
      return;
    }

    if (!refreshToken || sessionRestoreAttemptedRef.current) {
      return;
    }

    sessionRestoreAttemptedRef.current = true;
    let cancelled = false;

    void refreshSession().catch((error) => {
      if (cancelled) return;

      if (isSessionInvalidError(error)) {
        queryClient.clear();
        clearAuth();
        navigate('/login', { replace: true });
        return;
      }

      sessionRestoreAttemptedRef.current = false;
    });

    return () => {
      cancelled = true;
    };
  }, [accessToken, clearAuth, navigate, queryClient, refreshToken]);

  const meQuery = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: meApi,
    enabled: Boolean(accessToken),
    retry: (failureCount, error) => !isSessionInvalidError(error) && failureCount < 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 5000),
  });

  const currentUser = meQuery.data || storedUser;

  const showNotice = useCallback((title, message) => {
    setNoticeDialog({ title, message });
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      if (refreshToken) {
        await logoutApi(refreshToken);
      }
    } catch {
      // Keep local logout deterministic even if the remote session is already gone.
    } finally {
      queryClient.clear();
      clearAuth();
      navigate('/login', { replace: true });
    }
  }, [clearAuth, navigate, queryClient, refreshToken]);

  useEffect(() => {
    if (meQuery.data) {
      setAuth({
        user: meQuery.data,
        accessToken,
        refreshToken,
      });
    }
  }, [accessToken, meQuery.data, refreshToken, setAuth]);

  useEffect(() => {
    if (!meQuery.error) return;
    if (!isSessionInvalidError(meQuery.error)) return;

    queryClient.clear();
    clearAuth();
    navigate('/login', { replace: true });
  }, [clearAuth, meQuery.error, navigate, queryClient]);

  const conversationsQuery = useQuery({
    queryKey: ['conversations'],
    queryFn: listConversationsApi,
    enabled: Boolean(accessToken),
    select: (data) => getConversationItems(data),
  });

  const statusFeedQuery = useQuery({
    queryKey: ['status', 'feed'],
    queryFn: listStatusFeedApi,
    enabled: Boolean(accessToken),
    staleTime: 10000,
  });

  const callHistoryQuery = useQuery({
    queryKey: ['calls', 'history'],
    queryFn: listCallHistoryApi,
    enabled: Boolean(accessToken),
    staleTime: 10000,
  });

  const iceServersQuery = useQuery({
    queryKey: ['calls', 'ice-servers'],
    queryFn: listIceServersApi,
    enabled: Boolean(accessToken),
    staleTime: 5 * 60 * 1000,
  });

  const conversations = conversationsQuery.data || [];
  const statusFeed = statusFeedQuery.data || [];
  const callHistory = callHistoryQuery.data || [];

  const iceServers = useMemo(() => {
    if (Array.isArray(iceServersQuery.data) && iceServersQuery.data.length > 0) {
      return iceServersQuery.data;
    }
    return [{ urls: 'stun:stun.l.google.com:19302' }];
  }, [iceServersQuery.data]);

  useEffect(() => {
    if (!activeConversationId) {
      setActiveConversationDraft(null);
      return;
    }

    const found = conversations.find((conversation) => toStringId(conversation._id) === toStringId(activeConversationId));
    if (found) {
      setActiveConversationDraft(null);
    }
  }, [activeConversationId, conversations]);

  const activeConversation = useMemo(() => {
    const found = conversations.find((conversation) => toStringId(conversation._id) === toStringId(activeConversationId));
    if (found) return found;

    if (activeConversationDraft && toStringId(activeConversationDraft._id) === toStringId(activeConversationId)) {
      return activeConversationDraft;
    }

    return null;
  }, [activeConversationDraft, activeConversationId, conversations]);

  const myParticipant = useMemo(() => {
    if (!activeConversation || !currentUser?.id) return null;
    return activeConversation.participants?.find(
      (entry) => toStringId(entry.user?._id || entry.user) === toStringId(currentUser.id),
    );
  }, [activeConversation, currentUser?.id]);

  const myGroupRole = myParticipant?.role || 'member';
  const participantCount = activeConversation?.participants?.length || 2;

  const activeGroupCallQuery = useQuery({
    queryKey: ['calls', 'group-active', activeConversationId],
    queryFn: () => getActiveGroupCallApi(activeConversationId),
    enabled: Boolean(accessToken && activeConversationId && activeConversation?.type === 'group'),
    staleTime: 5000,
  });

  const messagesQuery = useQuery({
    queryKey: ['messages', activeConversationId],
    queryFn: () => listMessagesApi(activeConversationId),
    enabled: Boolean(activeConversationId),
  });

  const rawMessages = messagesQuery.data?.items || [];
  const groupCallParticipants = groupCallSession?.participants || [];
  const groupCallType = groupCallSession?.type || 'voice';
  const isCurrentUserInGroupCall = groupCallParticipants.some(
    (entry) => toStringId(entry.user?._id || entry.user) === toStringId(currentUser?.id),
  );
  const canEndGroupCall =
    Boolean(groupCallSession) &&
    (toStringId(groupCallSession.hostId) === toStringId(currentUser?.id) || ['owner', 'admin'].includes(myGroupRole));

  useEffect(() => {
    currentGroupCallSessionIdRef.current = groupCallSession?._id || '';
    currentGroupCallJoinedRef.current = isCurrentUserInGroupCall;
  }, [groupCallSession?._id, isCurrentUserInGroupCall]);

  useEffect(() => {
    if (!activeConversationId || activeConversation?.type !== 'group') {
      setGroupCallSession(null);
      return;
    }

    if (!activeGroupCallQuery.data) {
      setGroupCallSession(null);
      return;
    }

    setGroupCallSession(mapGroupCallSession(activeGroupCallQuery.data));
  }, [activeConversation?.type, activeConversationId, activeGroupCallQuery.data]);

  useEffect(() => {
    if (!groupCallSession?.participants?.length) {
      setGroupCallMediaByUser({});
      return;
    }

    const defaultVideoEnabled = groupCallSession.type === 'video';
    setGroupCallMediaByUser((previous) => {
      const next = {};
      for (const participant of groupCallSession.participants || []) {
        const participantId = toStringId(participant.user?._id || participant.user);
        if (!participantId) continue;
        next[participantId] = {
          audioEnabled: previous[participantId]?.audioEnabled ?? true,
          videoEnabled: previous[participantId]?.videoEnabled ?? defaultVideoEnabled,
        };
      }
      return next;
    });
  }, [groupCallSession?.participants, groupCallSession?.type]);

  const updateMessageInCache = useCallback(
    (conversationId, updater) => {
      if (!conversationId) return;

      queryClient.setQueryData(['messages', conversationId], (previous) => {
        if (!previous) {
          const next = updater([]);
          return { items: next, nextCursor: null };
        }

        return {
          ...previous,
          items: updater(previous.items || []),
        };
      });
    },
    [queryClient],
  );

  const getConversationParticipantCount = useCallback(
    (conversationId) => {
      const cachedConversations = getConversationItems(queryClient.getQueryData(['conversations']));
      const conversation = cachedConversations.find(
        (entry) => toStringId(entry?._id) === toStringId(conversationId),
      );
      return Math.max((conversation?.participants || []).length, 2);
    },
    [queryClient],
  );

  const handleConversationUpdate = useCallback(
    (conversation) => {
      queryClient.setQueryData(['conversations'], (previous) =>
        mapConversationCache(previous, (items) => upsertConversation(items, conversation)),
      );

      const conversationId = toStringId(conversation?._id);
      if (!conversationId || joinedConversationsRef.current.has(conversationId)) {
        return;
      }

      const socket = getSocket();
      if (!socket?.connected) return;

      socket.emit('conversation:join', { conversationId }, (ack) => {
        if (ack?.ok) {
          joinedConversationsRef.current.add(conversationId);
        }
      });
    },
    [queryClient],
  );

  const syncConversationPreview = useCallback(
    (conversationId, message) => {
      if (!conversationId || !message) return;

      queryClient.setQueryData(['conversations'], (previous) => {
        const previousItems = getConversationItems(previous);
        const existingConversation =
          previousItems.find((item) => toStringId(item._id) === toStringId(conversationId)) ||
          conversations.find((item) => toStringId(item._id) === toStringId(conversationId));

        const nextConversation = {
          ...(existingConversation || { _id: conversationId, participants: [], type: 'private' }),
          lastMessage: message,
          lastActivityAt: message.createdAt || new Date().toISOString(),
        };

        return mapConversationCache(previous, (items) => upsertConversation(items, nextConversation));
      });
    },
    [conversations, queryClient],
  );

  const handleIncomingMessage = useCallback(
    (message) => {
      const conversationId = getMessageConversationId(message);
      if (!conversationId) return;

      updateMessageInCache(conversationId, (previousItems) => dedupeMessages([...previousItems, message]));
      syncConversationPreview(conversationId, message);

      const senderId = toStringId(message.sender?._id || message.sender);
      if (toStringId(currentUser?.id) !== senderId) {
        const socket = getSocket();
        socket?.emit('message:delivered', {
          conversationId,
          messageId: message._id,
        });
      }
    },
    [currentUser?.id, syncConversationPreview, updateMessageInCache],
  );

  const handleMessageUpdate = useCallback(
    (message) => {
      const conversationId = getMessageConversationId(message);
      if (!conversationId) return;

      updateMessageInCache(conversationId, (previousItems) => {
        const index = previousItems.findIndex((item) => toStringId(item._id) === toStringId(message._id));
        if (index === -1) return dedupeMessages([...previousItems, message]);

        const next = [...previousItems];
        next[index] = message;
        return dedupeMessages(next);
      });

      syncConversationPreview(conversationId, message);
    },
    [syncConversationPreview, updateMessageInCache],
  );

  const applyReceiptBoundaryUpdate = useCallback(
    ({
      conversationId,
      readerId,
      at,
      boundaryMessageId,
      markDelivered = true,
      markRead = false,
    }) => {
      if (!conversationId || !boundaryMessageId || !readerId) return;

      const participantCount = getConversationParticipantCount(conversationId);
      updateMessageInCache(conversationId, (previousItems) => {
        const boundaryIndex = previousItems.findIndex(
          (message) => toStringId(message._id) === toStringId(boundaryMessageId),
        );
        if (boundaryIndex === -1) return previousItems;

        return previousItems.map((message, index) => {
          if (index > boundaryIndex) return message;
          if (toStringId(message.sender?._id || message.sender) === toStringId(readerId)) {
            return message;
          }

          return applyReceiptProgress(message, readerId, at, {
            markDelivered,
            markRead,
            participantCount,
          });
        });
      });

      queryClient.setQueryData(['conversations'], (previous) =>
        mapConversationCache(previous, (items) =>
          items.map((conversation) => {
            if (toStringId(conversation?._id) !== toStringId(conversationId)) {
              return conversation;
            }

            if (toStringId(conversation?.lastMessage?._id) !== toStringId(boundaryMessageId)) {
              return conversation;
            }

            return {
              ...conversation,
              lastMessage: applyReceiptProgress(conversation.lastMessage, readerId, at, {
                markDelivered,
                markRead,
                participantCount,
              }),
            };
          }),
        ),
      );
    },
    [getConversationParticipantCount, queryClient, updateMessageInCache],
  );

  const handleRemoveSelfMessage = useCallback(
    ({ conversationId, messageId }) => {
      updateMessageInCache(conversationId, (previousItems) =>
        previousItems.filter((message) => toStringId(message._id) !== toStringId(messageId)),
      );
    },
    [updateMessageInCache],
  );

  const handleDeliveryUpdate = useCallback(
    ({ conversationId, lastDeliveredMessageId, userId: readerId, at }) => {
      applyReceiptBoundaryUpdate({
        conversationId,
        readerId,
        at,
        boundaryMessageId: lastDeliveredMessageId,
        markDelivered: true,
        markRead: false,
      });
    },
    [applyReceiptBoundaryUpdate],
  );

  const handleReadUpdate = useCallback(
    ({ conversationId, lastReadMessageId, lastDeliveredMessageId, userId: readerId, at }) => {
      applyReceiptBoundaryUpdate({
        conversationId,
        readerId,
        at,
        boundaryMessageId: lastDeliveredMessageId || lastReadMessageId,
        markDelivered: true,
        markRead: false,
      });
      applyReceiptBoundaryUpdate({
        conversationId,
        readerId,
        at,
        boundaryMessageId: lastReadMessageId,
        markDelivered: true,
        markRead: true,
      });
    },
    [applyReceiptBoundaryUpdate],
  );

  const handleTypingUpdate = useCallback((payload) => {
    setTypingByConversation((previous) => {
      const conversationId = toStringId(payload?.conversationId);
      if (!conversationId) return previous;

      const existing = previous[conversationId] || {};
      const next = { ...existing };

      if (payload.isTyping) {
        next[payload.userId] = payload;
      } else {
        delete next[payload.userId];
      }

      return {
        ...previous,
        [conversationId]: next,
      };
    });
  }, []);

  const handlePresenceUpdate = useCallback(
    (payload) => {
      if (!payload?.userId) return;

      queryClient.setQueryData(['conversations'], (previous) =>
        mapConversationCache(previous, (items) =>
          items.map((conversation) => ({
            ...conversation,
            participants: (conversation.participants || []).map((participant) => {
              const participantId = toStringId(participant.user?._id || participant.user);
              if (participantId !== toStringId(payload.userId)) return participant;

              return {
                ...participant,
                user: {
                  ...(participant.user || {}),
                  isOnline: Boolean(payload.isOnline),
                  lastSeen: payload.lastSeen,
                },
              };
            }),
          })),
        ),
      );

      setActiveConversationDraft((previous) => {
        if (!previous) return previous;
        return {
          ...previous,
          participants: (previous.participants || []).map((participant) => {
            const participantId = toStringId(participant.user?._id || participant.user);
            if (participantId !== toStringId(payload.userId)) return participant;

            return {
              ...participant,
              user: {
                ...(participant.user || {}),
                isOnline: Boolean(payload.isOnline),
                lastSeen: payload.lastSeen,
              },
            };
          }),
        };
      });
    },
    [queryClient],
  );

  const stopStreams = useCallback(() => {
    if (localStreamRef.current) {
      for (const track of localStreamRef.current.getTracks()) {
        track.stop();
      }
      localStreamRef.current = null;
    }

    if (remoteStreamRef.current) {
      for (const track of remoteStreamRef.current.getTracks()) {
        track.stop();
      }
      remoteStreamRef.current = null;
    }

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
  }, []);

  const clearCallDisconnectTimer = useCallback(() => {
    if (!callDisconnectTimerRef.current) return;
    clearTimeout(callDisconnectTimerRef.current);
    callDisconnectTimerRef.current = null;
  }, []);

  const resetCallState = useCallback(() => {
    clearCallDisconnectTimer();
    if (peerConnectionRef.current) {
      peerConnectionRef.current.onicecandidate = null;
      peerConnectionRef.current.ontrack = null;
      peerConnectionRef.current.onconnectionstatechange = null;
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    stopStreams();
    incomingCallRef.current = null;
    activeCallIdRef.current = '';
    callStateRef.current = 'idle';
    callPartnerIdRef.current = '';
    callTypeRef.current = 'voice';
    privateCallBootstrapRef.current = false;
    setIncomingCall(null);
    setActiveCallId('');
    setCallPartnerId('');
    setCallState('idle');
    callStartedAtRef.current = 0;
    pendingSignalsRef.current = {};
  }, [clearCallDisconnectTimer, stopStreams]);

  useEffect(() => () => clearCallDisconnectTimer(), [clearCallDisconnectTimer]);

  const createPeerConnection = useCallback(
    (callId, partnerUserId) => {
      const socket = getSocket();
      if (!socket) return null;

      const peerConnection = new RTCPeerConnection({
        iceServers,
      });

      peerConnection.onicecandidate = (event) => {
        if (!event.candidate) return;
        socket.emit('call:signal', {
          callId,
          toUserId: partnerUserId,
          signal: { candidate: event.candidate },
        });
      };

      peerConnection.ontrack = (event) => {
        const [stream] = event.streams;
        if (!stream) return;
        remoteStreamRef.current = stream;
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = stream;
        }
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = stream;
        }
      };

      peerConnection.onconnectionstatechange = () => {
        const state = peerConnection.connectionState;
        const hasRemoteDescription = Boolean(peerConnection.remoteDescription);
        if (state === 'connecting') {
          clearCallDisconnectTimer();
          if (callStateRef.current !== 'connected') {
            callStateRef.current = 'connecting';
            setCallState('connecting');
          }
          return;
        }

        if (state === 'connected') {
          clearCallDisconnectTimer();
          callStateRef.current = 'connected';
          setCallState('connected');
          if (!callStartedAtRef.current) {
            callStartedAtRef.current = Date.now();
          }
          return;
        }

        if (['disconnected', 'failed', 'closed'].includes(state)) {
          if (!hasRemoteDescription) {
            callStateRef.current = 'connecting';
            setCallState('connecting');
            return;
          }

          clearCallDisconnectTimer();
          callDisconnectTimerRef.current = setTimeout(() => {
            if (peerConnectionRef.current !== peerConnection) return;
            const latestState = peerConnection.connectionState;
            if (latestState === 'connected' || latestState === 'connecting') return;
            resetCallState();
          }, PRIVATE_CALL_DISCONNECT_GRACE_MS);
          return;
        }
      };

      if (localStreamRef.current) {
        for (const track of localStreamRef.current.getTracks()) {
          peerConnection.addTrack(track, localStreamRef.current);
        }
      }

      peerConnectionRef.current = peerConnection;
      return peerConnection;
    },
    [clearCallDisconnectTimer, iceServers, resetCallState],
  );

  const startLocalMedia = useCallback(async (nextCallType) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Media devices are unavailable');
    }

    const mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: nextCallType === 'video',
    });

    localStreamRef.current = mediaStream;
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = mediaStream;
    }

    return mediaStream;
  }, []);

  const queuePendingSignal = useCallback((payload) => {
    if (!payload?.callId) return;
    const queue = pendingSignalsRef.current[payload.callId] || [];
    pendingSignalsRef.current[payload.callId] = [...queue, payload];
  }, []);

  const applyCallSignal = useCallback(
    async ({ callId, fromUserId, signal }) => {
      const peerConnection = peerConnectionRef.current;
      const socket = getSocket();
      if (!peerConnection || !socket) {
        queuePendingSignal({ callId, fromUserId, signal });
        return;
      }

      if (signal?.description) {
        const description = new RTCSessionDescription(signal.description);
        await peerConnection.setRemoteDescription(description);

        if (description.type === 'offer') {
          const answer = await peerConnection.createAnswer();
          await peerConnection.setLocalDescription(answer);

          socket.emit('call:signal', {
            callId,
            toUserId: fromUserId,
            signal: { description: peerConnection.localDescription },
          });
        }

        if (description.type === 'answer') {
          setCallState('connected');
          if (!callStartedAtRef.current) {
            callStartedAtRef.current = Date.now();
          }
        }
      }

      if (signal?.candidate) {
        if (!peerConnection.remoteDescription) {
          queuePendingSignal({ callId, fromUserId, signal });
          return;
        }

        try {
          await peerConnection.addIceCandidate(new RTCIceCandidate(signal.candidate));
        } catch {
          // Ignore malformed candidates.
        }
      }
    },
    [queuePendingSignal],
  );

  const flushPendingSignals = useCallback(
    async (callId) => {
      if (!callId) return;

      let loopGuard = 0;
      while (loopGuard < 6) {
        const queue = pendingSignalsRef.current[callId];
        if (!queue?.length) return;

        delete pendingSignalsRef.current[callId];

        for (const payload of queue) {
          await applyCallSignal(payload);
        }

        loopGuard += 1;
        const remainder = pendingSignalsRef.current[callId];
        if (!remainder?.length) return;

        const hasDescription = remainder.some((entry) => Boolean(entry?.signal?.description));
        if (!hasDescription && !peerConnectionRef.current?.remoteDescription) {
          return;
        }
      }
    },
    [applyCallSignal],
  );

  useEffect(() => {
    if (!activeCallId) return;
    void flushPendingSignals(activeCallId);
  }, [activeCallId, flushPendingSignals]);

  const beginOutgoingPrivateCall = useCallback(
    async ({ callId, partnerUserId, nextCallType }) => {
      if (!callId || !partnerUserId) {
        resetCallState();
        return false;
      }

      if (privateCallBootstrapRef.current) {
        return true;
      }

      privateCallBootstrapRef.current = true;

      try {
        if (!localStreamRef.current) {
          await startLocalMedia(nextCallType);
        }

        const peerConnection = peerConnectionRef.current || createPeerConnection(callId, partnerUserId);
        if (!peerConnection) {
          resetCallState();
          return false;
        }

        await flushPendingSignals(callId);

        if (!peerConnection.localDescription) {
          const offer = await peerConnection.createOffer();
          await peerConnection.setLocalDescription(offer);

          getSocket()?.emit('call:signal', {
            callId,
            toUserId: partnerUserId,
            signal: { description: peerConnection.localDescription },
          });
        }

        callStateRef.current = 'connecting';
        setCallState('connecting');
        return true;
      } finally {
        privateCallBootstrapRef.current = false;
      }
    },
    [createPeerConnection, flushPendingSignals, resetCallState, startLocalMedia],
  );

  const attachGroupRemoteStream = useCallback((peerUserId, stream) => {
    const key = toStringId(peerUserId);

    const videoElement = groupRemoteVideoRefsRef.current[key];
    if (videoElement) {
      videoElement.srcObject = stream;
    }

    const audioElement = groupRemoteAudioRefsRef.current[key];
    if (audioElement) {
      audioElement.srcObject = stream;
    }
  }, []);

  const closeGroupPeerConnection = useCallback((peerUserId) => {
    const key = toStringId(peerUserId);
    const peerConnection = groupPeerConnectionsRef.current[key];
    if (peerConnection) {
      peerConnection.onicecandidate = null;
      peerConnection.ontrack = null;
      peerConnection.onconnectionstatechange = null;
      peerConnection.close();
      delete groupPeerConnectionsRef.current[key];
    }

    const stream = groupRemoteStreamsRef.current[key];
    if (stream) {
      for (const track of stream.getTracks()) {
        track.stop();
      }
      delete groupRemoteStreamsRef.current[key];
    }

    const videoElement = groupRemoteVideoRefsRef.current[key];
    if (videoElement) {
      videoElement.srcObject = null;
    }

    const audioElement = groupRemoteAudioRefsRef.current[key];
    if (audioElement) {
      audioElement.srcObject = null;
    }

    delete groupPendingSignalsRef.current[key];
    setGroupRemoteUserIds((previous) => previous.filter((id) => toStringId(id) !== key));
  }, []);

  const resetGroupCallMedia = useCallback(() => {
    for (const peerUserId of Object.keys(groupPeerConnectionsRef.current)) {
      closeGroupPeerConnection(peerUserId);
    }

    if (groupLocalStreamRef.current) {
      for (const track of groupLocalStreamRef.current.getTracks()) {
        track.stop();
      }
      groupLocalStreamRef.current = null;
    }

    if (groupLocalVideoRef.current) {
      groupLocalVideoRef.current.srcObject = null;
    }

    groupPeerConnectionsRef.current = {};
    groupPendingSignalsRef.current = {};
    groupRemoteStreamsRef.current = {};
    groupRemoteVideoRefsRef.current = {};
    groupRemoteAudioRefsRef.current = {};
    setGroupRemoteUserIds([]);
    setGroupCallMediaByUser({});
    setGroupLocalAudioEnabled(true);
    setGroupLocalVideoEnabled(true);
    setGroupCallState('idle');
  }, [closeGroupPeerConnection]);

  const queueGroupPendingSignal = useCallback((payload) => {
    const peerUserId = toStringId(payload?.fromUserId);
    if (!peerUserId) return;
    const queue = groupPendingSignalsRef.current[peerUserId] || [];
    groupPendingSignalsRef.current[peerUserId] = [...queue, payload];
  }, []);

  const createGroupPeerConnection = useCallback(
    (peerUserId, sessionId) => {
      const key = toStringId(peerUserId);
      if (!key || !sessionId) return null;

      const existing = groupPeerConnectionsRef.current[key];
      if (existing) return existing;

      const socket = getSocket();
      if (!socket) return null;

      const peerConnection = new RTCPeerConnection({ iceServers });

      peerConnection.onicecandidate = (event) => {
        if (!event.candidate) return;
        socket.emit('group-call:signal', {
          sessionId,
          toUserId: key,
          signal: { candidate: event.candidate },
        });
      };

      peerConnection.ontrack = (event) => {
        const [stream] = event.streams;
        if (!stream) return;
        groupRemoteStreamsRef.current[key] = stream;
        attachGroupRemoteStream(key, stream);
        setGroupRemoteUserIds((previous) => (previous.includes(key) ? previous : [...previous, key]));
      };

      peerConnection.onconnectionstatechange = () => {
        if (['failed', 'disconnected', 'closed'].includes(peerConnection.connectionState)) {
          closeGroupPeerConnection(key);
        }
      };

      if (groupLocalStreamRef.current) {
        for (const track of groupLocalStreamRef.current.getTracks()) {
          peerConnection.addTrack(track, groupLocalStreamRef.current);
        }
      }

      groupPeerConnectionsRef.current[key] = peerConnection;
      return peerConnection;
    },
    [attachGroupRemoteStream, closeGroupPeerConnection, iceServers],
  );

  const applyGroupSignal = useCallback(
    async ({ sessionId, fromUserId, signal }) => {
      const peerUserId = toStringId(fromUserId);
      if (!peerUserId) return;
      if (!groupLocalStreamRef.current) {
        queueGroupPendingSignal({ sessionId, fromUserId: peerUserId, signal });
        return;
      }

      let peerConnection = groupPeerConnectionsRef.current[peerUserId];
      if (!peerConnection) {
        peerConnection = createGroupPeerConnection(peerUserId, sessionId);
      }

      if (!peerConnection) {
        queueGroupPendingSignal({ sessionId, fromUserId: peerUserId, signal });
        return;
      }

      if (signal?.description) {
        const description = new RTCSessionDescription(signal.description);
        await peerConnection.setRemoteDescription(description);

        if (description.type === 'offer') {
          const answer = await peerConnection.createAnswer();
          await peerConnection.setLocalDescription(answer);

          const socket = getSocket();
          socket?.emit('group-call:signal', {
            sessionId,
            toUserId: peerUserId,
            signal: { description: peerConnection.localDescription },
          });
        }
      }

      if (signal?.candidate) {
        if (!peerConnection.remoteDescription) {
          queueGroupPendingSignal({ sessionId, fromUserId: peerUserId, signal });
          return;
        }

        try {
          await peerConnection.addIceCandidate(new RTCIceCandidate(signal.candidate));
        } catch {
          // Ignore malformed candidates to keep the group call stable.
        }
      }
    },
    [createGroupPeerConnection, queueGroupPendingSignal],
  );

  const flushGroupPendingSignals = useCallback(
    async (peerUserId) => {
      const key = toStringId(peerUserId);
      if (!key) return;

      let loopGuard = 0;
      while (loopGuard < 6) {
        const queue = groupPendingSignalsRef.current[key];
        if (!queue?.length) return;

        delete groupPendingSignalsRef.current[key];
        for (const payload of queue) {
          await applyGroupSignal(payload);
        }

        loopGuard += 1;
        const remainder = groupPendingSignalsRef.current[key];
        if (!remainder?.length) return;

        const peerConnection = groupPeerConnectionsRef.current[key];
        const hasDescription = remainder.some((entry) => Boolean(entry?.signal?.description));
        if (!hasDescription && !peerConnection?.remoteDescription) {
          return;
        }
      }
    },
    [applyGroupSignal],
  );

  const startGroupLocalMedia = useCallback(async (nextType) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Media devices are unavailable');
    }

    const mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: nextType === 'video',
    });

    groupLocalStreamRef.current = mediaStream;
    if (groupLocalVideoRef.current) {
      groupLocalVideoRef.current.srcObject = mediaStream;
    }

    setGroupLocalAudioEnabled(mediaStream.getAudioTracks().some((track) => track.enabled));
    setGroupLocalVideoEnabled(mediaStream.getVideoTracks().some((track) => track.enabled));
    return mediaStream;
  }, []);

  const emitGroupMediaState = useCallback((sessionId, mediaState) => {
    if (!sessionId || !mediaState) return;

    const payload = { sessionId };
    if (typeof mediaState.audioEnabled === 'boolean') {
      payload.audioEnabled = mediaState.audioEnabled;
    }
    if (typeof mediaState.videoEnabled === 'boolean') {
      payload.videoEnabled = mediaState.videoEnabled;
    }

    if (typeof payload.audioEnabled !== 'boolean' && typeof payload.videoEnabled !== 'boolean') {
      return;
    }

    const socket = getSocket();
    socket?.emit('group-call:media-state', payload, () => { });
  }, []);

  const beginGroupCallMedia = useCallback(
    async ({ session, peerIds = [] }) => {
      if (!session?._id) return false;

      try {
        setGroupCallState('joining');

        if (!groupLocalStreamRef.current) {
          await startGroupLocalMedia(session.type || 'voice');
        }

        const localUserId = toStringId(currentUser?.id);
        const audioEnabled = groupLocalStreamRef.current?.getAudioTracks().some((track) => track.enabled);
        const videoEnabled = groupLocalStreamRef.current?.getVideoTracks().some((track) => track.enabled);
        if (localUserId) {
          setGroupCallMediaByUser((previous) => ({
            ...previous,
            [localUserId]: {
              ...previous[localUserId],
              audioEnabled: Boolean(audioEnabled),
              videoEnabled: Boolean(videoEnabled),
            },
          }));
        }
        emitGroupMediaState(session._id, {
          audioEnabled: Boolean(audioEnabled),
          videoEnabled: Boolean(videoEnabled),
        });

        for (const queuedPeerUserId of Object.keys(groupPendingSignalsRef.current)) {
          await flushGroupPendingSignals(queuedPeerUserId);
        }

        const socket = getSocket();
        if (!socket) {
          setGroupCallState('idle');
          return false;
        }

        for (const peerId of peerIds) {
          const normalizedPeerId = toStringId(peerId);
          if (!normalizedPeerId || normalizedPeerId === toStringId(currentUser?.id)) continue;

          const peerConnection = createGroupPeerConnection(normalizedPeerId, session._id);
          if (!peerConnection) continue;

          await flushGroupPendingSignals(normalizedPeerId);

          const offer = await peerConnection.createOffer();
          await peerConnection.setLocalDescription(offer);

          socket.emit('group-call:signal', {
            sessionId: session._id,
            toUserId: normalizedPeerId,
            signal: { description: peerConnection.localDescription },
          });
        }

        setGroupCallState('joined');
        return true;
      } catch {
        resetGroupCallMedia();
        return false;
      }
    },
    [
      createGroupPeerConnection,
      currentUser?.id,
      emitGroupMediaState,
      flushGroupPendingSignals,
      resetGroupCallMedia,
      startGroupLocalMedia,
    ],
  );

  useEffect(() => {
    const socket = getSocket();
    if (currentGroupCallSessionIdRef.current && currentGroupCallJoinedRef.current) {
      socket?.emit('group-call:leave', { sessionId: currentGroupCallSessionIdRef.current }, () => { });
    }

    resetGroupCallMedia();
  }, [activeConversationId, resetGroupCallMedia]);

  const handleIncomingCall = useCallback(
    (payload) => {
      if (!payload?.callId || !payload?.from?.id) return;

      if (callStateRef.current !== 'idle') {
        const socket = getSocket();
        socket?.emit('call:decline', { callId: payload.callId }, () => { });
        return;
      }

      incomingCallRef.current = payload;
      callStateRef.current = 'incoming';
      setIncomingCall(payload);
      setCallType(payload.type || 'voice');
      setCallState('incoming');
      if (payload.conversationId) {
        setActiveConversationId(payload.conversationId);
      }
    },
    [],
  );

  const handleCallAccepted = useCallback(
    (payload) => {
      if (!payload?.callId || payload.callId !== activeCallIdRef.current) return;
      if (privateCallBootstrapRef.current || peerConnectionRef.current) return;
      if (callStateRef.current !== 'outgoing') return;

      const partnerUserId = toStringId(payload.byUserId || callPartnerIdRef.current);
      const nextCallType = callTypeRef.current || 'voice';

      void beginOutgoingPrivateCall({
        callId: payload.callId,
        partnerUserId,
        nextCallType,
      }).catch(() => {
        resetCallState();
      });
    },
    [beginOutgoingPrivateCall, resetCallState],
  );

  const handleCallDeclined = useCallback(
    (payload) => {
      if (!payload?.callId) return;
      if (payload.callId !== activeCallIdRef.current && payload.callId !== incomingCallRef.current?.callId) {
        return;
      }

      resetCallState();
      queryClient.invalidateQueries({ queryKey: ['calls', 'history'] });
    },
    [queryClient, resetCallState],
  );

  const handleCallSignalEvent = useCallback(
    async (payload) => {
      if (!payload?.callId || !payload.signal) return;

      const hasPeer = Boolean(peerConnectionRef.current);
      const isActiveSignal = payload.callId === activeCallIdRef.current;
      if (!hasPeer || !isActiveSignal) {
        queuePendingSignal(payload);
        return;
      }

      await applyCallSignal(payload);
      await flushPendingSignals(payload.callId);
    },
    [applyCallSignal, flushPendingSignals, queuePendingSignal],
  );

  const handleCallEnded = useCallback(
    (payload) => {
      if (!payload?.callId) return;
      if (payload.callId !== activeCallIdRef.current && payload.callId !== incomingCallRef.current?.callId) {
        return;
      }

      resetCallState();
      queryClient.invalidateQueries({ queryKey: ['calls', 'history'] });
    },
    [queryClient, resetCallState],
  );

  const handleCallMissed = useCallback(
    (payload) => {
      if (!payload?.callId) return;
      if (payload.callId !== activeCallIdRef.current && payload.callId !== incomingCallRef.current?.callId) {
        return;
      }

      resetCallState();
      queryClient.invalidateQueries({ queryKey: ['calls', 'history'] });
    },
    [queryClient, resetCallState],
  );

  const handleGroupCallStarted = useCallback(
    (payload) => {
      const nextSession = mapGroupCallSession(payload);
      if (!nextSession?._id) return;
      if (toStringId(nextSession.conversationId) !== toStringId(activeConversationId)) return;
      setGroupCallSession(nextSession);
      queryClient.invalidateQueries({ queryKey: ['calls', 'group-active', nextSession.conversationId] });
    },
    [activeConversationId, queryClient],
  );

  const handleGroupCallParticipantJoined = useCallback(
    (payload) => {
      if (!payload?.sessionId || !payload?.participants) return;
      if (toStringId(payload.conversationId) !== toStringId(activeConversationId)) return;

      setGroupCallSession((previous) => {
        const baseSession =
          previous && toStringId(previous._id) === toStringId(payload.sessionId)
            ? previous
            : mapGroupCallSession({
              _id: payload.sessionId,
              conversationId: payload.conversationId,
              participants: payload.participants,
              type: previous?.type || groupCallType,
              hostId: previous?.hostId || '',
            });

        return {
          ...baseSession,
          participants: payload.participants,
        };
      });
    },
    [activeConversationId, groupCallType],
  );

  const handleGroupCallParticipantLeft = useCallback(
    (payload) => {
      if (!payload?.sessionId || !payload?.participants) return;
      if (toStringId(payload.conversationId) !== toStringId(activeConversationId)) return;

      if (payload.userId && toStringId(payload.userId) !== toStringId(currentUser?.id)) {
        closeGroupPeerConnection(payload.userId);
      }

      if (payload.userId && toStringId(payload.userId) === toStringId(currentUser?.id)) {
        resetGroupCallMedia();
      }

      setGroupCallSession((previous) => {
        if (!previous || toStringId(previous._id) !== toStringId(payload.sessionId)) {
          return previous;
        }

        return {
          ...previous,
          participants: payload.participants,
        };
      });
    },
    [activeConversationId, closeGroupPeerConnection, currentUser?.id, resetGroupCallMedia],
  );

  const handleGroupCallEnded = useCallback(
    (payload) => {
      if (!payload?.sessionId) return;
      if (toStringId(payload.conversationId) !== toStringId(activeConversationId)) return;

      setGroupCallSession((previous) =>
        previous && toStringId(previous._id) === toStringId(payload.sessionId) ? null : previous,
      );
      resetGroupCallMedia();
      queryClient.invalidateQueries({ queryKey: ['calls', 'group-active', payload.conversationId] });
    },
    [activeConversationId, queryClient, resetGroupCallMedia],
  );

  const handleGroupCallSignal = useCallback(
    async (payload) => {
      if (!payload?.sessionId || !payload?.fromUserId || !payload.signal) return;

      const activeSessionId = currentGroupCallSessionIdRef.current;
      if (activeSessionId && toStringId(activeSessionId) !== toStringId(payload.sessionId)) return;

      await applyGroupSignal(payload);
      await flushGroupPendingSignals(payload.fromUserId);
    },
    [applyGroupSignal, flushGroupPendingSignals],
  );

  const handleGroupCallMediaState = useCallback(
    (payload) => {
      if (!payload?.sessionId || !payload?.userId) return;
      if (toStringId(payload.conversationId) !== toStringId(activeConversationId)) return;

      const payloadUserId = toStringId(payload.userId);
      setGroupCallMediaByUser((previous) => {
        const current = previous[payloadUserId] || {};
        const next = { ...current };

        if (typeof payload.audioEnabled === 'boolean') {
          next.audioEnabled = payload.audioEnabled;
        }
        if (typeof payload.videoEnabled === 'boolean') {
          next.videoEnabled = payload.videoEnabled;
        }

        return {
          ...previous,
          [payloadUserId]: next,
        };
      });

      if (payloadUserId === toStringId(currentUser?.id)) {
        if (typeof payload.audioEnabled === 'boolean') {
          setGroupLocalAudioEnabled(payload.audioEnabled);
        }
        if (typeof payload.videoEnabled === 'boolean') {
          setGroupLocalVideoEnabled(payload.videoEnabled);
        }
      }
    },
    [activeConversationId, currentUser?.id],
  );

  useChatSocket({
    accessToken,
    onConnect: (socket) => {
      socket.emit('conversation:join-all', {}, (ack) => {
        if (!ack?.ok) return;
        const joined = joinedConversationsRef.current;
        for (const conversation of conversations) {
          const conversationId = toStringId(conversation._id);
          if (conversationId) {
            joined.add(conversationId);
          }
        }
      });

      if (activeConversationId) {
        socket.emit('conversation:join', { conversationId: activeConversationId }, (ack) => {
          if (ack?.ok) {
            joinedConversationsRef.current.add(toStringId(activeConversationId));
          }
        });
      }
    },
    onMessage: handleIncomingMessage,
    onMessageUpdate: handleMessageUpdate,
    onDeliveryUpdate: handleDeliveryUpdate,
    onRemoveSelfMessage: handleRemoveSelfMessage,
    onReadUpdate: handleReadUpdate,
    onConversationUpdate: handleConversationUpdate,
    onTyping: handleTypingUpdate,
    onPresence: handlePresenceUpdate,
    onIncomingCall: handleIncomingCall,
    onCallAccepted: handleCallAccepted,
    onCallDeclined: handleCallDeclined,
    onCallSignal: (payload) => {
      handleCallSignalEvent(payload).catch(() => { });
    },
    onCallEnded: handleCallEnded,
    onCallMissed: handleCallMissed,
    onGroupCallStarted: handleGroupCallStarted,
    onGroupCallParticipantJoined: handleGroupCallParticipantJoined,
    onGroupCallParticipantLeft: handleGroupCallParticipantLeft,
    onGroupCallEnded: handleGroupCallEnded,
    onGroupCallSignal: (payload) => {
      handleGroupCallSignal(payload).catch(() => { });
    },
    onGroupCallMediaState: handleGroupCallMediaState,
  });

  useEffect(
    () => () => {
      const socket = getSocket();
      if (activeCallId) {
        socket?.emit('call:end', { callId: activeCallId, duration: 0 }, () => { });
      }
      if (currentGroupCallSessionIdRef.current && currentGroupCallJoinedRef.current) {
        socket?.emit('group-call:leave', { sessionId: currentGroupCallSessionIdRef.current }, () => { });
      }
    },
    [activeCallId],
  );

  useEffect(() => {
    const socket = getSocket();
    if (!socket || !activeConversationId) return;

    socket.emit('conversation:join', { conversationId: activeConversationId }, (ack) => {
      if (ack?.ok) {
        joinedConversationsRef.current.add(toStringId(activeConversationId));
      }
    });
  }, [activeConversationId]);

  const handleMarkChatRead = useCallback(
    async (conversationId) => {
      const normalizedId = toStringId(conversationId);
      if (!normalizedId) return;

      await markConversationReadApi(normalizedId).catch(() => { });

      queryClient.setQueryData(['conversations'], (previous) =>
        mapConversationCache(previous, (items) =>
          items.map((conversation) => {
            if (toStringId(conversation._id) !== normalizedId) return conversation;

            return {
              ...conversation,
              participants: (conversation.participants || []).map((participant) => {
                const participantId = toStringId(participant.user?._id || participant.user);
                if (participantId !== toStringId(currentUser?.id)) return participant;
                return {
                  ...participant,
                  unreadCount: 0,
                };
              }),
            };
          }),
        ),
      );
    },
    [currentUser?.id, queryClient],
  );

  const emitReadIfNeeded = useCallback(() => {
    if (!activeConversationId) return;

    const now = Date.now();
    const last = lastReadEmitRef.current[activeConversationId] || 0;
    if (now - last < 1500) return;

    lastReadEmitRef.current[activeConversationId] = now;

    const socket = getSocket();
    if (socket?.connected) {
      socket.emit('message:read', { conversationId: activeConversationId }, () => { });
      return;
    }

    handleMarkChatRead(activeConversationId).catch(() => { });
  }, [activeConversationId, handleMarkChatRead]);

  useEffect(() => {
    if (!activeConversationId || !messagesQuery.isSuccess) return;
    emitReadIfNeeded();
  }, [activeConversationId, emitReadIfNeeded, messagesQuery.dataUpdatedAt, messagesQuery.isSuccess]);

  const createConversationMutation = useMutation({
    mutationFn: createPrivateConversationApi,
    onSuccess: (conversation) => {
      queryClient.setQueryData(['conversations'], (previous) =>
        mapConversationCache(previous, (items) => upsertConversation(items, conversation)),
      );
      setActiveConversationDraft(conversation);
      setActiveConversationId(conversation._id);
    },
    onError: () => {
      showNotice(
        'Unable to start chat',
        'Make sure the user ID or phone number is valid and belongs to an existing ChatApp account.',
      );
    },
  });

  const createGroupMutation = useMutation({
    mutationFn: createGroupConversationApi,
    onSuccess: (conversation) => {
      queryClient.setQueryData(['conversations'], (previous) =>
        mapConversationCache(previous, (items) => upsertConversation(items, conversation)),
      );
      setActiveConversationDraft(conversation);
      setActiveConversationId(conversation._id);
      setGroupDialog({ open: false, title: '', memberIds: [] });
    },
    onError: () => {
      showNotice(
        'Unable to create group',
        'Select at least one valid member and try again.',
      );
    },
  });

  const createStatusMutation = useMutation({
    mutationFn: async ({ file, privacy, text }) => {
      const trimmedText = String(text || '').trim();
      if (file) {
        return uploadStatusMediaApi({
          file,
          caption: trimmedText,
          privacy,
        });
      }

      return createStatusApi({
        type: 'text',
        text: trimmedText,
        privacy,
      });
    },
    onSuccess: () => {
      setStatusComposer({
        open: false,
        text: '',
        privacy: 'all',
        file: null,
      });
      queryClient.invalidateQueries({ queryKey: ['status', 'feed'] });
    },
    onError: () => {
      showNotice(
        'Unable to add status',
        'Use text or choose a supported image/video file, then try again.',
      );
    },
  });

  const ensureConversationForItem = useCallback(
    async (item, { open = false } = {}) => {
      const conversationId = toStringId(item?.conversationId || item?.id);
      const existingConversation = conversationId
        ? conversations.find((conversation) => toStringId(conversation._id) === conversationId) || null
        : null;

      if (existingConversation) {
        if (open) {
          setActiveConversationId(toStringId(existingConversation._id));
        }
        return existingConversation;
      }

      const targetUser =
        item?.contact || (item?.userId || item?.phone ? item : null);
      const nextUserId = toStringId(targetUser?.userId || targetUser?.id);
      const phone = targetUser?.phone || '';
      const payload = phone ? normalizePhoneForLookup(phone) || phone : nextUserId;
      if (!payload) return null;

      const conversation = await createConversationMutation.mutateAsync(payload);
      if (open) {
        setActiveConversationId(toStringId(conversation._id));
      }
      return conversation;
    },
    [conversations, createConversationMutation],
  );

  const handleOpenChat = useCallback(
    async (item) => {
      try {
        await ensureConversationForItem(item, { open: true });
      } catch {
        // Ignore invalid open-chat attempts and keep the current view stable.
      }
    },
    [ensureConversationForItem],
  );

  const handleStartManualChat = useCallback(
    (rawValue) => {
      const trimmed = String(rawValue || '').trim();
      if (!trimmed) return;
      const normalizedPhone = normalizePhoneForLookup(trimmed);
      createConversationMutation.mutate(normalizedPhone || trimmed);
    },
    [createConversationMutation],
  );

  const handleCreateGroup = useCallback(() => {
    setGroupDialog({
      open: true,
      title: '',
      memberIds: [],
    });
  }, []);

  const handleGroupMemberToggle = useCallback((memberId) => {
    setGroupDialog((previous) => {
      const normalizedId = toStringId(memberId);
      const exists = previous.memberIds.includes(normalizedId);
      return {
        ...previous,
        memberIds: exists
          ? previous.memberIds.filter((entry) => entry !== normalizedId)
          : [...previous.memberIds, normalizedId],
      };
    });
  }, []);

  const submitCreateGroup = useCallback(async () => {
    const title = groupDialog.title.trim();
    if (!title || groupDialog.memberIds.length === 0) {
      showNotice('Group details required', 'Add a group name and choose at least one member.');
      return;
    }

    await createGroupMutation.mutateAsync({
      title,
      memberIds: groupDialog.memberIds,
    });
  }, [createGroupMutation, groupDialog.memberIds, groupDialog.title, showNotice]);

  const finalizeOptimistic = useCallback(
    (conversationId, optimisticId, message) => {
      updateMessageInCache(conversationId, (previousItems) => {
        const replaced = previousItems.map((item) =>
          toStringId(item._id) === toStringId(optimisticId) ? message : item,
        );
        return dedupeMessages(replaced);
      });
      syncConversationPreview(conversationId, message);
    },
    [syncConversationPreview, updateMessageInCache],
  );

  const removeOptimistic = useCallback(
    (conversationId, optimisticId) => {
      updateMessageInCache(conversationId, (previousItems) =>
        previousItems.filter((message) => toStringId(message._id) !== toStringId(optimisticId)),
      );
    },
    [updateMessageInCache],
  );

  const handleSendMessage = useCallback(
    async (text, replyTo) => {
      if (!activeConversationId || !text.trim() || !currentUser?.id) return;

      const optimisticId = createClientMessageId('msg');

      const optimisticMessage = buildOptimisticMessage({
        clientTempId: optimisticId,
        conversationId: activeConversationId,
        user: {
          id: currentUser.id,
          username: currentUser.username,
          displayName: currentUser.displayName,
          avatar: currentUser.avatar,
        },
        text: text.trim(),
        replyTo: replyTo?.raw || null,
      });

      updateMessageInCache(activeConversationId, (previousItems) =>
        dedupeMessages([...previousItems, optimisticMessage]),
      );
      syncConversationPreview(activeConversationId, optimisticMessage);

      try {
        const socket = getSocket();
        if (socket?.connected) {
          const ack = await emitSocketAck('message:send', {
            conversationId: activeConversationId,
            clientMessageId: optimisticId,
            type: 'text',
            text: text.trim(),
            replyTo: replyTo?.rawId || replyTo?.id || null,
            clientId: optimisticId,
          }, socket);

          const createdFromSocket = ack?.data?.message || ack?.message;
          if (ack?.ok && createdFromSocket) {
            finalizeOptimistic(activeConversationId, optimisticId, createdFromSocket);
            emitReadIfNeeded();
            return;
          }
        }

        const created = await sendMessageApi({
          conversationId: activeConversationId,
          clientMessageId: optimisticId,
          text: text.trim(),
          replyTo: replyTo?.rawId || replyTo?.id || null,
        });
        finalizeOptimistic(activeConversationId, optimisticId, created);
        emitReadIfNeeded();
      } catch {
        removeOptimistic(activeConversationId, optimisticId);
      }
    },
    [
      activeConversationId,
      currentUser?.avatar,
      currentUser?.displayName,
      currentUser?.id,
      currentUser?.username,
      emitReadIfNeeded,
      finalizeOptimistic,
      removeOptimistic,
      syncConversationPreview,
      updateMessageInCache,
    ],
  );

  const handleUploadFile = useCallback(
    async (file) => {
      if (!activeConversationId || !file) return;

      const message = await uploadMediaApi({
        conversationId: activeConversationId,
        file,
        text: '',
      });
      handleIncomingMessage(message);
      emitReadIfNeeded();
    },
    [activeConversationId, emitReadIfNeeded, handleIncomingMessage],
  );

  const handleViewStatus = useCallback(
    async (status) => {
      const statusId = toStringId(status?.rawId || status?.id);
      if (!statusId) return;

      try {
        await markStatusViewedApi(statusId);
        queryClient.invalidateQueries({ queryKey: ['status', 'feed'] });
      } catch {
        // Ignore status-view failures in the viewer flow.
      }
    },
    [queryClient],
  );

  const handleSendPoll = useCallback(
    async (poll) => {
      if (!activeConversationId || !poll?.question || !Array.isArray(poll.options) || poll.options.length < 2) {
        return;
      }

      try {
        const message = await sendMessageApi({
          conversationId: activeConversationId,
          clientMessageId: createClientMessageId('poll'),
          type: 'poll',
          text: '',
          poll,
        });
        handleIncomingMessage(message);
        emitReadIfNeeded();
      } catch {
        // Ignore failed poll creation and keep the composer responsive.
      }
    },
    [activeConversationId, emitReadIfNeeded, handleIncomingMessage],
  );

  const handleTypingStart = useCallback(() => {
    if (!activeConversationId) return;
    const socket = getSocket();
    if (!socket?.connected) return;
    socket.emit('typing:start', { conversationId: activeConversationId });
  }, [activeConversationId]);

  const handleTypingStop = useCallback(() => {
    if (!activeConversationId) return;
    const socket = getSocket();
    if (!socket?.connected) return;
    socket.emit('typing:stop', { conversationId: activeConversationId });
  }, [activeConversationId]);

  const handleEditMessage = useCallback(
    async (messageId, text) => {
      if (!activeConversationId || !messageId || !text.trim()) return;

      try {
        const socket = getSocket();
        if (socket?.connected) {
          const ack = await emitSocketAck('message:edit', {
            conversationId: activeConversationId,
            messageId,
            text: text.trim(),
          }, socket);
          if (ack?.ok) return;
        }

        await editMessageApi({ conversationId: activeConversationId, messageId, text: text.trim() });
      } catch {
        // Ignore edit failures and keep the UI stable.
      }
    },
    [activeConversationId],
  );

  const handleDeleteMessage = useCallback(
    (messageId) => {
      if (!activeConversationId || !messageId) return;
      setDeleteDialog({
        open: true,
        messageId,
        scope: 'everyone',
      });
    },
    [activeConversationId],
  );

  const handleForwardMessage = useCallback(
    (message) => {
      if (!activeConversationId || !message?.rawId) return;

      const nextTargetConversationId =
        conversations.find((entry) => toStringId(entry._id) !== toStringId(activeConversationId))?._id || '';

      if (!nextTargetConversationId) {
        showNotice(
          'No destination available',
          'Create or open another conversation before forwarding this message.',
        );
        return;
      }

      setForwardDialog({
        open: true,
        message,
        targetConversationId: toStringId(nextTargetConversationId),
      });
    },
    [activeConversationId, conversations, showNotice],
  );

  const handleStarMessage = useCallback(
    async (messageId) => {
      if (!activeConversationId || !messageId) return;

      try {
        const socket = getSocket();
        if (socket?.connected) {
          const ack = await emitSocketAck('message:star', {
            conversationId: activeConversationId,
            messageId,
          }, socket);
          if (ack?.ok) return;
        }

        await starMessageApi({ conversationId: activeConversationId, messageId });
      } catch {
        // Ignore star failures.
      }
    },
    [activeConversationId],
  );

  const handlePinMessage = useCallback(
    async (messageId) => {
      if (!activeConversationId || !messageId) return;

      try {
        const socket = getSocket();
        if (socket?.connected) {
          const ack = await emitSocketAck('message:pin', {
            conversationId: activeConversationId,
            messageId,
          }, socket);
          if (ack?.ok) return;
        }

        await pinMessageApi({ conversationId: activeConversationId, messageId });
      } catch {
        // Ignore pin failures.
      }
    },
    [activeConversationId],
  );

  const handleReactMessage = useCallback(
    async (messageId, emoji) => {
      if (!activeConversationId || !messageId || !emoji) return;

      try {
        const socket = getSocket();
        if (socket?.connected) {
          const ack = await emitSocketAck('message:react', {
            conversationId: activeConversationId,
            messageId,
            emoji,
          }, socket);
          if (ack?.ok) return;
        }

        await reactMessageApi({ conversationId: activeConversationId, messageId, emoji });
      } catch {
        // Ignore reaction failures.
      }
    },
    [activeConversationId],
  );

  const handleStatusReply = useCallback(
    async (status, text) => {
      const ownerId = toStringId(status?.contact?.rawId || status?.contact?.id);
      if (!ownerId || !text.trim()) return;

      try {
        const conversation = await createPrivateConversationApi(ownerId);
        await sendMessageApi({
          conversationId: toStringId(conversation._id),
          clientMessageId: createClientMessageId('status-reply'),
          text: `Replied to status: ${text.trim()}`,
        });
        setActiveConversationId(toStringId(conversation._id));
      } catch {
        // Ignore status reply failures.
      }
    },
    [createPrivateConversationApi],
  );

  const handleAddStatus = useCallback(() => {
    setStatusComposer({
      open: true,
      text: '',
      privacy: 'all',
      file: null,
    });
  }, []);

  const handleNewCall = useCallback(() => {
    showNotice(
      'Start a new call',
      'Open any chat first, then use the voice or video call button in the conversation header.',
    );
  }, [showNotice]);

  const handleCreateCallLink = useCallback(() => {
    showNotice(
      'Call links unavailable',
      'Shareable call links are not part of this release yet. Start a direct or group call from an existing conversation instead.',
    );
  }, [showNotice]);

  const handleEmojiClick = useCallback(() => {
    showNotice(
      'Emoji picker unavailable',
      'Use your device keyboard emoji panel for now. Messages still send and render emoji normally.',
    );
  }, [showNotice]);

  const handleMicClick = useCallback(() => {
    showNotice(
      'Voice composer unavailable',
      'Voice recording is only available in the advanced composer. Use media upload for audio files in this release.',
    );
  }, [showNotice]);

  const confirmDeleteMessage = useCallback(async () => {
    if (!activeConversationId || !deleteDialog.messageId) return;

    try {
      const socket = getSocket();
      if (socket?.connected) {
        const ack = await emitSocketAck('message:delete', {
          conversationId: activeConversationId,
          messageId: deleteDialog.messageId,
          scope: deleteDialog.scope,
        }, socket);
        if (ack?.ok) {
          setDeleteDialog({ open: false, messageId: '', scope: 'everyone' });
          return;
        }
      }

      await deleteMessageApi({
        conversationId: activeConversationId,
        messageId: deleteDialog.messageId,
        scope: deleteDialog.scope,
      });
      setDeleteDialog({ open: false, messageId: '', scope: 'everyone' });
    } catch {
      showNotice('Unable to delete message', 'The message could not be deleted. Try again.');
    }
  }, [activeConversationId, deleteDialog.messageId, deleteDialog.scope, showNotice]);

  const submitForwardMessage = useCallback(async () => {
    if (!activeConversationId || !forwardDialog.message?.rawId || !forwardDialog.targetConversationId) {
      return;
    }

    try {
      const socket = getSocket();
      if (socket?.connected) {
        const ack = await emitSocketAck('message:forward', {
          sourceConversationId: activeConversationId,
          messageId: forwardDialog.message.rawId,
          targetConversationId: forwardDialog.targetConversationId,
        }, socket);
        if (ack?.ok) {
          setActiveConversationId(forwardDialog.targetConversationId);
          setForwardDialog({ open: false, message: null, targetConversationId: '' });
          return;
        }
      }

      await forwardMessageApi({
        sourceConversationId: activeConversationId,
        messageId: forwardDialog.message.rawId,
        targetConversationId: forwardDialog.targetConversationId,
      });
      setActiveConversationId(forwardDialog.targetConversationId);
      setForwardDialog({ open: false, message: null, targetConversationId: '' });
    } catch {
      showNotice(
        'Unable to forward message',
        'Select another conversation and try again.',
      );
    }
  }, [
    activeConversationId,
    forwardDialog.message,
    forwardDialog.targetConversationId,
    showNotice,
  ]);

  const submitStatusComposer = useCallback(async () => {
    if (!statusComposer.file && !statusComposer.text.trim()) {
      showNotice('Status content required', 'Add text or choose an image/video for your status update.');
      return;
    }

    await createStatusMutation.mutateAsync({
      file: statusComposer.file,
      privacy: statusComposer.privacy,
      text: statusComposer.text,
    });
  }, [createStatusMutation, showNotice, statusComposer.file, statusComposer.privacy, statusComposer.text]);

  const startPrivateCallForConversation = useCallback(
    async (conversation, nextType) => {
      const conversationId = toStringId(conversation?._id);
      const peer = getConversationPeer(conversation, currentUser?.id);
      if (!conversationId || !peer?._id || callState !== 'idle') return;

      const socket = getSocket();
      if (!socket) return;

      try {
        setCallType(nextType);
        callTypeRef.current = nextType;
        callStateRef.current = 'outgoing';
        setCallState('outgoing');

        const initAck = await emitSocketAck('call:initiate', {
          conversationId,
          type: nextType,
        }, socket);

        if (!initAck?.ok || !initAck.callId || !initAck.calleeId) {
          activeCallIdRef.current = '';
          callPartnerIdRef.current = '';
          callStateRef.current = 'idle';
          setCallState('idle');
          return;
        }

        activeCallIdRef.current = initAck.callId;
        callPartnerIdRef.current = initAck.calleeId;
        setActiveCallId(initAck.callId);
        setCallPartnerId(initAck.calleeId);
        await beginOutgoingPrivateCall({
          callId: initAck.callId,
          partnerUserId: initAck.calleeId,
          nextCallType: nextType,
        });
      } catch {
        if (activeCallIdRef.current) {
          socket.emit('call:end', { callId: activeCallIdRef.current, duration: 0 }, () => { });
        }
        resetCallState();
      }
    },
    [beginOutgoingPrivateCall, callState, currentUser?.id, resetCallState],
  );

  const startGroupCallForConversation = useCallback(
    async (conversation, nextType) => {
      const conversationId = toStringId(conversation?._id);
      if (!conversationId || callState !== 'idle') return;
      if (groupCallState !== 'idle' && isCurrentUserInGroupCall) return;

      const socket = getSocket();
      if (!socket) return;

      const existingSession =
        groupCallSession && toStringId(groupCallSession.conversationId) === conversationId
          ? groupCallSession
          : await getActiveGroupCallApi(conversationId).catch(() => null);

      if (existingSession?._id) {
        const normalizedSession = mapGroupCallSession(existingSession);
        setGroupCallSession(normalizedSession);

        const joinAck = await emitSocketAck('group-call:join', {
          sessionId: normalizedSession._id,
        }, socket);

        if (!joinAck?.ok || !joinAck.session) {
          return;
        }

        const joinedSession = mapGroupCallSession(joinAck.session);
        setGroupCallSession(joinedSession);
        const started = await beginGroupCallMedia({
          session: joinedSession,
          peerIds: joinAck.peerIds || [],
        });
        if (!started) {
          socket.emit('group-call:leave', { sessionId: joinedSession._id }, () => { });
          setGroupCallSession(normalizedSession);
        }
        return;
      }

      const startAck = await emitSocketAck('group-call:start', {
        conversationId,
        type: nextType,
      }, socket);

      if (!startAck?.ok || !startAck.session) return;

      const startedSession = mapGroupCallSession(startAck.session);
      setGroupCallSession(startedSession);
      const started = await beginGroupCallMedia({
        session: startedSession,
        peerIds: [],
      });

      if (!started) {
        socket.emit('group-call:leave', { sessionId: startedSession._id }, () => { });
        setGroupCallSession(null);
      }

      queryClient.invalidateQueries({ queryKey: ['calls', 'group-active', conversationId] });
    },
    [
      beginGroupCallMedia,
      callState,
      groupCallSession,
      groupCallState,
      isCurrentUserInGroupCall,
      queryClient,
    ],
  );

  const startCall = useCallback(
    async (nextType, sourceItem = null) => {
      let conversation = activeConversation;
      if (sourceItem) {
        conversation = await ensureConversationForItem(sourceItem, { open: true });
      }

      if (!conversation) return;

      if (conversation.type === 'group') {
        await startGroupCallForConversation(conversation, nextType);
        return;
      }

      await startPrivateCallForConversation(conversation, nextType);
    },
    [activeConversation, ensureConversationForItem, startGroupCallForConversation, startPrivateCallForConversation],
  );

  const acceptIncomingCall = useCallback(async () => {
    if (!incomingCall?.callId || !incomingCall?.from?.id || callState !== 'incoming') return;

    const socket = getSocket();
    if (!socket) return;

    const pendingIncomingCall = incomingCall;

    try {
      const ack = await emitSocketAck('call:accept', {
        callId: pendingIncomingCall.callId,
      }, socket);

      if (!ack?.ok) {
        resetCallState();
        return;
      }

      activeCallIdRef.current = pendingIncomingCall.callId;
      incomingCallRef.current = null;
      callStateRef.current = 'connecting';
      callPartnerIdRef.current = pendingIncomingCall.from.id;
      callTypeRef.current = pendingIncomingCall.type || 'voice';
      setActiveCallId(pendingIncomingCall.callId);
      setCallPartnerId(pendingIncomingCall.from.id);
      setCallType(pendingIncomingCall.type || 'voice');
      setIncomingCall(null);
      setCallState('connecting');

      await startLocalMedia(pendingIncomingCall.type || 'voice');
      const peerConnection = createPeerConnection(pendingIncomingCall.callId, pendingIncomingCall.from.id);
      if (!peerConnection) {
        resetCallState();
        return;
      }
      await flushPendingSignals(pendingIncomingCall.callId);
    } catch {
      resetCallState();
    }
  }, [callState, createPeerConnection, flushPendingSignals, incomingCall, resetCallState, startLocalMedia]);

  const declineIncomingCall = useCallback(() => {
    if (!incomingCall?.callId) return;

    const socket = getSocket();
    const callId = incomingCall.callId;
    socket?.emit('call:decline', { callId }, () => { });
    resetCallState();
    queryClient.invalidateQueries({ queryKey: ['calls', 'history'] });
  }, [incomingCall?.callId, queryClient, resetCallState]);

  const endCurrentCall = useCallback(() => {
    if (!activeCallId) {
      resetCallState();
      return;
    }

    const durationSeconds = callStartedAtRef.current
      ? Math.floor((Date.now() - callStartedAtRef.current) / 1000)
      : 0;

    const socket = getSocket();
    socket?.emit('call:end', { callId: activeCallId, duration: durationSeconds }, () => { });
    resetCallState();
    queryClient.invalidateQueries({ queryKey: ['calls', 'history'] });
  }, [activeCallId, queryClient, resetCallState]);

  const leaveGroupCall = useCallback(async () => {
    if (!groupCallSession?._id) {
      resetGroupCallMedia();
      return;
    }

    const socket = getSocket();
    if (!socket) {
      resetGroupCallMedia();
      return;
    }

    const ack = await emitSocketAck('group-call:leave', {
      sessionId: groupCallSession._id,
    }, socket);

    if (ack?.ok && ack.session) {
      const nextSession = mapGroupCallSession(ack.session);
      setGroupCallSession(nextSession.status === 'ended' ? null : nextSession);
    }

    resetGroupCallMedia();
    queryClient.invalidateQueries({ queryKey: ['calls', 'group-active', activeConversationId] });
  }, [activeConversationId, groupCallSession?._id, queryClient, resetGroupCallMedia]);

  const endGroupCall = useCallback(async () => {
    if (!groupCallSession?._id) return;

    const socket = getSocket();
    if (!socket) return;

    const ack = await emitSocketAck('group-call:end', {
      sessionId: groupCallSession._id,
    }, socket);

    if (ack?.ok) {
      setGroupCallSession(null);
      resetGroupCallMedia();
      queryClient.invalidateQueries({ queryKey: ['calls', 'group-active', activeConversationId] });
    }
  }, [activeConversationId, groupCallSession?._id, queryClient, resetGroupCallMedia]);

  const toggleGroupLocalAudio = useCallback(() => {
    if (!groupCallSession?._id || !isCurrentUserInGroupCall) return;

    const stream = groupLocalStreamRef.current;
    if (!stream) return;

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) return;

    const nextEnabled = !groupLocalAudioEnabled;
    for (const track of audioTracks) {
      track.enabled = nextEnabled;
    }

    const localUserId = toStringId(currentUser?.id);
    setGroupLocalAudioEnabled(nextEnabled);
    setGroupCallMediaByUser((previous) => ({
      ...previous,
      [localUserId]: {
        ...previous[localUserId],
        audioEnabled: nextEnabled,
      },
    }));
    emitGroupMediaState(groupCallSession._id, { audioEnabled: nextEnabled });
  }, [
    currentUser?.id,
    emitGroupMediaState,
    groupCallSession?._id,
    groupLocalAudioEnabled,
    isCurrentUserInGroupCall,
  ]);

  const toggleGroupLocalVideo = useCallback(() => {
    if (!groupCallSession?._id || !isCurrentUserInGroupCall || groupCallType !== 'video') return;

    const stream = groupLocalStreamRef.current;
    if (!stream) return;

    const videoTracks = stream.getVideoTracks();
    if (videoTracks.length === 0) return;

    const nextEnabled = !groupLocalVideoEnabled;
    for (const track of videoTracks) {
      track.enabled = nextEnabled;
    }

    const localUserId = toStringId(currentUser?.id);
    setGroupLocalVideoEnabled(nextEnabled);
    setGroupCallMediaByUser((previous) => ({
      ...previous,
      [localUserId]: {
        ...previous[localUserId],
        videoEnabled: nextEnabled,
      },
    }));
    emitGroupMediaState(groupCallSession._id, { videoEnabled: nextEnabled });
  }, [
    currentUser?.id,
    emitGroupMediaState,
    groupCallSession?._id,
    groupCallType,
    groupLocalVideoEnabled,
    isCurrentUserInGroupCall,
  ]);

  const activeTypingUsers = useMemo(() => {
    if (!activeConversationId) return [];
    return Object.values(typingByConversation[activeConversationId] || {}).filter(
      (entry) => toStringId(entry.userId) !== toStringId(currentUser?.id),
    );
  }, [activeConversationId, currentUser?.id, typingByConversation]);

  const knownUsersById = useMemo(() => {
    const map = {};

    const registerUser = (entry) => {
      if (!entry) return;
      const id = toStringId(entry._id || entry.id || entry.userId);
      if (!id || id === toStringId(currentUser?.id) || map[id]) return;
      map[id] = entry;
    };

    for (const conversation of conversations) {
      for (const participant of conversation.participants || []) {
        registerUser(participant.user);
      }
    }

    for (const status of statusFeed) {
      registerUser(status.user);
    }

    for (const call of callHistory) {
      registerUser(call.caller);
      registerUser(call.callee);
    }

    return map;
  }, [callHistory, conversations, currentUser?.id, statusFeed]);

  const uiChats = useMemo(
    () =>
      conversations.map((conversation) => {
        const peer = getConversationPeer(conversation, currentUser?.id);
        const typingUsers = Object.values(typingByConversation[toStringId(conversation._id)] || {}).filter(
          (entry) => toStringId(entry.userId) !== toStringId(currentUser?.id),
        );
        const typingLabel = typingUsers[0]?.username || typingUsers[0]?.displayName || '';

        return {
          id: toStringId(conversation._id),
          conversationId: toStringId(conversation._id),
          userId: peer ? toStringId(peer._id) : '',
          name: getConversationTitle(conversation, currentUser?.id),
          avatar: getInitials(getConversationTitle(conversation, currentUser?.id)),
          phone: peer?.phone || '',
          about: peer?.about || (peer?.username ? `@${peer.username}` : ''),
          isGroup: conversation.type !== 'private',
          members: (conversation.participants || []).map((participant) => participant.user?.displayName || participant.user?.username || 'User'),
          online: Boolean(peer?.isOnline),
          lastSeen: conversation.type === 'private' ? (peer?.isOnline ? 'online' : formatLastSeen(peer?.lastSeen)) : '',
          lastMessage: getConversationPreview(conversation),
          lastMessageTime: formatConversationTime(conversation.lastActivityAt),
          unread: getUnreadCount(conversation, currentUser?.id),
          pinned: false,
          typing: Boolean(typingLabel),
          muted: isMutedConversation(conversation, currentUser?.id),
        };
      }),
    [conversations, currentUser?.id, typingByConversation],
  );

  const uiContacts = useMemo(
    () =>
      Object.values(knownUsersById).map((entry) => ({
        id: toStringId(entry._id || entry.id),
        userId: toStringId(entry._id || entry.id),
        name: entry.displayName || entry.username || entry.phone || 'User',
        avatar: getInitials(entry.displayName || entry.username || entry.phone || 'User'),
        phone: entry.phone || '',
        about: entry.about || (entry.username ? `@${entry.username}` : ''),
        online: Boolean(entry.isOnline),
        lastSeen: entry.isOnline ? 'online' : formatLastSeen(entry.lastSeen),
      })),
    [knownUsersById],
  );

  const groupMemberOptions = useMemo(
    () =>
      uiContacts.filter((entry) => toStringId(entry.userId || entry.id) !== toStringId(currentUser?.id)),
    [currentUser?.id, uiContacts],
  );

  const forwardConversationOptions = useMemo(
    () =>
      conversations.filter(
        (conversation) => toStringId(conversation._id) !== toStringId(activeConversationId),
      ),
    [activeConversationId, conversations],
  );

  const uiMessages = useMemo(
    () =>
      rawMessages.map((message) => ({
        id: toStringId(message._id),
        rawId: toStringId(message._id),
        raw: message,
        text: message.content?.text || '',
        sender: toStringId(message.sender?._id || message.sender) === toStringId(currentUser?.id) ? 'me' : 'them',
        senderName: message.sender?.displayName || message.sender?.username || 'User',
        time: dayjs(message.createdAt).format('h:mm A'),
        status: getMessageStatus(message, currentUser?.id, participantCount),
        replyTo: message.replyTo?.content?.text
          ? {
            text: message.replyTo.content.text,
            preview: message.replyTo.content.text,
          }
          : null,
        type: message.type,
        pollQuestion: message.content?.poll?.question || '',
        pollOptionCount: Array.isArray(message.content?.poll?.options) ? message.content.poll.options.length : 0,
        mediaUrl: message.content?.mediaUrl || message.content?.media?.url || '',
        fileName: message.content?.fileName || message.content?.media?.fileName || '',
        reactions: Array.isArray(message.reactions)
          ? message.reactions
            .map((reaction) => ({
              emoji: reaction.emoji,
              count: Array.isArray(reaction.users) ? reaction.users.length : 0,
              reactedByCurrentUser: Array.isArray(reaction.users)
                ? reaction.users.some(
                  (entry) => toStringId(entry?._id || entry) === toStringId(currentUser?.id),
                )
                : false,
            }))
            .filter((reaction) => reaction.count > 0)
            .sort((left, right) => right.count - left.count)
          : [],
      })),
    [currentUser?.id, participantCount, rawMessages],
  );

  const uiStatuses = useMemo(
    () =>
      statusFeed.map((status) => {
        const statusUser = status.user || {};
        return {
          id: toStringId(status._id),
          rawId: toStringId(status._id),
          isMine: toStringId(statusUser._id) === toStringId(currentUser?.id),
          contact: {
            id: toStringId(statusUser._id),
            name: statusUser.displayName || statusUser.username || 'User',
            avatar: getInitials(statusUser.displayName || statusUser.username || 'User'),
          },
          time: formatStatusTime(status.createdAt),
          viewed: Boolean(status.hasViewed),
          image: status.type === 'text' ? '💬' : status.type === 'video' ? '🎥' : '🖼️',
          text: status.type === 'text' ? status.text : status.caption || '',
          mediaUrl: status.mediaUrl || '',
          mediaType: status.type,
        };
      }),
    [currentUser?.id, statusFeed],
  );

  const uiCallHistory = useMemo(
    () =>
      callHistory.map((call) => {
        const isOutgoing = toStringId(call.caller?._id || call.caller) === toStringId(currentUser?.id);
        const peer = isOutgoing ? call.callee : call.caller;
        return {
          id: toStringId(call._id),
          conversationId: toStringId(call.conversation?._id || call.conversation),
          contact: {
            id: toStringId(peer?._id),
            userId: toStringId(peer?._id),
            name: peer?.displayName || peer?.username || 'Unknown user',
            avatar: getInitials(peer?.displayName || peer?.username || 'Unknown user'),
            phone: peer?.phone || '',
          },
          type: isOutgoing ? 'outgoing' : 'incoming',
          callType: call.type,
          time: formatStatusTime(call.startedAt || call.createdAt),
          missed: call.status === 'missed',
        };
      }),
    [callHistory, currentUser?.id],
  );

  const activeUiChat = useMemo(() => {
    if (!activeConversation) return null;

    const peer = getConversationPeer(activeConversation, currentUser?.id);
    return {
      id: toStringId(activeConversation._id),
      conversationId: toStringId(activeConversation._id),
      userId: peer ? toStringId(peer._id) : '',
      name: getConversationTitle(activeConversation, currentUser?.id),
      avatar: getInitials(getConversationTitle(activeConversation, currentUser?.id)),
      phone: peer?.phone || '',
      about: peer?.about || (peer?.username ? `@${peer.username}` : ''),
      isGroup: activeConversation.type !== 'private',
      members: (activeConversation.participants || []).map(
        (participant) => participant.user?.displayName || participant.user?.username || 'User',
      ),
      online: Boolean(peer?.isOnline),
      lastSeen:
        activeConversation.type === 'private'
          ? peer?.isOnline
            ? 'online'
            : formatLastSeen(peer?.lastSeen)
          : `${activeConversation.participants?.length || 0} members`,
    };
  }, [activeConversation, currentUser?.id]);

  const currentUserInfo = useMemo(
    () => ({
      id: toStringId(currentUser?.id),
      name: currentUser?.displayName || currentUser?.username || 'You',
      avatar: getInitials(currentUser?.displayName || currentUser?.username || 'You'),
      phone: currentUser?.phone || '',
      about: currentUser?.about || 'Hey there! I am using ChatApp.',
    }),
    [currentUser?.about, currentUser?.displayName, currentUser?.id, currentUser?.phone, currentUser?.username],
  );

  const callPartnerProfile = useMemo(() => {
    if (callState === 'incoming' && incomingCall?.from?.id) {
      return incomingCall.from;
    }

    if (!callPartnerId) return null;
    return knownUsersById[toStringId(callPartnerId)] || null;
  }, [callPartnerId, callState, incomingCall, knownUsersById]);

  const callPartnerLabel =
    callPartnerProfile?.displayName || callPartnerProfile?.username || 'Unknown user';

  const setGroupRemoteVideoRef = useCallback(
    (peerUserId) => (element) => {
      const key = toStringId(peerUserId);
      if (!key) return;

      if (element) {
        groupRemoteVideoRefsRef.current[key] = element;
        const stream = groupRemoteStreamsRef.current[key];
        if (stream) {
          element.srcObject = stream;
        }
        return;
      }

      delete groupRemoteVideoRefsRef.current[key];
    },
    [],
  );

  const setGroupRemoteAudioRef = useCallback(
    (peerUserId) => (element) => {
      const key = toStringId(peerUserId);
      if (!key) return;

      if (element) {
        groupRemoteAudioRefsRef.current[key] = element;
        const stream = groupRemoteStreamsRef.current[key];
        if (stream) {
          element.srcObject = stream;
        }
        return;
      }

      delete groupRemoteAudioRefsRef.current[key];
    },
    [],
  );

  const remoteGroupParticipants = useMemo(
    () => {
      const mappedParticipants = groupCallParticipants
        .filter((entry) => toStringId(entry.user?._id || entry.user) !== toStringId(currentUser?.id))
        .map((entry) => {
          const participantId = toStringId(entry.user?._id || entry.user);
          const mediaState = groupCallMediaByUser[participantId] || {};
          return {
            id: participantId,
            label: entry.user?.displayName || entry.user?.username || 'Participant',
            videoEnabled: mediaState.videoEnabled ?? groupCallType === 'video',
            audioEnabled: mediaState.audioEnabled ?? true,
            videoRef: setGroupRemoteVideoRef(participantId),
            audioRef: setGroupRemoteAudioRef(participantId),
          };
        });

      if (!groupRemoteUserIds.length) {
        return mappedParticipants;
      }

      const participantsById = new Map(mappedParticipants.map((entry) => [entry.id, entry]));
      return [
        ...groupRemoteUserIds.map((entry) => participantsById.get(toStringId(entry))).filter(Boolean),
        ...mappedParticipants.filter((entry) => !groupRemoteUserIds.includes(entry.id)),
      ];
    },
    [
      currentUser?.id,
      groupCallMediaByUser,
      groupCallParticipants,
      groupCallType,
      groupRemoteUserIds,
      setGroupRemoteAudioRef,
      setGroupRemoteVideoRef,
    ],
  );

  return (
    <>
      <ChatUiApp
        currentUser={currentUserInfo}
        chats={uiChats}
        contacts={uiContacts}
        activeChat={activeUiChat}
        messages={uiMessages}
        isMessagesLoading={messagesQuery.isLoading}
        statusUpdates={uiStatuses}
        callHistory={uiCallHistory}
        onOpenChat={handleOpenChat}
        onCloseChat={() => setActiveConversationId('')}
        onSendMessage={handleSendMessage}
        onSendPoll={handleSendPoll}
        onUploadFile={handleUploadFile}
        onStartCall={startCall}
        onStartCallFromHistory={startCall}
        onMarkChatRead={handleMarkChatRead}
        onStartManualChat={handleStartManualChat}
        onCreateGroup={handleCreateGroup}
        onViewStatus={handleViewStatus}
        onTypingStart={handleTypingStart}
        onTypingStop={handleTypingStop}
        onEditMessage={handleEditMessage}
        onDeleteMessage={handleDeleteMessage}
        onForwardMessage={handleForwardMessage}
        onStarMessage={handleStarMessage}
        onPinMessage={handlePinMessage}
        onReactMessage={handleReactMessage}
        onEmojiClick={handleEmojiClick}
        onMicClick={handleMicClick}
        onStatusReply={handleStatusReply}
        onAddStatus={handleAddStatus}
        onNewCall={handleNewCall}
        onCreateCallLink={handleCreateCallLink}
        onLogout={handleLogout}
        typingLabel={activeTypingUsers[0] ? `${activeTypingUsers[0].username || activeTypingUsers[0].displayName || 'Someone'} typing...` : ''}
        currentCall={callState !== 'idle' ? { state: callState } : null}
        settingsVersion="WhatsApp Clone"
        callOverlay={
          callState !== 'idle' ? (
            <CallOverlay
              isOpen
              callState={callState}
              callType={callType}
              partnerLabel={callPartnerLabel}
              localVideoRef={localVideoRef}
              remoteVideoRef={remoteVideoRef}
              remoteAudioRef={remoteAudioRef}
              onAccept={acceptIncomingCall}
              onDecline={declineIncomingCall}
              onEnd={endCurrentCall}
            />
          ) : groupCallSession && (groupCallState !== 'idle' || isCurrentUserInGroupCall) ? (
            <GroupCallOverlay
              isOpen
              title={activeUiChat?.name || 'Group call'}
              callType={groupCallType}
              callState={groupCallState}
              participantCount={groupCallParticipants.length}
              localVideoRef={groupLocalVideoRef}
              localAudioEnabled={groupLocalAudioEnabled}
              localVideoEnabled={groupLocalVideoEnabled}
              remoteParticipants={remoteGroupParticipants}
              onToggleAudio={toggleGroupLocalAudio}
              onToggleVideo={toggleGroupLocalVideo}
              onLeave={leaveGroupCall}
              onEnd={endGroupCall}
              canEnd={canEndGroupCall}
            />
          ) : null
        }
      />

      <input
        ref={statusFileInputRef}
        type="file"
        accept="image/*,video/*"
        data-testid="status-file-input"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0] || null;
          setStatusComposer((previous) => ({
            ...previous,
            file,
          }));
          event.target.value = '';
        }}
      />

      {noticeDialog ? (
        <ModalOverlay onClose={() => setNoticeDialog(null)}>
          <div data-testid="notice-dialog">
          <DialogCard
            title={noticeDialog.title}
            description={noticeDialog.message}
            footer={
              <button
                type="button"
                className="rounded-full bg-[#0A7CFF] px-5 py-2 text-sm font-semibold text-white"
                onClick={() => setNoticeDialog(null)}
              >
                Close
              </button>
            }
          >
            <div className="rounded-2xl bg-white/5 px-4 py-3 text-sm text-white/70">
              {noticeDialog.message}
            </div>
          </DialogCard>
          </div>
        </ModalOverlay>
      ) : null}

      {groupDialog.open ? (
        <ModalOverlay
          onClose={() =>
            setGroupDialog({
              open: false,
              title: '',
              memberIds: [],
            })
          }
        >
          <div data-testid="group-dialog">
          <DialogCard
            title="Create Group"
            description="Set a group name and choose the members to add."
            maxWidth="max-w-xl"
            footer={
              <>
                <button
                  type="button"
                  className="rounded-full border border-white/10 px-5 py-2 text-sm text-white/70"
                  onClick={() =>
                    setGroupDialog({
                      open: false,
                      title: '',
                      memberIds: [],
                    })
                  }
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="rounded-full bg-[#0A7CFF] px-5 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={createGroupMutation.isPending}
                  onClick={() => {
                    submitCreateGroup().catch(() => { });
                  }}
                >
                  {createGroupMutation.isPending ? 'Creating...' : 'Create group'}
                </button>
              </>
            }
          >
            <div className="space-y-4">
              <input
                type="text"
                data-testid="group-title-input"
                value={groupDialog.title}
                onChange={(event) =>
                  setGroupDialog((previous) => ({ ...previous, title: event.target.value }))
                }
                placeholder="Weekend plans"
                className={dialogInputClass}
              />
              <div className="max-h-72 space-y-2 overflow-y-auto rounded-3xl border border-white/10 bg-white/5 p-3">
                {groupMemberOptions.length === 0 ? (
                  <p className="px-2 py-3 text-sm text-white/60">
                    Start some chats first so there are contacts available for group creation.
                  </p>
                ) : (
                  groupMemberOptions.map((contact) => {
                    const contactId = toStringId(contact.userId || contact.id);
                    const selected = groupDialog.memberIds.includes(contactId);
                    return (
                      <label
                        key={contactId}
                        className="flex cursor-pointer items-center gap-3 rounded-2xl px-3 py-2 transition hover:bg-white/5"
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => handleGroupMemberToggle(contactId)}
                          className="h-4 w-4 rounded border-white/20 bg-transparent text-[#0A7CFF]"
                        />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-white">{contact.name}</p>
                          <p className="text-xs text-white/55">{contact.about || contact.phone || 'Contact'}</p>
                        </div>
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          </DialogCard>
          </div>
        </ModalOverlay>
      ) : null}

      {deleteDialog.open ? (
        <ModalOverlay
          onClose={() => setDeleteDialog({ open: false, messageId: '', scope: 'everyone' })}
        >
          <div data-testid="delete-dialog">
          <DialogCard
            title="Delete Message"
            description="Choose whether to delete this message only for you or for everyone."
            footer={
              <>
                <button
                  type="button"
                  className="rounded-full border border-white/10 px-5 py-2 text-sm text-white/70"
                  onClick={() => setDeleteDialog({ open: false, messageId: '', scope: 'everyone' })}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="rounded-full bg-[#ff3b30] px-5 py-2 text-sm font-semibold text-white"
                  onClick={() => {
                    confirmDeleteMessage().catch(() => { });
                  }}
                >
                  Delete
                </button>
              </>
            }
          >
            <div className="space-y-3">
              <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <input
                  type="radio"
                  name="delete-scope"
                  checked={deleteDialog.scope === 'everyone'}
                  onChange={() => setDeleteDialog((previous) => ({ ...previous, scope: 'everyone' }))}
                />
                <div>
                  <p className="text-sm font-medium text-white">Delete for everyone</p>
                  <p className="text-xs text-white/55">Removes the message from the entire conversation.</p>
                </div>
              </label>
              <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <input
                  type="radio"
                  name="delete-scope"
                  checked={deleteDialog.scope === 'me'}
                  onChange={() => setDeleteDialog((previous) => ({ ...previous, scope: 'me' }))}
                />
                <div>
                  <p className="text-sm font-medium text-white">Delete for me</p>
                  <p className="text-xs text-white/55">Only removes the message from your own view.</p>
                </div>
              </label>
            </div>
          </DialogCard>
          </div>
        </ModalOverlay>
      ) : null}

      {forwardDialog.open ? (
        <ModalOverlay
          onClose={() => setForwardDialog({ open: false, message: null, targetConversationId: '' })}
        >
          <div data-testid="forward-dialog">
          <DialogCard
            title="Forward Message"
            description="Choose the conversation that should receive this forwarded message."
            footer={
              <>
                <button
                  type="button"
                  className="rounded-full border border-white/10 px-5 py-2 text-sm text-white/70"
                  onClick={() => setForwardDialog({ open: false, message: null, targetConversationId: '' })}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="rounded-full bg-[#0A7CFF] px-5 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={!forwardDialog.targetConversationId}
                  onClick={() => {
                    submitForwardMessage().catch(() => { });
                  }}
                >
                  Forward
                </button>
              </>
            }
          >
            <div className="space-y-3">
              <select
                data-testid="forward-target-select"
                value={forwardDialog.targetConversationId}
                onChange={(event) =>
                  setForwardDialog((previous) => ({
                    ...previous,
                    targetConversationId: event.target.value,
                  }))
                }
                className={dialogInputClass}
              >
                {forwardConversationOptions.map((conversation) => (
                  <option key={conversation._id} value={toStringId(conversation._id)}>
                    {getConversationTitle(conversation, currentUser?.id)}
                  </option>
                ))}
              </select>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/70">
                {forwardDialog.message?.text || forwardDialog.message?.raw?.content?.text || 'Media message'}
              </div>
            </div>
          </DialogCard>
          </div>
        </ModalOverlay>
      ) : null}

      {statusComposer.open ? (
        <ModalOverlay
          onClose={() =>
            setStatusComposer({
              open: false,
              text: '',
              privacy: 'all',
              file: null,
            })
          }
        >
          <div data-testid="status-composer-dialog">
          <DialogCard
            title="Add Status"
            description="Post a text update or upload an image/video for your contacts."
            footer={
              <>
                <button
                  type="button"
                  className="rounded-full border border-white/10 px-5 py-2 text-sm text-white/70"
                  onClick={() =>
                    setStatusComposer({
                      open: false,
                      text: '',
                      privacy: 'all',
                      file: null,
                    })
                  }
                >
                  Cancel
                </button>
                <button
                  type="button"
                  data-testid="status-post-button"
                  className="rounded-full bg-[#0A7CFF] px-5 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={createStatusMutation.isPending}
                  onClick={() => {
                    submitStatusComposer().catch(() => { });
                  }}
                >
                  {createStatusMutation.isPending ? 'Posting...' : 'Post status'}
                </button>
              </>
            }
          >
            <div className="space-y-4">
              <textarea
                data-testid="status-text-input"
                value={statusComposer.text}
                onChange={(event) =>
                  setStatusComposer((previous) => ({ ...previous, text: event.target.value }))
                }
                rows={4}
                placeholder="Share an update..."
                className={dialogInputClass}
              />
              <select
                data-testid="status-privacy-select"
                value={statusComposer.privacy}
                onChange={(event) =>
                  setStatusComposer((previous) => ({ ...previous, privacy: event.target.value }))
                }
                className={dialogInputClass}
              >
                <option value="all">Everyone</option>
                <option value="contacts">Contacts</option>
                <option value="private">Only me</option>
              </select>
              <div className="rounded-3xl border border-dashed border-white/15 bg-white/5 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-white">Media upload</p>
                    <p className="text-xs text-white/55">
                      Optional. Supports image and video status updates.
                    </p>
                  </div>
                  <button
                    type="button"
                    data-testid="status-choose-file-button"
                    className="rounded-full border border-white/10 px-4 py-2 text-sm text-white"
                    onClick={() => statusFileInputRef.current?.click()}
                  >
                    Choose file
                  </button>
                </div>
                {statusComposer.file ? (
                  <div className="mt-3 flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3 text-sm text-white/70">
                    <span className="truncate">{statusComposer.file.name}</span>
                    <button
                      type="button"
                      className="text-sm text-[#ff9b90]"
                      onClick={() =>
                        setStatusComposer((previous) => ({
                          ...previous,
                          file: null,
                        }))
                      }
                    >
                      Remove
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </DialogCard>
          </div>
        </ModalOverlay>
      ) : null}
    </>
  );
}
