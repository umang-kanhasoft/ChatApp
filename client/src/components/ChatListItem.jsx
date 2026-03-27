import { useState, useRef } from 'react';
import dayjs from 'dayjs';
import { getReceiptSummary } from '../utils/messageReceipts.js';

import { MoreHorizontal, Archive } from 'lucide-react';

const toStringId = (value) => String(value);

const getConversationTitle = (conversation, currentUserId) => {
  if (conversation.type !== 'private') {
    return conversation.title || 'Group';
  }

  const peer = conversation.participants
    ?.map((entry) => entry.user)
    .find((entry) => toStringId(entry?._id) !== toStringId(currentUserId));

  return peer?.displayName || peer?.username || 'Unknown user';
};

const getConversationPreview = (conversation) => {
  const text = conversation.lastMessage?.content?.text;
  if (text) return { kind: 'text', text };

  const messageType = conversation.lastMessage?.type;
  if (!messageType) return { kind: 'empty', text: 'No messages yet' };

  if (messageType === 'image') return { kind: 'photo', text: 'Photo' };
  if (messageType === 'video') return { kind: 'video', text: 'Video' };
  if (messageType === 'audio' || messageType === 'voice') return { kind: 'voice', text: 'Voice message' };
  if (messageType === 'document') return { kind: 'document', text: 'Document' };
  return { kind: 'type', text: `[${messageType}]` };
};

const isLastMessageFromCurrentUser = (conversation, currentUserId) =>
  toStringId(conversation.lastMessage?.sender?._id || conversation.lastMessage?.sender) ===
  toStringId(currentUserId);

const getDeliveryTick = (conversation) => {
  const { readCount, deliveredCount } = getReceiptSummary(
    conversation.lastMessage,
    (conversation.participants || []).length || 2,
  );

  if (readCount > 1) return { label: '✓✓', className: 'text-[#53bdeb]' };
  if (deliveredCount > 1) return { label: '✓✓', className: 'text-[#8696a0]' };
  return { label: '✓', className: 'text-[#8696a0]' };
};

const getUnreadCount = (conversation, currentUserId) => {
  const participant = conversation.participants?.find(
    (entry) => toStringId(entry.user?._id || entry.user) === toStringId(currentUserId),
  );
  return Number(participant?.unreadCount || 0);
};

const getPeerAvatar = (conversation, currentUserId) => {
  if (conversation.type !== 'private') {
    return {
      url: '',
      isGroup: true,
      label: (conversation.title || 'Group').slice(0, 2).toUpperCase(),
    };
  }

  const peer = conversation.participants
    ?.map((entry) => entry.user)
    .find((entry) => toStringId(entry?._id) !== toStringId(currentUserId));

  const label = (peer?.displayName || peer?.username || 'U').trim();
  return {
    url: peer?.avatar || '',
    isGroup: false,
    label: label
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase(),
  };
};

function IconPhoto() {
  return (
    <svg viewBox="0 0 16 12" aria-hidden="true" className="h-[11px] w-[14px]" fill="none">
      <rect x="1" y="1" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="5" cy="4" r="1" fill="currentColor" />
      <path d="M3 10l4-3.2L9 8.7l2.2-2.1L13 8.6V10" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function IconMic() {
  return (
    <svg viewBox="0 0 10 16" aria-hidden="true" className="h-[14px] w-[9px]" fill="none">
      <rect x="3" y="1" width="4" height="8" rx="2" stroke="currentColor" strokeWidth="1.2" />
      <path d="M1 7a4 4 0 008 0M5 11v3M3.2 14h3.6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function IconDoneAll() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-[14px] w-[14px]" fill="none">
      <path d="M2.8 10.5l2.8 2.8 4.8-5.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8.4 10.5l2.8 2.8 6-6.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function ChatListItem({
  conversation,
  currentUserId,
  isActive,
  onSelect,
  isEditMode = false,
  isSelected = false,
  onToggleSelect,
}) {
  const title = getConversationTitle(conversation, currentUserId);
  const preview = getConversationPreview(conversation);
  const unreadCount = getUnreadCount(conversation, currentUserId);
  const avatar = getPeerAvatar(conversation, currentUserId);
  const activityTime = conversation.lastActivityAt ? dayjs(conversation.lastActivityAt) : null;
  const timeLabel = activityTime
    ? activityTime.isSame(dayjs(), 'day')
      ? activityTime.format('HH:mm')
      : activityTime.format('MM/DD/YY')
    : '';
  const ownLastMessage = isLastMessageFromCurrentUser(conversation, currentUserId);
  const deliveryTick = getDeliveryTick(conversation);

  const [swipeOffset, setSwipeOffset] = useState(0);
  const swipeStartRef = useRef({ x: 0, time: 0, active: false });
  const MAX_SWIPE = -148; // 74px for More, 74px for Archive

  const handleTouchStart = (e) => {
    if (isEditMode) return;
    const touch = e.touches?.[0];
    if (touch) {
      swipeStartRef.current = { x: touch.clientX, time: Date.now(), active: true };
    }
  };

  const handleTouchMove = (e) => {
    if (!swipeStartRef.current.active) return;
    const touch = e.touches?.[0];
    if (touch) {
      const diffX = touch.clientX - swipeStartRef.current.x;
      if (diffX < 0) {
        setSwipeOffset(Math.max(MAX_SWIPE, diffX));
      } else if (swipeOffset < 0) {
        // Swipe right to close
        setSwipeOffset(Math.min(0, swipeOffset + diffX));
      }
    }
  };

  const handleTouchEnd = () => {
    swipeStartRef.current.active = false;
    if (swipeOffset < MAX_SWIPE / 2) {
      setSwipeOffset(MAX_SWIPE);
    } else {
      setSwipeOffset(0);
    }
  };

  const handleClick = () => {
    if (swipeOffset < 0) {
      setSwipeOffset(0); // Close swipe on tap
      return;
    }
    if (isEditMode) {
      onToggleSelect?.(conversation);
      return;
    }
    onSelect?.(conversation);
  };

  return (
    <div className="relative overflow-hidden w-full bg-white">
      {/* Swipe Actions Background */}
      <div className="absolute inset-y-0 right-0 flex max-w-[148px] w-full items-stretch z-0">
        <button className="flex w-[74px] flex-col items-center justify-center gap-1 bg-[#C6C6C6] text-white">
          <MoreHorizontal className="h-6 w-6" />
          <span className="text-[14px]">More</span>
        </button>
        <button className="flex w-[74px] flex-col items-center justify-center gap-1 bg-[#3497F9] text-white">
          <Archive className="h-6 w-6" fill="white" />
          <span className="text-[14px]">Archive</span>
        </button>
      </div>

      <button
        type="button"
        onClick={handleClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ transform: `translateX(${swipeOffset}px)`, transition: swipeStartRef.current.active ? 'none' : 'transform 0.2s ease-out' }}
        className={[
          'group relative z-10 flex w-full appearance-none items-center bg-white px-4 py-2 hover:bg-whatsapp-bg-main transition-colors',
          isActive ? 'bg-whatsapp-bg-main' : '',
        ].join(' ')}
      >
        {isEditMode ? (
          <span
            className={[
              'mr-3 shrink-0 inline-flex h-5 w-5 items-center justify-center rounded-full border',
              isSelected ? 'border-whatsapp-blue bg-whatsapp-blue' : 'border-text-muted bg-white',
            ].join(' ')}
          >
            {isSelected ? <span className="h-2 w-2 rounded-full bg-white" /> : null}
          </span>
        ) : null}

        {avatar.url ? (
          <img
            src={avatar.url}
            alt={title}
            className="h-14 w-14 shrink-0 rounded-full object-cover"
            loading="lazy"
          />
        ) : (
          <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-text-muted">
            <img
              src={avatar.isGroup ? '/groups.svg' : '/person.svg'}
              alt={avatar.isGroup ? 'Group avatar' : 'User avatar'}
              className="h-8 w-8"
            />
          </span>
        )}

        <div className="ml-3.5 flex min-w-0 flex-1 flex-col justify-center border-b border-whatsapp-bg-chat py-2">
          <div className="flex w-full items-center justify-between">
            <p className="truncate text-[16px] font-semibold text-text-primary m-0">{title}</p>
            <span
              className={[
                'shrink-0 text-[11px]',
                unreadCount > 0 ? 'text-whatsapp-blue font-semibold' : 'text-[#667781]',
              ].join(' ')}
            >
              {timeLabel}
            </span>
          </div>

          <div className="mt-0.5 flex w-full items-center justify-between gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              {ownLastMessage ? (
                <span className={`shrink-0 ${deliveryTick.className}`}>
                  <IconDoneAll />
                </span>
              ) : null}

              {preview.kind === 'photo' ? (
                <span className="text-text-tertiary">
                  <IconPhoto />
                </span>
              ) : null}
              {preview.kind === 'voice' ? (
                <span className="text-whatsapp-blue">
                  <IconMic />
                </span>
              ) : null}

              <p className="truncate text-[14px] m-0 text-text-tertiary">{preview.text}</p>
            </div>

            {unreadCount > 0 ? (
              <span className="flex h-[20px] min-w-[20px] shrink-0 items-center justify-center rounded-full bg-whatsapp-blue px-1.5 text-[11px] font-bold text-white">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            ) : null}
          </div>
        </div>
      </button>
    </div>
  );
}
