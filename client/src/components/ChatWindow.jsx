import { useCallback, useEffect, useRef } from 'react';
import dayjs from 'dayjs';
import MessageBubble from './MessageBubble.jsx';

function HeaderHint({ loadingOlder, canLoadOlder }) {
  if (!loadingOlder && !canLoadOlder) return null;

  return (
    <div className="px-4 py-2 text-center text-[12px] text-[#667781]">
      {loadingOlder ? 'Loading older messages...' : 'Scroll up to load older messages'}
    </div>
  );
}

const formatDateChip = (value) => {
  const date = dayjs(value);
  if (!date.isValid()) return '';
  return date.format('ddd, MMM D');
};

export default function ChatWindow({
  conversationId,
  messages,
  currentUserId,
  participantCount = 2,
  nextCursor = null,
  loadingOlder = false,
  queuedPollVotesByMessageId = {},
  onLoadOlder,
  onEdit,
  onDelete,
  onReact,
  onStar,
  onPin,
  onForward,
  onVotePoll,
  onReply,
  editingMessageId,
  editingText,
  onEditTextChange,
  onEditCancel,
  onEditSubmit,
}) {
  const containerRef = useRef(null);
  const lastConversationIdRef = useRef(conversationId);
  const initialScrollDoneRef = useRef(false);
  const preserveScrollRef = useRef(null);
  const shouldStickToBottomRef = useRef(true);
  const previousSnapshotRef = useRef({
    count: 0,
    firstId: '',
    lastId: '',
  });

  const scrollToBottom = useCallback((behavior = 'auto') => {
    const container = containerRef.current;
    if (!container) return;

    container.scrollTo({
      top: container.scrollHeight,
      behavior,
    });
  }, []);

  useEffect(() => {
    if (lastConversationIdRef.current === conversationId) return;

    lastConversationIdRef.current = conversationId;
    initialScrollDoneRef.current = false;
    preserveScrollRef.current = null;
    shouldStickToBottomRef.current = true;
    previousSnapshotRef.current = {
      count: 0,
      firstId: '',
      lastId: '',
    };
  }, [conversationId]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || messages.length === 0) return;

    const firstId = String(messages[0]?._id || '');
    const lastId = String(messages[messages.length - 1]?._id || '');
    const previousSnapshot = previousSnapshotRef.current;
    const prependedOlderMessages =
      previousSnapshot.count > 0 &&
      previousSnapshot.firstId !== firstId &&
      previousSnapshot.lastId === lastId;
    const appendedNewMessage =
      previousSnapshot.count > 0 &&
      previousSnapshot.lastId !== lastId &&
      previousSnapshot.firstId === firstId;

    if (!initialScrollDoneRef.current) {
      requestAnimationFrame(() => {
        scrollToBottom();
        initialScrollDoneRef.current = true;
      });
    } else if (preserveScrollRef.current && prependedOlderMessages) {
      const { scrollHeight, scrollTop } = preserveScrollRef.current;
      requestAnimationFrame(() => {
        const nextScrollTop = container.scrollHeight - scrollHeight + scrollTop;
        container.scrollTop = nextScrollTop;
        preserveScrollRef.current = null;
      });
    } else if (appendedNewMessage && shouldStickToBottomRef.current) {
      requestAnimationFrame(() => {
        scrollToBottom('smooth');
      });
    }

    previousSnapshotRef.current = {
      count: messages.length,
      firstId,
      lastId,
    };
  }, [messages, scrollToBottom]);

  const handleScroll = useCallback(
    (event) => {
      const container = event.currentTarget;
      const distanceFromBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight;

      shouldStickToBottomRef.current = distanceFromBottom < 96;

      if (!nextCursor || loadingOlder || container.scrollTop > 96) return;

      preserveScrollRef.current = {
        scrollHeight: container.scrollHeight,
        scrollTop: container.scrollTop,
      };
      onLoadOlder?.();
    },
    [loadingOlder, nextCursor, onLoadOlder],
  );

  if (!messages.length) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-[14px] text-[#667781]">
        No messages yet. Start the conversation.
      </div>
    );
  }

  const canLoadOlder = Boolean(nextCursor);

  return (
    <div className="relative h-full wa-chat-wallpaper">
      {/* WhatsApp Doodle Background */}
      <div
        className="absolute inset-0 z-0 opacity-[0.06] pointer-events-none"
        style={{
          backgroundImage: "url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')",
          backgroundRepeat: 'repeat',
          backgroundSize: '400px'
        }}
      />
      <div
        ref={containerRef}
        className="relative z-10 h-full overflow-y-auto px-3 pb-3 pt-2 sm:px-4"
        onScroll={handleScroll}
      >
        <HeaderHint loadingOlder={loadingOlder} canLoadOlder={canLoadOlder} />

        {messages.map((message, index) => {
          const previous = index > 0 ? messages[index - 1] : null;
          const showDateChip =
            !previous ||
            !dayjs(previous.createdAt).isSame(dayjs(message.createdAt), 'day');

          return (
            <div className="py-[1px]" key={message._id}>
              {showDateChip ? (
                <div className="mb-2 mt-1 flex justify-center">
                  <span className="rounded-[8px] bg-[#DDDDE9] px-2.5 py-0.5 text-[11px] font-medium text-[#3C3C43] uppercase tracking-tight">
                    {formatDateChip(message.createdAt)}
                  </span>
                </div>
              ) : null}

              <MessageBubble
                message={message}
                currentUserId={currentUserId}
                participantCount={participantCount}
                queuedPollVotesByMessageId={queuedPollVotesByMessageId}
                onEdit={onEdit}
                onDelete={onDelete}
                onReact={onReact}
                onStar={onStar}
                onPin={onPin}
                onForward={onForward}
                onVotePoll={onVotePoll}
                onReply={onReply}
                editingMessageId={editingMessageId}
                editingText={editingText}
                onEditTextChange={onEditTextChange}
                onEditCancel={onEditCancel}
                onEditSubmit={onEditSubmit}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
