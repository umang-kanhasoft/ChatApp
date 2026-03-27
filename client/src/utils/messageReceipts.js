const toStringId = (value) => String(value ?? '');

export const appendReceiptEntry = (entries = [], userId, at) => {
  const exists = entries.some((entry) => toStringId(entry.user?._id || entry.user) === toStringId(userId));
  if (exists) return entries;
  return [...entries, { user: userId, at }];
};

export const getReceiptSummary = (message, participantCount = 2) => {
  const summary = message?.receiptSummary || {};
  const resolvedParticipantCount = Math.max(
    Number(summary.participantCount || participantCount || 0),
    1,
  );
  const deliveredCount = Math.max(
    Number(summary.deliveredCount || 0),
    Array.isArray(message?.deliveredTo) ? message.deliveredTo.length : 0,
  );
  const readCount = Math.max(
    Number(summary.readCount || 0),
    Array.isArray(message?.readBy) ? message.readBy.length : 0,
  );
  const peers = Math.max(resolvedParticipantCount - 1, 1);

  return {
    participantCount: resolvedParticipantCount,
    deliveredCount,
    readCount,
    peers,
    deliveredToAllPeers: deliveredCount - 1 >= peers,
    readByAllPeers: readCount - 1 >= peers,
  };
};

export const applyReceiptProgress = (
  message,
  userId,
  at,
  { markDelivered = true, markRead = false, participantCount = 2 } = {},
) => {
  const deliveredTo = markDelivered
    ? appendReceiptEntry(message?.deliveredTo || [], userId, at)
    : message?.deliveredTo || [];
  const readBy = markRead
    ? appendReceiptEntry(message?.readBy || [], userId, at)
    : message?.readBy || [];

  const deliveredChanged = deliveredTo.length !== (message?.deliveredTo || []).length;
  const readChanged = readBy.length !== (message?.readBy || []).length;
  const currentSummary = getReceiptSummary(message, participantCount);

  return {
    ...message,
    deliveredTo,
    readBy,
    receiptSummary: {
      participantCount: currentSummary.participantCount,
      deliveredCount: currentSummary.deliveredCount + (deliveredChanged ? 1 : 0),
      readCount: currentSummary.readCount + (readChanged ? 1 : 0),
    },
  };
};
