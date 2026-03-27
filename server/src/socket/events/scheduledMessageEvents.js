import { mapScheduledMessage } from '../../services/scheduledMessageService.js';

const toStringId = (value) => String(value ?? '');

const getSenderId = (scheduledMessage) => toStringId(scheduledMessage?.sender?._id || scheduledMessage?.sender);

const emitScheduledEventToSender = ({ io, event, scheduledMessage, extraPayload = {} }) => {
  if (!io || !scheduledMessage) return;

  const senderId = getSenderId(scheduledMessage);
  if (!senderId) return;

  io.to(`user:${senderId}`).emit(event, {
    ...mapScheduledMessage(scheduledMessage),
    ...extraPayload,
  });
};

export const emitScheduledMessageCreated = ({ io, scheduledMessage }) => {
  emitScheduledEventToSender({
    io,
    event: 'scheduled-message:created',
    scheduledMessage,
  });
};

export const emitScheduledMessageCanceled = ({ io, scheduledMessage }) => {
  emitScheduledEventToSender({
    io,
    event: 'scheduled-message:canceled',
    scheduledMessage,
  });
};

export const emitScheduledMessageSent = ({ io, scheduledMessage }) => {
  emitScheduledEventToSender({
    io,
    event: 'scheduled-message:sent',
    scheduledMessage,
  });
};

export const emitScheduledMessageFailed = ({ io, scheduledMessage }) => {
  emitScheduledEventToSender({
    io,
    event: 'scheduled-message:failed',
    scheduledMessage,
  });
};
