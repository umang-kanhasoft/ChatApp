import dayjs from 'dayjs';

const toStringId = (value) => String(value);

const getConversationTitle = (conversation, currentUserId) => {
  if (conversation.type !== 'private') {
    return conversation.title || 'Group conversation';
  }

  const peer = conversation.participants
    ?.map((item) => item.user)
    .find((user) => user?._id !== currentUserId);

  return peer?.displayName || peer?.username || 'Unknown user';
};

const getAvatarLabel = (title) => {
  const trimmed = String(title || '').trim();
  if (!trimmed) return '?';

  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return `${words[0][0]}${words[1][0]}`.toUpperCase();
};

const getConversationAvatar = (conversation, currentUserId) => {
  if (conversation.type !== 'private') {
    return {
      url: '',
      label: getAvatarLabel(conversation.title || 'Group'),
    };
  }

  const peer = conversation.participants
    ?.map((item) => item.user)
    .find((user) => toStringId(user?._id) !== toStringId(currentUserId));

  return {
    url: peer?.avatar || '',
    label: getAvatarLabel(peer?.displayName || peer?.username || 'User'),
  };
};

const getUnreadCountForUser = (conversation, currentUserId) => {
  const selfParticipant = conversation.participants?.find(
    (item) => toStringId(item.user?._id || item.user) === toStringId(currentUserId),
  );
  return Number(selfParticipant?.unreadCount || 0);
};

export default function ConversationList({
  conversations,
  currentUserId,
  activeConversationId,
  onSelect,
}) {
  if (!conversations.length) {
    return <div className="empty-panel">No conversations yet.</div>;
  }

  return (
    <div className="conversation-list">
      {conversations.map((conversation) => {
        const title = getConversationTitle(conversation, currentUserId);
        const lastMessage = conversation.lastMessage?.content?.text || 'No messages yet';
        const lastTime = conversation.lastActivityAt
          ? dayjs(conversation.lastActivityAt).format('HH:mm')
          : '';
        const unreadCount = getUnreadCountForUser(conversation, currentUserId);
        const avatar = getConversationAvatar(conversation, currentUserId);

        return (
          <button
            key={conversation._id}
            className={
              activeConversationId === conversation._id
                ? 'conversation-item conversation-item-active'
                : 'conversation-item'
            }
            onClick={() => onSelect(conversation)}
            type="button"
          >
            {avatar.url ? (
              <img className="conversation-item-avatar" src={avatar.url} alt={title} />
            ) : (
              <span className="conversation-item-avatar conversation-item-avatar-fallback">
                {avatar.label}
              </span>
            )}
            <div className="conversation-item-content">
              <div className="conversation-item-row">
                <span className="conversation-item-title">{title}</span>
                <span className="conversation-item-time">{lastTime}</span>
              </div>
              <div className="conversation-item-subrow">
                <p className="conversation-item-subtitle">{lastMessage}</p>
                {unreadCount > 0 ? (
                  <span className="conversation-item-unread">{unreadCount}</span>
                ) : null}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
