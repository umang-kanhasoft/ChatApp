import dayjs from 'dayjs';

const toStringId = (value) => String(value);

const reactionCount = (reaction) => reaction.users?.length || 0;

const isStarredByUser = (message, userId) =>
  (message.starredBy || []).some((entry) => toStringId(entry?._id || entry) === toStringId(userId));

const countPollVotes = (option) => option?.votes?.length || 0;

const hasPollVoteByUser = (option, userId) =>
  (option?.votes || []).some((entry) => toStringId(entry?._id || entry) === toStringId(userId));

const getParticipantLabel = (entry) => entry?.displayName || entry?.username || toStringId(entry?._id || entry);

const getFileExtension = (fileName) => {
  const parts = String(fileName || '').split('.');
  if (parts.length < 2) return '';
  return parts[parts.length - 1].toLowerCase();
};

const getFileDisplayName = (fileName) => {
  const value = String(fileName || '').trim();
  if (!value) return 'Document';
  return value;
};

const formatFileSize = (bytes) => {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return '';
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(0)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

function FileCardIcon() {
  return (
    <span className="flex h-[27px] w-[22px] shrink-0 flex-col justify-start rounded-sm border border-[#d1d1d6] bg-white shadow-[0_0.4px_0_rgba(0,0,0,0.08)]">
      <span className="ml-auto h-[6px] w-[6px] rounded-bl-sm bg-[#efefef]" />
      <span className="mx-auto mt-1 h-[1.4px] w-3 bg-[#007aff]" />
      <span className="mx-auto mt-[2px] h-[1.4px] w-3 bg-[#007aff]" />
      <span className="mx-auto mt-[2px] h-[1.4px] w-3 bg-[#007aff]" />
      <span className="mx-auto mt-[2px] h-[1.4px] w-3 bg-[#007aff]" />
    </span>
  );
}

const renderMedia = (message) => {
  const mediaUrl = message.content?.mediaUrl || message.content?.media?.url;
  if (!mediaUrl) return null;

  const fileName = message.content?.fileName || message.content?.media?.fileName || 'file';
  const fileSize = message.content?.fileSize || message.content?.media?.fileSize || 0;
  const extension = getFileExtension(fileName) || 'file';
  const fileSizeText = formatFileSize(fileSize);

  if (message.type === 'image') {
    return (
      <img
        className="mt-1.5 max-h-[280px] w-full rounded-[6px] object-cover"
        src={mediaUrl}
        alt={fileName}
        loading="lazy"
      />
    );
  }

  if (message.type === 'video') {
    return <video className="mt-1.5 max-h-[280px] w-full rounded-[6px]" src={mediaUrl} controls preload="metadata" />;
  }

  if (message.type === 'audio' || message.type === 'voice') {
    return <audio className="mt-1.5 w-full" src={mediaUrl} controls preload="metadata" />;
  }

  return (
    <a
      className="mt-1.5 block rounded-[6px] bg-[rgba(118,118,128,0.12)] p-2 no-underline"
      href={mediaUrl}
      target="_blank"
      rel="noreferrer"
    >
      <div className="flex items-center gap-2.5">
        <FileCardIcon />
        <p className="truncate text-[15px] leading-[19px] tracking-[-0.3px] text-[rgba(0,0,0,0.7)]">
          {getFileDisplayName(fileName)}
        </p>
      </div>
      <div className="mt-1 flex items-center justify-between text-[11px] leading-[13px] text-[rgba(0,0,0,0.4)]">
        <span>{[fileSizeText, extension].filter(Boolean).join(' • ')}</span>
      </div>
    </a>
  );
};

export default function MessageBubble({
  message,
  currentUserId,
  participantCount = 2,
  queuedPollVotesByMessageId = {},
  onReply,
  onReact,
  onStar,
  onPin,
  onForward,
  onEdit,
  onDelete,
  onVotePoll,
  editingMessageId,
  editingText,
  onEditTextChange,
  onEditCancel,
  onEditSubmit,
}) {
  const senderId = toStringId(message.sender?._id || message.sender);
  const isOwn = senderId === toStringId(currentUserId);
  const senderName = message.sender?.displayName || message.sender?.username || 'You';

  const deliveredCount = (message.deliveredTo || []).length;
  const readCount = (message.readBy || []).length;
  const peers = Math.max(participantCount - 1, 1);
  const readByAllPeers = readCount - 1 >= peers;
  const deliveredToAllPeers = deliveredCount - 1 >= peers;

  const isStarred = isStarredByUser(message, currentUserId);
  const isPinned = Boolean(message.pinnedAt);

  const poll = message.type === 'poll' ? message.content?.poll : null;
  const pollOptions = poll?.options || [];
  const totalPollVotes = pollOptions.reduce((sum, option) => sum + countPollVotes(option), 0);
  const hasQueuedPollVote = Boolean(queuedPollVotesByMessageId[message._id]);
  const allowMultipleChoice = Boolean(poll?.allowMultipleChoice ?? poll?.isMultipleChoice);

  const receiptLabel = isOwn
    ? readByAllPeers
      ? 'Read'
      : deliveredToAllPeers
        ? 'Delivered'
        : 'Sent'
    : '';

  const bubbleClasses = isOwn
    ? 'bg-[#DCF8C6] text-[#111b21] shadow-[0_1px_0.5px_rgba(0,0,0,0.13)] rounded-[8px] rounded-tr-none'
    : 'bg-[#FFFFFF] text-[#111b21] shadow-[0_1px_0.5px_rgba(0,0,0,0.13)] rounded-[8px] rounded-tl-none';
  const tickLabel = readByAllPeers ? '✓✓' : deliveredToAllPeers ? '✓✓' : '✓';
  const tickColorClass = readByAllPeers ? 'text-[#3497F9]' : 'text-[#8696a0]';
  const showCompactFooter =
    editingMessageId !== message._id &&
    !poll &&
    !message.reactions?.length &&
    !message.failed &&
    !message.queued &&
    !message.optimistic;

  return (
    <div className={isOwn ? 'flex justify-end px-[10px] py-[1px]' : 'flex justify-start px-[10px] py-[1px]'}>
      <div
        className={[
          'group relative max-w-[75%] min-w-[80px] px-2.5 pt-1.5 pb-2',
          bubbleClasses,
        ].join(' ')}
      >
        <span
          aria-hidden="true"
          className={
            isOwn
              ? 'absolute -right-[6px] top-0 h-[10px] w-[10px] bg-[#DCF8C6] [clip-path:polygon(0_0,0_100%,100%_0)]'
              : 'absolute -left-[6px] top-0 h-[10px] w-[10px] bg-[#FFFFFF] [clip-path:polygon(0_0,100%_0,100%_100%)]'
          }
        />

        {!isOwn && participantCount > 2 ? (
          <p className="mb-1 text-[12px] font-semibold leading-[14px] text-whatsapp-blue">{senderName}</p>
        ) : null}

        {message.replyTo?.content?.text ? (
          <p className="mb-1.5 rounded-md border-l-2 border-[#00a884] bg-[#ffffff80] px-2 py-1 text-[12px] text-[#54656f]">
            {`Reply: ${message.replyTo.content.text}`}
          </p>
        ) : null}

        {editingMessageId === message._id ? (
          <form
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              onEditSubmit?.(message._id);
            }}
          >
            <input
              type="text"
              value={editingText}
              onChange={(event) => onEditTextChange?.(event.target.value)}
              className="h-9 w-full rounded-md border border-[#d1d7db] bg-white px-2 text-[14px] outline-none focus:border-[#00a884]"
            />
            <div className="flex items-center gap-2">
              <button
                type="submit"
                className="h-8 rounded-md bg-[#00a884] px-3 text-[12px] font-medium text-white"
              >
                Save
              </button>
              <button
                type="button"
                className="h-8 rounded-md border border-[#d1d7db] px-3 text-[12px] text-[#54656f]"
                onClick={onEditCancel}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <>
            {message.content?.text ? (
              <div
                className="relative whitespace-pre-wrap break-words text-[16px] leading-[1.2] tracking-[-0.3px] text-[#111b21]"
              >
                {message.content.text}
                {showCompactFooter && (
                  <span className="inline-block w-[60px] h-[1px]" />
                )}
              </div>
            ) : null}
            {renderMedia(message)}

            {poll ? (
              <div className="mt-2 space-y-1.5 rounded-md bg-[#ffffff73] p-2">
                <p className="text-[13px] font-semibold text-[#111b21]">{poll.question}</p>
                {pollOptions.map((option, optionIndex) => {
                  const optionVotes = countPollVotes(option);
                  const votedByMe = hasPollVoteByUser(option, currentUserId);
                  const votePercent = totalPollVotes > 0 ? Math.round((optionVotes / totalPollVotes) * 100) : 0;

                  return (
                    <button
                      key={`${message._id}-poll-option-${optionIndex}`}
                      type="button"
                      className={[
                        'flex w-full items-center justify-between rounded-md border px-2 py-1 text-left text-[12px]',
                        votedByMe ? 'border-[#00a884] bg-[#d1f4ea]' : 'border-[#d1d7db] bg-white',
                      ].join(' ')}
                      onClick={() => onVotePoll?.(message._id, optionIndex)}
                      disabled={!onVotePoll}
                    >
                      <span className="truncate pr-2">{option.text}</span>
                      <span className="shrink-0 text-[#667781]">{`${optionVotes} (${votePercent}%)`}</span>
                    </button>
                  );
                })}
                <p className="text-[11px] text-[#667781]">
                  {`${totalPollVotes} vote${totalPollVotes === 1 ? '' : 's'} · ${allowMultipleChoice ? 'Multiple choice' : 'Single choice'
                    }`}
                </p>
                {hasQueuedPollVote ? (
                  <p className="text-[11px] text-[#667781]">Vote queued until connection is restored.</p>
                ) : null}
              </div>
            ) : null}
          </>
        )}

        {message.reactions?.length ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {message.reactions.map((reaction) => (
              <button
                key={`${message._id}-${reaction.emoji}`}
                type="button"
                onClick={() => onReact?.(message._id, reaction.emoji)}
                className="rounded-full bg-[#ffffffb3] px-2 py-0.5 text-[12px] text-[#2a3942]"
              >
                {reaction.emoji} {reactionCount(reaction)}
              </button>
            ))}
          </div>
        ) : null}

        {(isPinned || isStarred || message.isEdited || message.isForwarded) ? (
          <p className="mt-1 text-[11px] text-[#667781]">
            {message.isForwarded ? 'Forwarded' : ''}
            {message.isForwarded && (message.isEdited || isPinned || isStarred) ? ' · ' : ''}
            {message.isEdited ? 'Edited' : ''}
            {message.isEdited && (isPinned || isStarred) ? ' · ' : ''}
            {isPinned ? 'Pinned' : ''}
            {isPinned && isStarred ? ' · ' : ''}
            {isStarred ? 'Starred' : ''}
          </p>
        ) : null}

        <div className={showCompactFooter ? 'hidden' : 'mt-0.5 flex items-end justify-between gap-3'}>
          <div className="hidden flex-wrap items-center gap-1 opacity-0 transition-opacity md:group-hover:flex md:group-hover:opacity-100">
            <button
              type="button"
              className="rounded px-1.5 py-0.5 text-[11px] text-[#54656f] hover:bg-[#00000010]"
              onClick={() => onReply?.(message)}
            >
              Reply
            </button>
            <button
              type="button"
              className="rounded px-1.5 py-0.5 text-[11px] text-[#54656f] hover:bg-[#00000010]"
              onClick={() => onReact?.(message._id, '👍')}
            >
              React
            </button>
            <button
              type="button"
              className="rounded px-1.5 py-0.5 text-[11px] text-[#54656f] hover:bg-[#00000010]"
              onClick={() => onStar?.(message._id)}
            >
              {isStarred ? 'Unstar' : 'Star'}
            </button>
            <button
              type="button"
              className="rounded px-1.5 py-0.5 text-[11px] text-[#54656f] hover:bg-[#00000010]"
              onClick={() => onPin?.(message._id)}
            >
              {isPinned ? 'Unpin' : 'Pin'}
            </button>
            <button
              type="button"
              className="rounded px-1.5 py-0.5 text-[11px] text-[#54656f] hover:bg-[#00000010]"
              onClick={() => onForward?.(message)}
            >
              Forward
            </button>
            {isOwn ? (
              <>
                {message.type !== 'poll' ? (
                  <button
                    type="button"
                    className="rounded px-1.5 py-0.5 text-[11px] text-[#54656f] hover:bg-[#00000010]"
                    onClick={() => onEdit?.(message)}
                  >
                    Edit
                  </button>
                ) : null}
                <button
                  type="button"
                  className="rounded px-1.5 py-0.5 text-[11px] text-[#d33b2d] hover:bg-[#00000010]"
                  onClick={() => onDelete?.(message._id, 'everyone')}
                >
                  Delete
                </button>
              </>
            ) : (
              <button
                type="button"
                className="rounded px-1.5 py-0.5 text-[11px] text-[#d33b2d] hover:bg-[#00000010]"
                onClick={() => onDelete?.(message._id, 'me')}
              >
                Delete
              </button>
            )}
          </div>

          <div className="ml-auto flex items-center gap-1.5 self-end text-right">
            {message.failed ? <p className="text-[10px] text-whatsapp-red">Failed</p> : null}
            {message.queued ? <p className="text-[10px] text-text-tertiary">Queued</p> : null}
            {message.optimistic ? <p className="text-[10px] text-text-tertiary">Sending</p> : null}
            <p className="text-[11px] leading-[12px] tracking-[0.2px] text-text-tertiary">
              {dayjs(message.createdAt).format('HH:mm')}
            </p>
            {isOwn ? (
              <p className={`text-[16px] leading-[14px] ${tickColorClass}`} title={receiptLabel}>
                {tickLabel}
              </p>
            ) : null}
          </div>
        </div>

        {showCompactFooter ? (
          <div className="absolute bottom-[4px] right-[7px] flex items-center gap-[3px] text-right pointer-events-none">
            <p className="text-[11px] -mb-[1px] leading-none text-[#8696a0]">
              {dayjs(message.createdAt).format('HH:mm')}
            </p>
            {isOwn ? (
              <p className={`text-[15px] leading-none -mb-[1px] ${tickColorClass}`} title={receiptLabel}>
                {tickLabel}
              </p>
            ) : null}
          </div>
        ) : null}

        {poll && totalPollVotes > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {pollOptions.flatMap((option, optionIndex) =>
              (option.votes || []).slice(0, 3).map((entry) => (
                <span
                  key={`${message._id}-vote-${optionIndex}-${toStringId(entry?._id || entry)}`}
                  className="rounded-full bg-[#ffffffa8] px-2 py-0.5 text-[10px] text-[#54656f]"
                >
                  {getParticipantLabel(entry)}
                </span>
              )),
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
