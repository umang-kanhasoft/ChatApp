import { useEffect, useRef } from 'react';
import { connectSocket, disconnectSocket, getSocket } from '../services/socket.js';

export const useChatSocket = ({
  accessToken,
  onMessage,
  onMessageUpdate,
  onDeliveryUpdate,
  onRemoveSelfMessage,
  onReadUpdate,
  onConversationUpdate,
  onIncomingCall,
  onCallAccepted,
  onCallDeclined,
  onCallSignal,
  onCallEnded,
  onCallMissed,
  onGroupCallStarted,
  onGroupCallParticipantJoined,
  onGroupCallParticipantLeft,
  onGroupCallEnded,
  onGroupCallSignal,
  onGroupCallMediaState,
  onGroupCallMuteRequested,
  onScheduledMessageCreated,
  onScheduledMessageCanceled,
  onScheduledMessageSent,
  onScheduledMessageFailed,
  onTyping,
  onPresence,
  onConnect,
  onDisconnect,
}) => {
  const callbacksRef = useRef({
    onMessage,
    onMessageUpdate,
    onDeliveryUpdate,
    onRemoveSelfMessage,
    onReadUpdate,
    onConversationUpdate,
    onIncomingCall,
    onCallAccepted,
    onCallDeclined,
    onCallSignal,
    onCallEnded,
    onCallMissed,
    onGroupCallStarted,
    onGroupCallParticipantJoined,
    onGroupCallParticipantLeft,
    onGroupCallEnded,
    onGroupCallSignal,
    onGroupCallMediaState,
    onGroupCallMuteRequested,
    onScheduledMessageCreated,
    onScheduledMessageCanceled,
    onScheduledMessageSent,
    onScheduledMessageFailed,
    onTyping,
    onPresence,
    onConnect,
    onDisconnect,
  });

  callbacksRef.current = {
    onMessage,
    onMessageUpdate,
    onDeliveryUpdate,
    onRemoveSelfMessage,
    onReadUpdate,
    onConversationUpdate,
    onIncomingCall,
    onCallAccepted,
    onCallDeclined,
    onCallSignal,
    onCallEnded,
    onCallMissed,
    onGroupCallStarted,
    onGroupCallParticipantJoined,
    onGroupCallParticipantLeft,
    onGroupCallEnded,
    onGroupCallSignal,
    onGroupCallMediaState,
    onGroupCallMuteRequested,
    onScheduledMessageCreated,
    onScheduledMessageCanceled,
    onScheduledMessageSent,
    onScheduledMessageFailed,
    onTyping,
    onPresence,
    onConnect,
    onDisconnect,
  };

  useEffect(() => {
    if (!accessToken) return undefined;

    const socket = connectSocket(accessToken);
    if (!socket) return undefined;

    const handleConnect = () => {
      callbacksRef.current.onConnect?.(socket);
    };

    const handleDisconnect = () => {
      callbacksRef.current.onDisconnect?.();
    };

    const handleMessage = (payload) => {
      callbacksRef.current.onMessage?.(payload);
    };

    const handleMessageUpdate = (payload) => {
      callbacksRef.current.onMessageUpdate?.(payload);
    };

    const handleDeliveryUpdate = (payload) => {
      callbacksRef.current.onDeliveryUpdate?.(payload);
    };

    const handleRemoveSelf = (payload) => {
      callbacksRef.current.onRemoveSelfMessage?.(payload);
    };

    const handleReadUpdate = (payload) => {
      callbacksRef.current.onReadUpdate?.(payload);
    };

    const handleConversationUpdate = (payload) => {
      callbacksRef.current.onConversationUpdate?.(payload);
    };

    const handleIncomingCall = (payload) => {
      callbacksRef.current.onIncomingCall?.(payload);
    };

    const handleCallAccepted = (payload) => {
      callbacksRef.current.onCallAccepted?.(payload);
    };

    const handleCallDeclined = (payload) => {
      callbacksRef.current.onCallDeclined?.(payload);
    };

    const handleCallSignal = (payload) => {
      callbacksRef.current.onCallSignal?.(payload);
    };

    const handleCallEnded = (payload) => {
      callbacksRef.current.onCallEnded?.(payload);
    };

    const handleCallMissed = (payload) => {
      callbacksRef.current.onCallMissed?.(payload);
    };

    const handleGroupCallStarted = (payload) => {
      callbacksRef.current.onGroupCallStarted?.(payload);
    };

    const handleGroupCallParticipantJoined = (payload) => {
      callbacksRef.current.onGroupCallParticipantJoined?.(payload);
    };

    const handleGroupCallParticipantLeft = (payload) => {
      callbacksRef.current.onGroupCallParticipantLeft?.(payload);
    };

    const handleGroupCallEnded = (payload) => {
      callbacksRef.current.onGroupCallEnded?.(payload);
    };

    const handleGroupCallSignal = (payload) => {
      callbacksRef.current.onGroupCallSignal?.(payload);
    };

    const handleGroupCallMediaState = (payload) => {
      callbacksRef.current.onGroupCallMediaState?.(payload);
    };

    const handleGroupCallMuteRequested = (payload) => {
      callbacksRef.current.onGroupCallMuteRequested?.(payload);
    };

    const handleScheduledMessageCreated = (payload) => {
      callbacksRef.current.onScheduledMessageCreated?.(payload);
    };

    const handleScheduledMessageCanceled = (payload) => {
      callbacksRef.current.onScheduledMessageCanceled?.(payload);
    };

    const handleScheduledMessageSent = (payload) => {
      callbacksRef.current.onScheduledMessageSent?.(payload);
    };

    const handleScheduledMessageFailed = (payload) => {
      callbacksRef.current.onScheduledMessageFailed?.(payload);
    };

    const handleTyping = (payload) => {
      callbacksRef.current.onTyping?.(payload);
    };

    const handlePresence = (payload) => {
      callbacksRef.current.onPresence?.(payload);
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('message:new', handleMessage);
    socket.on('message:update', handleMessageUpdate);
    socket.on('message:delivery-update', handleDeliveryUpdate);
    socket.on('message:remove-self', handleRemoveSelf);
    socket.on('message:read-update', handleReadUpdate);
    socket.on('conversation:update', handleConversationUpdate);
    socket.on('call:incoming', handleIncomingCall);
    socket.on('call:accepted', handleCallAccepted);
    socket.on('call:declined', handleCallDeclined);
    socket.on('call:signal', handleCallSignal);
    socket.on('call:ended', handleCallEnded);
    socket.on('call:missed', handleCallMissed);
    socket.on('group-call:started', handleGroupCallStarted);
    socket.on('group-call:participant-joined', handleGroupCallParticipantJoined);
    socket.on('group-call:participant-left', handleGroupCallParticipantLeft);
    socket.on('group-call:ended', handleGroupCallEnded);
    socket.on('group-call:signal', handleGroupCallSignal);
    socket.on('group-call:media-state', handleGroupCallMediaState);
    socket.on('group-call:mute-requested', handleGroupCallMuteRequested);
    socket.on('scheduled-message:created', handleScheduledMessageCreated);
    socket.on('scheduled-message:canceled', handleScheduledMessageCanceled);
    socket.on('scheduled-message:sent', handleScheduledMessageSent);
    socket.on('scheduled-message:failed', handleScheduledMessageFailed);
    socket.on('typing:update', handleTyping);
    socket.on('presence:update', handlePresence);

    if (socket.connected) {
      handleConnect();
    }

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('message:new', handleMessage);
      socket.off('message:update', handleMessageUpdate);
      socket.off('message:delivery-update', handleDeliveryUpdate);
      socket.off('message:remove-self', handleRemoveSelf);
      socket.off('message:read-update', handleReadUpdate);
      socket.off('conversation:update', handleConversationUpdate);
      socket.off('call:incoming', handleIncomingCall);
      socket.off('call:accepted', handleCallAccepted);
      socket.off('call:declined', handleCallDeclined);
      socket.off('call:signal', handleCallSignal);
      socket.off('call:ended', handleCallEnded);
      socket.off('call:missed', handleCallMissed);
      socket.off('group-call:started', handleGroupCallStarted);
      socket.off('group-call:participant-joined', handleGroupCallParticipantJoined);
      socket.off('group-call:participant-left', handleGroupCallParticipantLeft);
      socket.off('group-call:ended', handleGroupCallEnded);
      socket.off('group-call:signal', handleGroupCallSignal);
      socket.off('group-call:media-state', handleGroupCallMediaState);
      socket.off('group-call:mute-requested', handleGroupCallMuteRequested);
      socket.off('scheduled-message:created', handleScheduledMessageCreated);
      socket.off('scheduled-message:canceled', handleScheduledMessageCanceled);
      socket.off('scheduled-message:sent', handleScheduledMessageSent);
      socket.off('scheduled-message:failed', handleScheduledMessageFailed);
      socket.off('typing:update', handleTyping);
      socket.off('presence:update', handlePresence);
      disconnectSocket();
    };
  }, [accessToken]);

  return getSocket();
};
