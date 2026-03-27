import { api } from './api.js';

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

export const listConversationsApi = async () => {
  const response = await api.get('/conversations', { params: { limit: 50 } });
  return {
    items: response.data.data,
    nextCursor: response.data.meta?.nextCursor || null,
  };
};

export const createPrivateConversationApi = async (peerInput) => {
  const normalizedPhone = normalizePhoneForLookup(peerInput);
  const payload = normalizedPhone ? { phone: normalizedPhone } : { peerUserId: peerInput };
  const response = await api.post('/conversations/private', payload);
  return response.data.data;
};

export const listMessagesApi = async (conversationId, { limit = 50, cursor } = {}) => {
  const response = await api.get(`/conversations/${conversationId}/messages`, {
    params: { limit, ...(cursor ? { cursor } : {}) },
  });

  return {
    items: response.data.data,
    nextCursor: response.data.meta?.nextCursor || null,
  };
};

export const sendMessageApi = async ({
  conversationId,
  clientMessageId,
  text,
  type = 'text',
  replyTo = null,
  poll = null,
}) => {
  const response = await api.post(`/conversations/${conversationId}/messages`, {
    clientMessageId,
    type,
    text,
    replyTo,
    poll,
  });
  return response.data.data;
};

export const editMessageApi = async ({ conversationId, messageId, text }) => {
  const response = await api.patch(`/conversations/${conversationId}/messages/${messageId}`, {
    text,
  });
  return response.data.data;
};

export const deleteMessageApi = async ({ conversationId, messageId, scope = 'me' }) => {
  const response = await api.delete(`/conversations/${conversationId}/messages/${messageId}`, {
    params: { scope },
  });
  return response.data.data;
};

export const reactMessageApi = async ({ conversationId, messageId, emoji }) => {
  const response = await api.post(`/conversations/${conversationId}/messages/${messageId}/reactions`, {
    emoji,
  });
  return response.data.data;
};

export const votePollApi = async ({ conversationId, messageId, optionIndex }) => {
  const response = await api.post(`/conversations/${conversationId}/messages/${messageId}/poll/vote`, {
    optionIndex,
  });
  return response.data.data;
};

export const starMessageApi = async ({ conversationId, messageId }) => {
  const response = await api.post(`/conversations/${conversationId}/messages/${messageId}/star`);
  return response.data.data;
};

export const pinMessageApi = async ({ conversationId, messageId }) => {
  const response = await api.post(`/conversations/${conversationId}/messages/${messageId}/pin`);
  return response.data.data;
};

export const forwardMessageApi = async ({ sourceConversationId, messageId, targetConversationId }) => {
  const response = await api.post(
    `/conversations/${sourceConversationId}/messages/${messageId}/forward`,
    { targetConversationId },
  );
  return response.data.data;
};

export const listScheduledMessagesApi = async (conversationId) => {
  const response = await api.get(`/conversations/${conversationId}/messages/scheduled`, {
    params: { limit: 50 },
  });
  return response.data.data;
};

export const scheduleMessageApi = async ({
  conversationId,
  clientMessageId,
  text,
  scheduledFor,
  replyTo = null,
  recurrence = { frequency: 'none', interval: 1 },
}) => {
  const response = await api.post(`/conversations/${conversationId}/messages/scheduled`, {
    clientMessageId,
    text,
    scheduledFor,
    replyTo,
    recurrence,
  });
  return response.data.data;
};

export const cancelScheduledMessageApi = async ({ conversationId, scheduledMessageId }) => {
  const response = await api.delete(
    `/conversations/${conversationId}/messages/scheduled/${scheduledMessageId}`,
  );
  return response.data.data;
};

export const searchMessagesApi = async ({ conversationId, query }) => {
  const response = await api.get(`/conversations/${conversationId}/messages/search`, {
    params: { q: query, limit: 50 },
  });
  return response.data.data;
};

export const uploadMediaApi = async ({ conversationId, file, text = '' }) => {
  const clientMessageId = `${file.name || 'upload'}-${file.size}-${file.lastModified || Date.now()}`;
  const formData = new FormData();
  formData.append('file', file);
  formData.append('text', text);
  formData.append('clientMessageId', clientMessageId);

  const response = await api.post(`/conversations/${conversationId}/messages/media`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });

  return response.data.data;
};

export const createGroupConversationApi = async ({ title, memberIds }) => {
  const response = await api.post('/conversations/groups', { title, memberIds });
  return response.data.data;
};

export const addGroupMembersApi = async ({ conversationId, memberIds }) => {
  const response = await api.post(`/conversations/${conversationId}/members`, { memberIds });
  return response.data.data;
};

export const removeGroupMemberApi = async ({ conversationId, userId }) => {
  const response = await api.delete(`/conversations/${conversationId}/members/${userId}`);
  return response.data.data;
};

export const updateGroupMemberRoleApi = async ({ conversationId, userId, role }) => {
  const response = await api.patch(`/conversations/${conversationId}/members/${userId}/role`, { role });
  return response.data.data;
};

export const markConversationReadApi = async (conversationId) => {
  const response = await api.post(`/conversations/${conversationId}/read`);
  return response.data.data;
};
