import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Phone,
  Video,
  PhoneIncoming,
  PhoneOutgoing,
  Camera,
  MoreVertical,
  MessageSquarePlus,
  Zap,
  ZapOff,
  RefreshCcw,
  SquarePen,
  SquircleDashed,
} from 'lucide-react';
import ChatListItem from './ChatListItem.jsx';

const MOBILE_TABS = ['status', 'calls', 'camera', 'chats', 'settings'];

const toInitials = (value) => {
  const parts = String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (!parts.length) return 'U';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
};

const toStringId = (value) => String(value);

const formatTimestamp = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }

  return date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  });
};

function IconPhone() {
  return <Phone className="h-[20px] w-[20px]" strokeWidth={1.8} />;
}

function IconVideo() {
  return <Video className="h-[20px] w-[20px]" strokeWidth={1.8} />;
}

function IconCallIncoming() {
  return <PhoneIncoming className="h-[14px] w-[14px]" strokeWidth={2} />;
}

function IconCallOutgoing() {
  return <PhoneOutgoing className="h-[14px] w-[14px]" strokeWidth={2} />;
}

function IconFlash({ enabled }) {
  return enabled ? (
    <Zap className="h-7 w-7 text-white fill-white" strokeWidth={1.8} />
  ) : (
    <ZapOff className="h-7 w-7 text-white" strokeWidth={1.8} />
  );
}

function IconFlip() {
  return <RefreshCcw className="h-7 w-7 text-white" strokeWidth={1.8} />;
}

function StatusRow({ title, subtitle, avatarUrl = '', highlighted = false, mine = false, onClick }) {
  return (
    <button
      type="button"
      className="flex w-full appearance-none items-center gap-3 border-0 border-b border-[#ece5dd] bg-white px-4 py-3 text-left"
      onClick={onClick}
    >
      <span
        className={[
          'relative inline-flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-full border-[3px]',
          highlighted ? 'border-[#25d366]' : 'border-[#d6d6d6]',
        ].join(' ')}
      >
        <span className="absolute inset-[3px] overflow-hidden rounded-full bg-[#93a6b0]">
          {avatarUrl ? (
            <img src={avatarUrl} alt={title} className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-[14px] font-semibold text-white">
              {toInitials(title)}
            </span>
          )}
        </span>
        {mine ? (
          <span className="absolute bottom-0 right-0 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-[#25d366] text-[14px] text-white ring-2 ring-white">
            +
          </span>
        ) : null}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-[16px] font-medium text-[#111b21]">{title}</span>
        <span className="mt-0.5 block truncate text-[13px] text-[#667781]">{subtitle}</span>
      </span>
    </button>
  );
}

export default function Sidebar({
  conversations,
  currentUserId,
  currentUserAvatar = '',
  activeConversationId,
  onSelectConversation,
  isLoading = false,
  onCreateGroup,
  manualPeerId = '',
  onManualPeerIdChange,
  onStartManualChat,
  isStartingManualChat = false,
  statusFeed = [],
  isStatusFeedLoading = false,
  onViewStatus,
  callLogItems = [],
  isCallsLoading = false,
  manualSearchError = '',
}) {
  const [activeMobileTab, setActiveMobileTab] = useState('chats');
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const [cameraState, setCameraState] = useState('idle');
  const [cameraError, setCameraError] = useState('');
  const [cameraSnapshot, setCameraSnapshot] = useState('');
  const [cameraFacingMode, setCameraFacingMode] = useState('environment');
  const [cameraFlashEnabled, setCameraFlashEnabled] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const swipeStartRef = useRef({ x: 0, y: 0, active: false });
  const cameraVideoRef = useRef(null);
  const cameraStreamRef = useRef(null);

  const filteredConversations = useMemo(() => {
    return conversations;
  }, [conversations]);

  const statusItems = useMemo(() => {
    return statusFeed.map((status) => {
      const statusUser = status.user || {};
      const isMine = toStringId(statusUser._id) === toStringId(currentUserId);
      return {
        ...status,
        isMine,
        title: isMine ? 'My status' : statusUser.displayName || statusUser.username || 'User',
        avatar: statusUser.avatar || '',
        subtitle:
          status.type === 'text'
            ? status.text || 'Tap to view'
            : `${status.type === 'video' ? 'Video' : 'Photo'}${status.caption ? ` • ${status.caption}` : ''}`,
        timeLabel: formatTimestamp(status.createdAt),
      };
    });
  }, [currentUserId, statusFeed]);

  const myStatus = statusItems.find((status) => status.isMine) || null;
  const recentStatuses = statusItems.filter((status) => !status.isMine);

  const callItems = useMemo(() => {
    return callLogItems.map((call) => {
      const callerId = toStringId(call.caller?._id || call.caller);
      return {
        ...call,
        isOutgoing: callerId === toStringId(currentUserId),
        title: call.peerLabel || call.peerName || 'Unknown user',
        timeLabel: formatTimestamp(call.startedAt || call.createdAt),
      };
    });
  }, [callLogItems, currentUserId]);

  const getTabIcon = (tab, isActive) => {
    const colorClass = isActive ? 'text-[#007AFF]' : 'text-[#8E8E93]';
    switch (tab) {
      case 'status':
        return <SquircleDashed className={`h-[26px] w-[26px] ${colorClass}`} />;
      case 'calls':
        return <Phone className={`h-[26px] w-[26px] ${colorClass}`} />;
      case 'camera':
        return <Camera className={`h-[26px] w-[26px] ${colorClass}`} />;
      case 'chats':
        return <MessageSquarePlus className={`h-[26px] w-[26px] ${colorClass}`} />;
      case 'settings':
        return <MoreVertical className={`h-[26px] w-[26px] ${colorClass}`} />;
      default:
        return null;
    }
  };

  const stopCameraPreview = useCallback(() => {
    if (cameraStreamRef.current) {
      for (const track of cameraStreamRef.current.getTracks()) {
        track.stop();
      }
      cameraStreamRef.current = null;
    }

    if (cameraVideoRef.current) {
      cameraVideoRef.current.srcObject = null;
    }
  }, []);

  const startCameraPreview = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setCameraState('unsupported');
      setCameraError('Camera is unavailable in this browser.');
      return;
    }

    setCameraError('');
    setCameraState('prompt');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: cameraFacingMode } },
        audio: false,
      });

      stopCameraPreview();
      cameraStreamRef.current = stream;
      if (cameraVideoRef.current) {
        cameraVideoRef.current.srcObject = stream;
      }
      setCameraState('granted');
    } catch (error) {
      const name = String(error?.name || '').toLowerCase();
      if (name.includes('permission') || name.includes('notallowed')) {
        setCameraState('denied');
        setCameraError('Camera permission denied.');
        return;
      }
      setCameraState('error');
      setCameraError(error?.message || 'Unable to open camera.');
    }
  }, [cameraFacingMode, stopCameraPreview]);

  const handleToggleFlash = useCallback(async () => {
    const nextValue = !cameraFlashEnabled;
    setCameraFlashEnabled(nextValue);

    const track = cameraStreamRef.current?.getVideoTracks?.()[0];
    if (!track?.applyConstraints) return;

    try {
      await track.applyConstraints({ advanced: [{ torch: nextValue }] });
    } catch {
      setCameraError('Flash control is not supported on this device.');
    }
  }, [cameraFlashEnabled]);

  const handleCaptureFrame = useCallback(() => {
    const video = cameraVideoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) return;

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    setCameraSnapshot(canvas.toDataURL('image/jpeg', 0.9));
  }, []);

  const selectTab = (tab) => {
    if (!MOBILE_TABS.includes(tab)) return;
    setActiveMobileTab(tab);
    if (tab !== 'chats') {
      setIsNewChatOpen(false);
    }
  };

  const handleTouchStart = (event) => {
    const touch = event.changedTouches?.[0];
    if (!touch) return;
    swipeStartRef.current = { x: touch.clientX, y: touch.clientY, active: true };
  };

  const handleTouchEnd = (event) => {
    if (!swipeStartRef.current.active) return;
    swipeStartRef.current.active = false;

    const touch = event.changedTouches?.[0];
    if (!touch) return;

    const diffX = touch.clientX - swipeStartRef.current.x;
    const diffY = touch.clientY - swipeStartRef.current.y;
    if (Math.abs(diffX) < 55 || Math.abs(diffX) < Math.abs(diffY) * 1.15) return;

    const currentIndex = MOBILE_TABS.indexOf(activeMobileTab);
    if (currentIndex < 0) return;
    const nextIndex = diffX < 0 ? Math.min(MOBILE_TABS.length - 1, currentIndex + 1) : Math.max(0, currentIndex - 1);

    if (nextIndex !== currentIndex) {
      selectTab(MOBILE_TABS[nextIndex]);
    }
  };

  useEffect(() => {
    if (activeMobileTab !== 'camera') {
      stopCameraPreview();
      return undefined;
    }

    startCameraPreview();
    return () => {
      stopCameraPreview();
    };
  }, [activeMobileTab, startCameraPreview, stopCameraPreview]);

  useEffect(() => {
    if (cameraVideoRef.current && cameraStreamRef.current) {
      cameraVideoRef.current.srcObject = cameraStreamRef.current;
    }
  }, [cameraState]);

  useEffect(() => {
    if (!activeConversationId) return;
    setIsNewChatOpen(false);
    setActiveMobileTab('chats');
  }, [activeConversationId]);

  return (
    <div
      className="relative flex h-full min-h-0 w-full flex-col bg-whatsapp-bg-main"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="relative shrink-0 bg-[#F6F6F6] text-[#000000] border-b border-[#D8D8D8]">
        <div className="flex h-11 items-center justify-between px-4 pt-1">
          <button
            className="text-[17px] text-[#007AFF]"
            onClick={() => setIsEditing(!isEditing)}
          >
            {isEditing ? 'Done' : 'Edit'}
          </button>
          <div className="flex items-center gap-1">
            <button
              className="text-[17px] text-[#007AFF]"
              onClick={() => setIsNewChatOpen(true)}
            >
              <SquarePen className="h-[22px] w-[22px]" />
            </button>
          </div>
        </div>

        <div className="px-4">
          <h1 className="text-[34px] m-0 font-bold tracking-[0.01em]">Chats</h1>
        </div>

        <div className="flex h-11 px-4 items-center justify-between border-t border-[#D8D8D8]">
          <button className="text-[16px] text-[#007AFF]">Broadcast Lists</button>
          <button
            className="text-[16px] text-[#007AFF]"
            onClick={onCreateGroup}
          >
            New Group
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {activeMobileTab === 'camera' ? (
          <div className="flex h-full flex-col bg-black text-white">
            <div className="relative flex-1 bg-black">
              <video ref={cameraVideoRef} className="h-full w-full object-cover" autoPlay playsInline muted />
              {cameraState !== 'granted' ? (
                <div className="absolute inset-0 flex items-center justify-center bg-black/45 px-6 text-center text-[14px] text-white/85">
                  {cameraError || 'Opening camera...'}
                </div>
              ) : null}
            </div>

            <div className="shrink-0 bg-black px-4 pb-[max(18px,env(safe-area-inset-bottom))] pt-3">
              <div className="flex items-center justify-between">
                <button type="button" className="text-white" onClick={handleToggleFlash}>
                  <IconFlash enabled={cameraFlashEnabled} />
                </button>
                <button
                  type="button"
                  className={[
                    'flex h-[72px] w-[72px] items-center justify-center rounded-full border-[5px]',
                    cameraState === 'granted' ? 'border-white' : 'border-white/30',
                  ].join(' ')}
                  onClick={handleCaptureFrame}
                  disabled={cameraState !== 'granted'}
                >
                  <span className="h-[56px] w-[56px] rounded-full border-[3px] border-white" />
                </button>
                <button
                  type="button"
                  className="text-white"
                  onClick={() => setCameraFacingMode((value) => (value === 'environment' ? 'user' : 'environment'))}
                >
                  <IconFlip />
                </button>
              </div>
              <p className="mt-3 text-center text-[13px] text-white/85">Hold for Video, tap for photo</p>
              {cameraSnapshot ? (
                <img
                  src={cameraSnapshot}
                  alt="Captured frame"
                  className="mx-auto mt-3 h-20 w-16 rounded-[6px] border border-white/20 object-cover"
                />
              ) : null}
            </div>
          </div>
        ) : null}

        {activeMobileTab === 'chats' ? (
          <div className="h-full overflow-y-auto bg-white pb-24">
            {isLoading ? <div className="px-4 py-5 text-[14px] text-text-tertiary">Loading conversations...</div> : null}
            {!isLoading && filteredConversations.length === 0 ? (
              <div className="px-4 py-5 text-[14px] text-text-tertiary">No conversations yet</div>
            ) : null}

            {!isLoading
              ? filteredConversations.map((conversation, index) => (
                <ChatListItem
                  key={conversation._id}
                  conversation={conversation}
                  currentUserId={currentUserId}
                  isActive={toStringId(conversation._id) === toStringId(activeConversationId)}
                  onSelect={onSelectConversation}
                  showSeparator={index !== filteredConversations.length - 1}
                  isEditMode={isEditing}
                />
              ))
              : null}
          </div>
        ) : null}

        {activeMobileTab === 'status' ? (
          <div className="h-full overflow-y-auto bg-[#f0f2f5] pb-16">
            <StatusRow
              title="My status"
              subtitle={myStatus ? `${myStatus.subtitle} • ${myStatus.timeLabel}` : 'Tap to add status update'}
              avatarUrl={currentUserAvatar || myStatus?.avatar || ''}
              highlighted={!myStatus}
              mine
              onClick={() => {
                if (myStatus?._id) {
                  onViewStatus?.(myStatus._id);
                }
              }}
            />

            <p className="px-4 py-2 text-[13px] font-medium uppercase tracking-[0.04em] text-[#667781]">
              Recent updates
            </p>

            {isStatusFeedLoading ? (
              <p className="px-4 py-5 text-[14px] text-[#667781]">Loading statuses...</p>
            ) : null}
            {!isStatusFeedLoading && recentStatuses.length === 0 ? (
              <p className="px-4 py-5 text-[14px] text-[#667781]">No recent updates</p>
            ) : null}

            {recentStatuses.map((status) => (
              <StatusRow
                key={status._id}
                title={status.title}
                subtitle={[status.timeLabel, status.subtitle].filter(Boolean).join(' • ')}
                avatarUrl={status.avatar}
                highlighted={!status.hasViewed}
                onClick={() => onViewStatus?.(status._id)}
              />
            ))}
          </div>
        ) : null}

        {activeMobileTab === 'calls' ? (
          <div className="h-full overflow-y-auto bg-white pb-16">
            {isCallsLoading ? <p className="px-4 py-5 text-[14px] text-[#667781]">Loading calls...</p> : null}
            {!isCallsLoading && callItems.length === 0 ? (
              <p className="px-4 py-5 text-[14px] text-[#667781]">No calls yet</p>
            ) : null}

            {callItems.map((call) => (
              <div key={call._id} className="flex items-center gap-3 border-b border-[#ece5dd] px-4 py-3">
                <span className="flex h-[48px] w-[48px] items-center justify-center rounded-full bg-[#92a2ad] text-white">
                  {toInitials(call.title)}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px] font-medium text-[#111b21]">{call.title}</span>
                  <span className="mt-0.5 flex items-center gap-1 text-[13px] text-[#667781]">
                    <span className={call.isOutgoing ? 'text-[#00a884]' : 'text-[#ef5350]'}>
                      {call.isOutgoing ? <IconCallOutgoing /> : <IconCallIncoming />}
                    </span>
                    {call.timeLabel}
                  </span>
                </span>

                <span className="text-[#00a884]">{call.type === 'video' ? <IconVideo /> : <IconPhone />}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {activeMobileTab === 'settings' ? (
        <div className="h-full bg-white flex items-center justify-center p-4">
          <p className="text-[#8E8E93]">Settings (Not implemented)</p>
        </div>
      ) : null}
      <div className="shrink-0 bg-[#F6F6F6] border-t border-[#D8D8D8] px-2 pb-[max(20px,env(safe-area-inset-bottom))] py-2 flex justify-between">
        {MOBILE_TABS.map((tab) => {
          const isActive = activeMobileTab === tab;
          return (
            <button
              key={tab}
              onClick={() => selectTab(tab)}
              className="flex bg-transparent flex-1 flex-col items-center justify-center gap-1"
            >
              {getTabIcon(tab, isActive)}
              <span className={`text-[10px] font-medium capitalize ${isActive ? 'text-[#007AFF]' : 'text-[#8E8E93]'}`}>
                {tab}
              </span>
            </button>
          );
        })}
      </div>

      {isNewChatOpen ? (
        <div
          className="fixed inset-0 z-40 flex items-end bg-black/40"
          onClick={() => setIsNewChatOpen(false)}
        >
          <div
            className="w-full rounded-t-[18px] bg-white px-4 pb-[max(18px,env(safe-area-inset-bottom))] pt-4 shadow-[0_-10px_30px_rgba(0,0,0,0.28)]"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="text-[18px] font-semibold text-[#111b21]">New chat</h3>
            <p className="mt-1 text-[13px] text-[#667781]">Search a user by phone number</p>

            <form
              className="mt-4 flex items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                onStartManualChat?.();
              }}
            >
              <input
                value={manualPeerId}
                onChange={(event) => onManualPeerIdChange?.(event.target.value)}
                placeholder="Phone number"
                className="h-11 w-full rounded-[10px] border border-[#d1d7db] px-3 text-[15px] text-[#111b21] outline-none focus:border-[#00a884]"
              />
              <button
                type="submit"
                className="h-11 rounded-[10px] bg-[#00a884] px-4 text-[14px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isStartingManualChat || !manualPeerId.trim()}
              >
                {isStartingManualChat ? '...' : 'Start'}
              </button>
            </form>

            {manualSearchError ? <p className="mt-3 text-[13px] text-[#d93025]">{manualSearchError}</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
