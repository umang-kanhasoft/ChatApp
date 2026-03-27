import { useRef, useState } from 'react';
import { Icons } from '../assets/icons.jsx';

export default function ChatsTab({
  chats = [],
  contacts = [],
  onOpenChat,
  onStartManualChat,
  onCreateGroup,
}) {
  const [filter, setFilter] = useState('All');
  const [editMode, setEditMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [swipedChat, setSwipedChat] = useState(null);
  const [showNewChat, setShowNewChat] = useState(false);
  const touchStartX = useRef(0);

  const filters = ['All', 'Unread', 'Favourites', 'Groups'];

  const filteredChats = chats.filter((chat) => {
    const matchesSearch = chat.name.toLowerCase().includes(searchQuery.toLowerCase());

    switch (filter) {
      case 'Unread':
        return matchesSearch && chat.unread > 0;
      case 'Groups':
        return matchesSearch && chat.isGroup;
      case 'Favourites':
        return matchesSearch && chat.pinned;
      default:
        return matchesSearch;
    }
  });

  const pinnedChats = filteredChats.filter((chat) => chat.pinned);
  const regularChats = filteredChats.filter((chat) => !chat.pinned);

  const handleTouchStart = (event) => {
    touchStartX.current = event.touches[0].clientX;
  };

  const handleTouchEnd = (event, chatId) => {
    const diff = touchStartX.current - event.changedTouches[0].clientX;

    if (diff > 80) {
      setSwipedChat(chatId);
    } else if (diff < -80) {
      setSwipedChat(null);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.headerTop}>
          <button style={styles.editBtn} onClick={() => setEditMode(!editMode)}>
            {editMode ? 'Done' : 'Edit'}
          </button>
          <div style={styles.headerRight}>
            <button style={styles.iconBtn}>
              <Icons.Camera />
            </button>
            <button style={styles.iconBtn} data-testid="new-chat-button" onClick={() => setShowNewChat(true)}>
              <Icons.Edit />
            </button>
          </div>
        </div>
        <h1 style={styles.title}>Chats</h1>
      </div>

      <div className="search-bar">
        <Icons.Search />
        <input
          type="text"
          placeholder="Search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
        />
      </div>

      <div className="filter-pills">
        {filters.map((item) => (
          <button
            key={item}
            className={`filter-pill ${filter === item ? 'active' : ''}`}
            onClick={() => setFilter(item)}
          >
            {item}
          </button>
        ))}
      </div>

      <div style={styles.archivedRow}>
        <div style={styles.archivedIcon}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#0A7CFF">
            <path d="M20.54 5.23 19.15 3.55C18.88 3.21 18.47 3 18 3H6c-.47 0-.88.21-1.16.55L3.46 5.23C3.17 5.57 3 6.02 3 6.5V19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6.5c0-.48-.17-.93-.46-1.27zM12 17.5 6.5 12H10v-2h4v2h3.5L12 17.5zM5.12 5l.81-1h12l.94 1H5.12z" />
          </svg>
        </div>
        <span style={styles.archivedText}>Archived</span>
        <span style={styles.archivedCount}>3</span>
      </div>

      <div style={styles.chatList} data-testid="chat-list">
        {[...pinnedChats, ...regularChats].map((chat) => (
          <div key={chat.id} style={styles.chatItemWrapper}>
            {swipedChat === chat.id ? (
              <div style={styles.swipeActions}>
                <button style={{ ...styles.swipeBtn, background: '#8e8e93' }}>More</button>
                <button style={{ ...styles.swipeBtn, background: '#FF9500' }}>Archive</button>
                <button style={{ ...styles.swipeBtn, background: '#FF3B30' }}>Delete</button>
              </div>
            ) : null}
            <div
              data-testid={`chat-item-${chat.id}`}
              style={{
                ...styles.chatItem,
                transform: swipedChat === chat.id ? 'translateX(-200px)' : 'translateX(0)',
                transition: 'transform 0.3s ease',
              }}
              onTouchStart={handleTouchStart}
              onTouchEnd={(event) => handleTouchEnd(event, chat.id)}
              onClick={() => !editMode && onOpenChat(chat)}
            >
              {editMode ? (
                <div style={styles.editCheckbox}>
                  <div style={styles.checkbox} />
                </div>
              ) : null}
              <div style={styles.avatarContainer}>
                <div style={styles.avatar}>
                  <span style={styles.avatarEmoji}>{chat.avatar}</span>
                </div>
                {chat.online ? <div style={styles.onlineDot} /> : null}
              </div>
              <div style={styles.chatContent}>
                <div style={styles.chatTopRow}>
                  <span style={styles.chatName}>{chat.name}</span>
                  <span
                    style={{
                      ...styles.chatTime,
                      color: chat.unread > 0 ? '#0A7CFF' : '#8e8e93',
                    }}
                  >
                    {chat.lastMessageTime}
                  </span>
                </div>
                <div style={styles.chatBottomRow}>
                  <div style={styles.messagePreview}>
                    {chat.typing ? (
                      <span style={styles.typingText}>typing...</span>
                    ) : (
                      <span style={styles.lastMessage}>{chat.lastMessage}</span>
                    )}
                  </div>
                  <div style={styles.chatIndicators}>
                    {chat.muted ? <Icons.Muted /> : null}
                    {chat.unread > 0 ? (
                      <div style={styles.unreadBadge}>
                        <span style={styles.unreadText}>{chat.unread}</span>
                      </div>
                    ) : null}
                    {chat.pinned && !chat.unread ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="#8e8e93">
                        <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
                      </svg>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {showNewChat ? (
        <div style={styles.overlay} onClick={() => setShowNewChat(false)}>
          <div style={styles.newChatModal} onClick={(event) => event.stopPropagation()}>
            <div style={styles.modalHeader}>
              <button onClick={() => setShowNewChat(false)} style={styles.modalCancel}>
                Cancel
              </button>
              <span style={styles.modalTitle}>New Chat</span>
              <div style={{ width: 60 }} />
            </div>
            <div className="search-bar" style={{ margin: '0 16px 10px' }}>
              <Icons.Search />
              <input
                type="text"
                placeholder="Search name or number"
                data-testid="new-chat-search-input"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return;
                  const rawValue = searchQuery.trim();
                  if (!rawValue) return;
                  onStartManualChat?.(rawValue);
                  setShowNewChat(false);
                }}
              />
            </div>
            {[
              { icon: '➕', label: 'New Contact', color: '#0A7CFF', action: () => onStartManualChat?.(searchQuery) },
              { icon: '👥', label: 'New Group', color: '#34C759', action: () => onCreateGroup?.() },
              { icon: '🏘️', label: 'New Community', color: '#32ADE6' },
            ].map((option) => (
              <div
                key={option.label}
                style={styles.newChatOption}
                onClick={() => {
                  option.action?.();
                  if (option.action) {
                    setShowNewChat(false);
                  }
                }}
              >
                <div style={{ ...styles.optionIcon, background: option.color }}>
                  <span style={{ fontSize: 18 }}>{option.icon}</span>
                </div>
                <span style={styles.optionText}>{option.label}</span>
              </div>
            ))}
            <span style={styles.contactsLabel}>CONTACTS ON WHATSAPP</span>
            {contacts
              .filter((contact) => !contact.isGroup)
              .filter((contact) =>
                contact.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                String(contact.phone || '').toLowerCase().includes(searchQuery.toLowerCase()),
              )
              .map((contact) => (
                <div
                  key={contact.id}
                  style={styles.contactRow}
                  onClick={() => {
                    onOpenChat(contact);
                    setShowNewChat(false);
                  }}
                >
                  <div style={styles.contactAvatar}>
                    <span style={{ fontSize: 20 }}>{contact.avatar || '👤'}</span>
                  </div>
                  <div style={styles.contactInfo}>
                    <span style={styles.contactName}>{contact.name}</span>
                    <span style={styles.contactAbout}>{contact.about}</span>
                  </div>
                </div>
              ))}
            {searchQuery.trim() ? (
              <div
                style={styles.searchNumberRow}
                onClick={() => {
                  onStartManualChat?.(searchQuery.trim());
                  setShowNewChat(false);
                }}
              >
                <div style={styles.contactAvatar}>
                  <span style={{ fontSize: 20 }}>#</span>
                </div>
                <div style={styles.contactInfo}>
                  <span style={styles.contactName}>{searchQuery.trim()}</span>
                  <span style={styles.contactAbout}>Start chat with this number</span>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

const styles = {
  container: { background: '#000', minHeight: '100%', paddingBottom: 20 },
  header: { padding: '10px 16px 0' },
  headerTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  editBtn: { background: 'none', border: 'none', color: '#0A7CFF', fontSize: 17, cursor: 'pointer' },
  headerRight: { display: 'flex', gap: 16 },
  iconBtn: { background: 'none', border: 'none', cursor: 'pointer', padding: 4 },
  title: { color: '#fff', fontSize: 34, fontWeight: '700', letterSpacing: -0.5 },
  archivedRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '12px 16px',
    gap: 12,
    borderBottom: '0.5px solid rgba(255,255,255,0.1)',
  },
  archivedIcon: { width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  archivedText: { color: '#fff', fontSize: 16, fontWeight: '500', flex: 1 },
  archivedCount: { color: '#8e8e93', fontSize: 15 },
  chatList: { padding: 0 },
  chatItemWrapper: { position: 'relative', overflow: 'hidden' },
  chatItem: { display: 'flex', alignItems: 'center', padding: '10px 16px', cursor: 'pointer', background: '#000', position: 'relative' },
  swipeActions: { position: 'absolute', right: 0, top: 0, bottom: 0, display: 'flex', zIndex: 1 },
  swipeBtn: {
    width: 67,
    border: 'none',
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editCheckbox: { marginRight: 12 },
  checkbox: { width: 22, height: 22, borderRadius: 11, border: '2px solid #8e8e93' },
  avatarContainer: { position: 'relative', marginRight: 12, flexShrink: 0 },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEmoji: { fontSize: 26 },
  onlineDot: {
    position: 'absolute',
    bottom: 1,
    right: 1,
    width: 14,
    height: 14,
    borderRadius: 7,
    background: '#34C759',
    border: '2.5px solid #000',
  },
  chatContent: { flex: 1, minWidth: 0, borderBottom: '0.5px solid rgba(255,255,255,0.08)', paddingBottom: 10 },
  chatTopRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  chatName: { color: '#fff', fontSize: 17, fontWeight: '600' },
  chatTime: { fontSize: 14, marginLeft: 8, flexShrink: 0 },
  chatBottomRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  messagePreview: { flex: 1, minWidth: 0, overflow: 'hidden' },
  lastMessage: {
    color: '#8e8e93',
    fontSize: 15,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    display: 'block',
  },
  typingText: { color: '#34C759', fontSize: 15, fontStyle: 'italic' },
  chatIndicators: { display: 'flex', alignItems: 'center', gap: 6, marginLeft: 8, flexShrink: 0 },
  unreadBadge: {
    background: '#0A7CFF',
    borderRadius: 12,
    minWidth: 22,
    height: 22,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 6px',
  },
  unreadText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.5)',
    zIndex: 200,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-end',
    animation: 'fadeIn 0.3s ease',
  },
  newChatModal: {
    background: '#1c1c1e',
    borderRadius: '16px 16px 0 0',
    padding: '0 0 40px',
    animation: 'slideUp 0.3s ease',
    maxHeight: '85%',
    overflow: 'auto',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '18px 16px',
    borderBottom: '0.5px solid rgba(255,255,255,0.1)',
  },
  modalCancel: { background: 'none', border: 'none', color: '#0A7CFF', fontSize: 17, cursor: 'pointer' },
  modalTitle: { color: '#fff', fontSize: 17, fontWeight: '600' },
  newChatOption: { display: 'flex', alignItems: 'center', padding: '12px 16px', gap: 14, cursor: 'pointer' },
  optionIcon: { width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  optionText: { color: '#0A7CFF', fontSize: 17, fontWeight: '500' },
  contactsLabel: {
    color: '#8e8e93',
    fontSize: 13,
    fontWeight: '600',
    padding: '16px 16px 8px',
    display: 'block',
    letterSpacing: 0.5,
  },
  contactRow: { display: 'flex', alignItems: 'center', padding: '8px 16px', gap: 12, cursor: 'pointer' },
  contactAvatar: { width: 40, height: 40, borderRadius: 20, background: '#2c2c2e', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  contactInfo: { flex: 1, borderBottom: '0.5px solid rgba(255,255,255,0.08)', paddingBottom: 8 },
  contactName: { color: '#fff', fontSize: 16, fontWeight: '500', display: 'block' },
  contactAbout: { color: '#8e8e93', fontSize: 14, display: 'block', marginTop: 2 },
  searchNumberRow: { display: 'flex', alignItems: 'center', padding: '8px 16px', gap: 12, cursor: 'pointer' },
};
