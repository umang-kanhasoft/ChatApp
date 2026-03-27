import { useState } from 'react';
import dayjs from 'dayjs';
import { Virtuoso } from 'react-virtuoso';

const renderMedia = (message) => {
  const url = message.content?.mediaUrl;
  if (!url) return null;

  if (message.type === 'image') {
    return <img className="message-media-image" src={url} alt={message.content?.fileName || 'image'} />;
  }

  if (message.type === 'video') {
    return <video className="message-media-video" src={url} controls preload="metadata" />;
  }

  if (message.type === 'audio') {
    return <audio className="message-media-audio" src={url} controls preload="metadata" />;
  }

  return (
    <a className="message-file-link" href={url} target="_blank" rel="noreferrer">
      {message.content?.fileName || 'Open file'}
    </a>
  );
};

const reactionCount = (reaction) => reaction.users?.length || 0;
const toStringId = (value) => String(value);
const isStarredByUser = (message, userId) =>
  (message.starredBy || []).some(
    (entry) => toStringId(entry?._id || entry) === toStringId(userId),
  );
const countPollVotes = (option) => option?.votes?.length || 0;
const hasPollVoteByUser = (option, userId) =>
  (option?.votes || []).some((entry) => toStringId(entry?._id || entry) === toStringId(userId));
const getPollExpiryDate = (poll) => {
  if (!poll?.expiresAt) return null;
  const parsed = new Date(poll.expiresAt);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};
const getParticipantLabel = (entry) => entry?.displayName || entry?.username || toStringId(entry?._id || entry);

export default function MessageList({
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
  const [expandedPollMessageId, setExpandedPollMessageId] = useState('');

  if (!messages.length) {
    return <div className="empty-panel">No messages yet. Start the conversation.</div>;
  }

  const headerComponent = nextCursor || loadingOlder
    ? () => (
        <div className="message-list-header">
          <span className="message-list-header-text">
            {loadingOlder
              ? 'Loading older messages...'
              : 'Scroll to top to load older messages'}
          </span>
        </div>
      )
    : undefined;

  return (
    <Virtuoso
      className="message-list"
      data={messages}
      followOutput={(isAtBottom) => (isAtBottom ? 'smooth' : false)}
      startReached={() => {
        if (!nextCursor || loadingOlder) return;
        onLoadOlder?.();
      }}
      components={headerComponent ? { Header: headerComponent } : undefined}
      itemContent={(_, message) => {
        const isOwn = message.sender?._id === currentUserId || message.sender === currentUserId;
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
        const pollExpiryDate = getPollExpiryDate(poll);
        const isPollClosed = Boolean(pollExpiryDate && pollExpiryDate.getTime() <= Date.now());
        const hasQueuedPollVote = Boolean(queuedPollVotesByMessageId[message._id]);
        const isPollVoterPanelOpen = expandedPollMessageId === message._id;
        const receiptLabel = isOwn
          ? readByAllPeers
            ? '✓✓ read'
            : deliveredToAllPeers
              ? '✓✓ delivered'
              : '✓ sent'
          : '';
        const messageStatusLabel = message.failed
          ? 'Failed to send'
          : message.queued
            ? 'Queued offline'
            : message.optimistic
              ? 'Sending...'
              : receiptLabel;

        return (
          <div className={isOwn ? 'message-row message-row-own' : 'message-row'}>
            <div className={isOwn ? 'message-bubble message-bubble-own' : 'message-bubble'}>
              <p className="message-sender">{isOwn ? 'You' : senderName}</p>
              {message.replyTo?.content?.text ? (
                <p className="message-reply-preview">{`Reply: ${message.replyTo.content.text}`}</p>
              ) : null}
              {editingMessageId === message._id ? (
                <form
                  className="message-edit-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    onEditSubmit(message._id);
                  }}
                >
                  <input
                    type="text"
                    value={editingText}
                    onChange={(event) => onEditTextChange(event.target.value)}
                  />
                  <button type="submit">Save</button>
                  <button type="button" className="ghost-btn" onClick={onEditCancel}>
                    Cancel
                  </button>
                </form>
              ) : (
                <>
                  {message.content?.text ? <p className="message-text">{message.content.text}</p> : null}
                  {renderMedia(message)}
                  {poll ? (
                    <div className="message-poll">
                      <p className="message-poll-question">{poll.question}</p>
                      {pollOptions.map((option, optionIndex) => {
                        const optionVotes = countPollVotes(option);
                        const votedByMe = hasPollVoteByUser(option, currentUserId);
                        const votePercent = totalPollVotes > 0 ? Math.round((optionVotes / totalPollVotes) * 100) : 0;

                        return (
                          <button
                            key={`${message._id}-poll-option-${optionIndex}`}
                            type="button"
                            className={votedByMe ? 'poll-option poll-option-voted' : 'poll-option'}
                            disabled={isPollClosed}
                            onClick={() => onVotePoll?.(message._id, optionIndex)}
                          >
                            <span>{option.text}</span>
                            <span>{`${optionVotes} (${votePercent}%)`}</span>
                          </button>
                        );
                      })}
                      <p className="message-poll-meta">
                        {`${totalPollVotes} vote${totalPollVotes === 1 ? '' : 's'} · ${
                          poll.allowMultipleChoice ? 'Multiple choice' : 'Single choice'
                        }`}
                        {pollExpiryDate
                          ? ` · ${
                              isPollClosed
                                ? 'Poll closed'
                                : `Ends ${dayjs(pollExpiryDate).format('MMM D, HH:mm')}`
                            }`
                          : ''}
                      </p>
                      {totalPollVotes > 0 ? (
                        <button
                          type="button"
                          className="ghost-btn message-poll-voters-toggle"
                          onClick={() =>
                            setExpandedPollMessageId((prev) => (prev === message._id ? '' : message._id))
                          }
                        >
                          {isPollVoterPanelOpen ? 'Hide voters' : 'View voters'}
                        </button>
                      ) : null}
                      {isPollVoterPanelOpen ? (
                        <div className="message-poll-voters-panel">
                          {pollOptions.map((option, optionIndex) => {
                            const voters = option.votes || [];
                            if (voters.length === 0) return null;

                            return (
                              <div
                                key={`${message._id}-poll-voters-${optionIndex}`}
                                className="message-poll-voter-group"
                              >
                                <p className="message-poll-voter-option">{option.text}</p>
                                <div className="message-poll-voter-list">
                                  {voters.map((voter) => (
                                    <span
                                      key={`${message._id}-poll-voter-${optionIndex}-${toStringId(voter?._id || voter)}`}
                                      className="message-poll-voter-chip"
                                    >
                                      {getParticipantLabel(voter)}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : null}
                      {hasQueuedPollVote ? (
                        <p className="message-poll-note">Vote queued until connection is restored.</p>
                      ) : null}
                    </div>
                  ) : null}
                </>
              )}
              {message.isForwarded ? <p className="message-edited">(forwarded)</p> : null}
              {message.isEdited ? <p className="message-edited">(edited)</p> : null}
              {message.reactions?.length ? (
                <div className="message-reactions">
                  {message.reactions.map((reaction) => (
                    <button
                      key={`${message._id}-${reaction.emoji}`}
                      className="reaction-chip"
                      type="button"
                      onClick={() => onReact(message._id, reaction.emoji)}
                    >
                      {reaction.emoji} {reactionCount(reaction)}
                    </button>
                  ))}
                </div>
              ) : null}
              {(isPinned || isStarred) ? (
                <p className="message-flags">
                  {isPinned ? 'Pinned' : ''}
                  {isPinned && isStarred ? ' · ' : ''}
                  {isStarred ? 'Starred' : ''}
                </p>
              ) : null}
              <p className="message-time">{dayjs(message.createdAt).format('HH:mm')}</p>
              {messageStatusLabel ? <p className="message-receipt">{messageStatusLabel}</p> : null}
              <div className="message-actions">
                <button type="button" className="ghost-btn" onClick={() => onReply(message)}>
                  Reply
                </button>
                <button type="button" className="ghost-btn" onClick={() => onReact(message._id, '👍')}>
                  👍
                </button>
                <button type="button" className="ghost-btn" onClick={() => onStar(message._id)}>
                  {isStarred ? 'Unstar' : 'Star'}
                </button>
                <button type="button" className="ghost-btn" onClick={() => onPin(message._id)}>
                  {isPinned ? 'Unpin' : 'Pin'}
                </button>
                <button type="button" className="ghost-btn" onClick={() => onForward(message)}>
                  Forward
                </button>
                {isOwn ? (
                  <>
                    {message.type !== 'poll' ? (
                      <button type="button" className="ghost-btn" onClick={() => onEdit(message)}>
                        Edit
                      </button>
                    ) : null}
                    <button type="button" className="ghost-btn" onClick={() => onDelete(message._id, 'me')}>
                      Delete me
                    </button>
                    <button
                      type="button"
                      className="ghost-btn"
                      onClick={() => onDelete(message._id, 'everyone')}
                    >
                      Delete all
                    </button>
                  </>
                ) : (
                  <button type="button" className="ghost-btn" onClick={() => onDelete(message._id, 'me')}>
                    Delete me
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      }}
    />
  );
}
