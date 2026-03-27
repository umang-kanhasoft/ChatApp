const toStringId = (value) => String(value);

const toDate = (value) => {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const buildMessageReceiptSummary = ({ message, participants = [] }) => {
  const senderId = toStringId(message?.sender?._id || message?.sender);
  const createdAt = toDate(message?.createdAt);

  let deliveredCount = 0;
  let readCount = 0;

  for (const participant of participants) {
    const participantUserId = toStringId(participant?.user?._id || participant?.user);

    if (participantUserId === senderId) {
      deliveredCount += 1;
      readCount += 1;
      continue;
    }

    const deliveredAt = toDate(participant?.lastDeliveredAt);
    const readAt = toDate(participant?.lastReadAt);

    if (createdAt && deliveredAt && deliveredAt.getTime() >= createdAt.getTime()) {
      deliveredCount += 1;
    }

    if (createdAt && readAt && readAt.getTime() >= createdAt.getTime()) {
      readCount += 1;
    }
  }

  return {
    participantCount: participants.length,
    deliveredCount,
    readCount,
  };
};

export const attachReceiptSummaryToMessage = ({ message, participants = [] }) => {
  if (!message) {
    return message;
  }

  return {
    ...message,
    id: message.id || toStringId(message._id),
    receiptSummary: buildMessageReceiptSummary({
      message,
      participants,
    }),
  };
};
