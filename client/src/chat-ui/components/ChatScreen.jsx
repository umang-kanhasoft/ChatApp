import { useEffect, useRef, useState } from 'react';
import { Icons } from '../assets/icons.jsx';

const renderMessageBody = (message) => {
  if (message.type === 'poll') {
    return (
      <div style={styles.pollCard}>
        <span style={styles.pollTitle}>{message.pollQuestion || 'Poll'}</span>
        <span style={styles.pollMeta}>
          {message.pollOptionCount ? `${message.pollOptionCount} options` : 'Tap to vote'}
        </span>
      </div>
    );
  }

  if (message.type === 'image' && message.mediaUrl) {
    return <img style={styles.mediaImage} src={message.mediaUrl} alt={message.fileName || 'Image'} />;
  }

  if (message.type === 'video' && message.mediaUrl) {
    return <video style={styles.mediaVideo} src={message.mediaUrl} controls playsInline preload="metadata" />;
  }

  if ((message.type === 'audio' || message.type === 'voice') && message.mediaUrl) {
    return <audio style={styles.mediaAudio} src={message.mediaUrl} controls preload="metadata" />;
  }

  if (message.type === 'document' && message.mediaUrl) {
    return (
      <a style={styles.documentCard} href={message.mediaUrl} target="_blank" rel="noreferrer">
        <span style={styles.documentTitle}>{message.fileName || 'Document'}</span>
        <span style={styles.documentMeta}>Tap to open</span>
      </a>
    );
  }

  if (message.type === 'image') {
    return (
      <div style={styles.imagePlaceholder}>
        <span style={{ fontSize: 40 }}>🖼️</span>
      </div>
    );
  }

  return <span style={styles.messageText}>{message.text}</span>;
};

export default function ChatScreen({
  chat,
  messages = [],
  isLoading = false,
  typingLabel = '',
  currentCall,
  onBack,
  onOpenContactInfo,
  onSendMessage,
  onSendPoll,
  onUploadFile,
  onStartCall,
  onTypingStart,
  onTypingStop,
  onEditMessage,
  onDeleteMessage,
  onForwardMessage,
  onStarMessage,
  onPinMessage,
  onReactMessage,
  _onReportMessage,
  _onBlockUser,
  onEmojiClick,
  onMicClick,
}) {
  const [inputText, setInputText] = useState('');
  const [showAttachment, setShowAttachment] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const [showContactSheet, setShowContactSheet] = useState(false);
  const [contactDraft, setContactDraft] = useState({ name: '', phone: '' });
  const [showPollSheet, setShowPollSheet] = useState(false);
  const [pollDraft, setPollDraft] = useState({ question: '', options: '' });
  const messagesEndRef = useRef(null);
  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);
  const documentInputRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(
    () => () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      onTypingStop?.();
    },
    [onTypingStop],
  );

  const queueTypingStop = () => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      onTypingStop?.();
    }, 1200);
  };

  const handleComposerChange = (event) => {
    const nextValue = event.target.value;
    setInputText(nextValue);

    if (nextValue.trim()) {
      onTypingStart?.();
      queueTypingStop();
      return;
    }

    onTypingStop?.();
  };

  const sendMessage = () => {
    if (!inputText.trim()) {
      return;
    }
    if (editingMessage) {
      onEditMessage?.(editingMessage.rawId || editingMessage.id, inputText.trim());
      setEditingMessage(null);
    } else {
      onSendMessage?.(inputText.trim(), replyingTo);
      setReplyingTo(null);
    }
    setInputText('');
    onTypingStop?.();
  };

  const handleUploadChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    onUploadFile?.(file);
    event.target.value = '';
    setShowAttachment(false);
  };

  const handleShareLocation = () => {
    if (!navigator.geolocation) {
      onSendMessage?.('Location sharing is not supported on this device.', null);
      setShowAttachment(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = position.coords.latitude.toFixed(6);
        const longitude = position.coords.longitude.toFixed(6);
        onSendMessage?.(`My location: https://maps.google.com/?q=${latitude},${longitude}`, null);
        setShowAttachment(false);
      },
      () => {
        onSendMessage?.('Unable to access location. Please enable location permission and try again.', null);
        setShowAttachment(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  };

  const handleShareContact = async () => {
    const hasNativeContactsPicker =
      typeof navigator !== 'undefined' &&
      navigator.contacts &&
      typeof navigator.contacts.select === 'function';

    if (hasNativeContactsPicker) {
      try {
        const selected = await navigator.contacts.select(['name', 'tel'], { multiple: false });
        if (Array.isArray(selected) && selected.length > 0) {
          const picked = selected[0];
          const name = Array.isArray(picked.name) ? picked.name[0] : picked.name;
          const phone = Array.isArray(picked.tel) ? picked.tel[0] : picked.tel;
          const value = [name, phone].filter(Boolean).join(' | ');
          if (value) {
            onSendMessage?.(`Contact: ${value}`, null);
          }
          setShowAttachment(false);
          return;
        }
      } catch {
        // Fall through to in-app composer.
      }
    }

    setShowAttachment(false);
    setContactDraft({ name: '', phone: '' });
    setShowContactSheet(true);
  };

  const handleCreatePoll = () => {
    if (!onSendPoll) return;
    setShowAttachment(false);
    setPollDraft({ question: '', options: '' });
    setShowPollSheet(true);
  };

  const submitContactDraft = () => {
    const value = [contactDraft.name.trim(), contactDraft.phone.trim()].filter(Boolean).join(' | ');
    if (!value) return;
    onSendMessage?.(`Contact: ${value}`, null);
    setContactDraft({ name: '', phone: '' });
    setShowContactSheet(false);
  };

  const submitPollDraft = () => {
    const question = pollDraft.question.trim();
    const options = pollDraft.options
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);

    if (!question || options.length < 2) return;

    onSendPoll?.({ question, options });
    setPollDraft({ question: '', options: '' });
    setShowPollSheet(false);
  };

  return (
    <div style={styles.container}>
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*,video/*"
        capture="environment"
        style={styles.hiddenInput}
        onChange={handleUploadChange}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*,video/*"
        style={styles.hiddenInput}
        onChange={handleUploadChange}
      />
      <input
        ref={documentInputRef}
        type="file"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip"
        style={styles.hiddenInput}
        onChange={handleUploadChange}
      />

      <div style={styles.header}>
        <button style={styles.backBtn} onClick={onBack}>
          <Icons.Back />
          <span style={styles.backText}>Back</span>
        </button>
        <div style={styles.headerCenter} onClick={onOpenContactInfo}>
          <div style={styles.headerAvatar}>
            <span style={{ fontSize: 18 }}>{chat.avatar}</span>
          </div>
          <div style={styles.headerInfo}>
            <span style={styles.headerName}>{chat.name}</span>
            <span style={styles.headerStatus}>
              {typingLabel
                ? typingLabel
                : chat.online
                  ? 'online'
                  : chat.isGroup
                    ? `${chat.members?.length || 0} members`
                    : chat.lastSeen || 'tap here for info'}
            </span>
          </div>
        </div>
        <div style={styles.headerActions}>
          <button
            style={styles.headerBtn}
            onClick={() => onStartCall?.('video')}
            disabled={!onStartCall || Boolean(currentCall)}
          >
            <Icons.VideoCall />
          </button>
          <button
            style={styles.headerBtn}
            onClick={() => onStartCall?.('voice')}
            disabled={!onStartCall || Boolean(currentCall)}
          >
            <Icons.Phone />
          </button>
        </div>
      </div>

      <div style={styles.messagesContainer}>
        <div style={styles.encryptionNotice}>
          <Icons.Lock />
          <span style={styles.encryptionText}>
            Messages and calls are end-to-end encrypted. No one outside of this chat, not even WhatsApp, can read or
            listen to them. Tap to learn more.
          </span>
        </div>
        <div style={styles.dateSeparator}>
          <span style={styles.dateText}>TODAY</span>
        </div>
        {isLoading ? <div style={styles.loadingText}>Loading messages...</div> : null}
        {messages.map((message) => {
          const isMe = message.sender === 'me';

          return (
            <div
              key={message.id}
              style={{ ...styles.messageRow, justifyContent: isMe ? 'flex-end' : 'flex-start' }}
              onContextMenu={(event) => {
                event.preventDefault();
                setSelectedMessage(message);
              }}
            >
              <div
                style={{
                  ...styles.bubble,
                  background: isMe ? '#005C4B' : '#1F2C34',
                  borderRadius: isMe ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                  maxWidth: '78%',
                }}
              >
                {chat.isGroup && !isMe && message.senderName ? (
                  <span style={styles.senderName}>{message.senderName}</span>
                ) : null}
                {message.replyTo ? (
                  <div style={styles.replyBubble}>
                    <span style={styles.replyBubbleText}>{message.replyTo.text || message.replyTo.preview}</span>
                  </div>
                ) : null}
                {renderMessageBody(message)}
                <div style={styles.messageFooter}>
                  <span style={styles.messageTime}>{message.time}</span>
                  {isMe ? (
                    <span style={styles.messageStatus}>
                      {message.status === 'sent' ? (
                        <svg width="16" height="11" viewBox="0 0 16 11">
                          <path
                            d="M1 5.5 5.5 10 14.5 1"
                            stroke="#8e8e93"
                            strokeWidth="1.5"
                            fill="none"
                            strokeLinecap="round"
                          />
                        </svg>
                      ) : null}
                      {message.status === 'delivered' ? <Icons.DoubleCheck read={false} /> : null}
                      {message.status === 'read' ? <Icons.DoubleCheck read /> : null}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {replyingTo ? (
        <div style={styles.replyBar}>
          <div style={styles.replyContent}>
            <div style={styles.replyLine} />
            <div>
              <span style={styles.replyName}>{replyingTo.sender === 'me' ? 'You' : chat.name}</span>
              <span style={styles.replyTextPreview}>{replyingTo.text}</span>
            </div>
          </div>
          <button style={styles.replyClose} onClick={() => setReplyingTo(null)}>
            ✕
          </button>
        </div>
      ) : null}
      {editingMessage ? (
        <div style={styles.replyPreview}>
          <div style={styles.replyBarIndicator} />
          <div style={styles.replyContent}>
            <span style={styles.replyUser}>Editing Message</span>
            <span style={styles.replyText}>{editingMessage.text}</span>
          </div>
          <button
            style={styles.replyClose}
            onClick={() => {
              setEditingMessage(null);
              setInputText('');
            }}
          >
            ✕
          </button>
        </div>
      ) : null}

      <div style={styles.inputContainer}>
        <div style={styles.inputRow}>
          <button style={styles.inputBtn} onClick={() => setShowAttachment(!showAttachment)}>
            <Icons.Plus />
          </button>
          <div style={styles.inputWrapper}>
            <button style={styles.emojiBtn} onClick={() => onEmojiClick?.()}>
              <Icons.Emoji />
            </button>
            <input
              type="text"
              placeholder="Message"
              value={inputText}
              onChange={handleComposerChange}
              onBlur={() => onTypingStop?.()}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return;
                sendMessage();
              }}
              style={styles.input}
            />
            <button style={styles.cameraBtn} onClick={() => cameraInputRef.current?.click()}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#8e8e93">
                <path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z" />
                <path d="M9 2 7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z" />
              </svg>
            </button>
          </div>
          {inputText.trim() ? (
            <button style={styles.sendBtn} onClick={sendMessage}>
              <Icons.Send />
            </button>
          ) : (
            <button style={styles.micBtn} onClick={() => onMicClick?.()}>
              <Icons.Mic />
            </button>
          )}
        </div>
      </div>

      {showAttachment ? (
        <div style={styles.attachOverlay} onClick={() => setShowAttachment(false)}>
          <div style={styles.attachMenu} onClick={(event) => event.stopPropagation()}>
            <div style={styles.attachHandle} />
            <div style={styles.attachGrid}>
              {[
                { icon: '📄', label: 'Document', color: '#7B61FF', action: () => documentInputRef.current?.click() },
                { icon: '📷', label: 'Camera', color: '#FF2D55', action: () => cameraInputRef.current?.click() },
                { icon: '🖼️', label: 'Photos', color: '#AF52DE', action: () => galleryInputRef.current?.click() },
                { icon: '📍', label: 'Location', color: '#34C759', action: handleShareLocation },
                { icon: '👤', label: 'Contact', color: '#0A7CFF', action: handleShareContact },
                { icon: '📊', label: 'Poll', color: '#FF9500', action: handleCreatePoll },
              ].map((item) => (
                <div key={item.label} style={styles.attachItem} onClick={item.action}>
                  <div style={{ ...styles.attachIcon, background: item.color }}>
                    <span style={{ fontSize: 24 }}>{item.icon}</span>
                  </div>
                  <span style={styles.attachLabel}>{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {showContactSheet ? (
        <div style={styles.modalOverlay} onClick={() => setShowContactSheet(false)}>
          <div style={styles.modalCard} onClick={(event) => event.stopPropagation()}>
            <div style={styles.modalHeaderRow}>
              <span style={styles.modalTitle}>Share Contact</span>
              <button style={styles.modalClose} onClick={() => setShowContactSheet(false)}>
                Cancel
              </button>
            </div>
            <div style={styles.modalBody}>
              <input
                type="text"
                placeholder="Contact name"
                value={contactDraft.name}
                onChange={(event) =>
                  setContactDraft((previous) => ({ ...previous, name: event.target.value }))
                }
                style={styles.modalInput}
              />
              <input
                type="text"
                placeholder="Phone number"
                value={contactDraft.phone}
                onChange={(event) =>
                  setContactDraft((previous) => ({ ...previous, phone: event.target.value }))
                }
                style={styles.modalInput}
              />
            </div>
            <div style={styles.modalFooter}>
              <button style={styles.modalPrimaryBtn} onClick={submitContactDraft}>
                Share
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showPollSheet ? (
        <div style={styles.modalOverlay} onClick={() => setShowPollSheet(false)}>
          <div style={styles.modalCard} onClick={(event) => event.stopPropagation()}>
            <div style={styles.modalHeaderRow}>
              <span style={styles.modalTitle}>Create Poll</span>
              <button style={styles.modalClose} onClick={() => setShowPollSheet(false)}>
                Cancel
              </button>
            </div>
            <div style={styles.modalBody}>
              <input
                type="text"
                placeholder="Poll question"
                value={pollDraft.question}
                onChange={(event) =>
                  setPollDraft((previous) => ({ ...previous, question: event.target.value }))
                }
                style={styles.modalInput}
              />
              <textarea
                placeholder="Options, separated by commas"
                value={pollDraft.options}
                onChange={(event) =>
                  setPollDraft((previous) => ({ ...previous, options: event.target.value }))
                }
                rows={4}
                style={{ ...styles.modalInput, minHeight: 96, resize: 'vertical' }}
              />
            </div>
            <div style={styles.modalFooter}>
              <button style={styles.modalPrimaryBtn} onClick={submitPollDraft}>
                Send poll
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {selectedMessage ? (
        <div style={styles.contextOverlay} onClick={() => setSelectedMessage(null)}>
          <div style={styles.contextMenu} onClick={(event) => event.stopPropagation()}>
            <div style={styles.reactions}>
              {['❤️', '👍', '😂', '😮', '😢', '🙏', '+'].map((emoji) => (
                <button
                  key={emoji}
                  style={styles.reactionBtn}
                  onClick={() => {
                    onReactMessage?.(selectedMessage.rawId || selectedMessage.id, emoji);
                    setSelectedMessage(null);
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>
            <div style={styles.contextActions}>
              {[
                {
                  label: 'Reply',
                  emoji: '↩️',
                  action: () => {
                    setReplyingTo(selectedMessage);
                    setSelectedMessage(null);
                  },
                },
                {
                  label: 'Forward',
                  emoji: '↗️',
                  action: () => {
                    onForwardMessage?.(selectedMessage);
                    setSelectedMessage(null);
                  },
                },
                {
                  label: 'Copy',
                  emoji: '📋',
                  action: () => {
                    navigator.clipboard.writeText(selectedMessage.text).catch(() => {});
                    setSelectedMessage(null);
                  },
                },
                {
                  label: 'Star',
                  emoji: '⭐',
                  action: () => {
                    onStarMessage?.(selectedMessage.rawId || selectedMessage.id);
                    setSelectedMessage(null);
                  },
                },
                {
                  label: 'Pin',
                  emoji: '📌',
                  action: () => {
                    onPinMessage?.(selectedMessage.rawId || selectedMessage.id);
                    setSelectedMessage(null);
                  },
                },
                {
                  label: 'Edit',
                  emoji: '✏️',
                  action: () => {
                    if (selectedMessage.sender === 'me') {
                      setEditingMessage(selectedMessage);
                      setInputText(selectedMessage.text);
                      setReplyingTo(null);
                      setSelectedMessage(null);
                    }
                  },
                },
                {
                   label: 'Delete',
                   emoji: '🗑️',
                   danger: true,
                   action: () => {
                     onDeleteMessage?.(selectedMessage.rawId || selectedMessage.id);
                     setSelectedMessage(null);
                   }
                },
              ].map((action) => (
                <button
                  key={action.label}
                  style={styles.contextAction}
                  onClick={() => {
                    action.action?.();
                    setSelectedMessage(null);
                  }}
                >
                  <span style={{ color: action.danger ? '#FF3B30' : '#fff', fontSize: 16 }}>{action.label}</span>
                  <span style={{ fontSize: 18 }}>{action.emoji}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const styles = {
  container: { display: 'flex', flexDirection: 'column', height: '100%', background: '#0B141A', position: 'relative' },
  hiddenInput: { display: 'none' },
  header: {
    display: 'flex',
    alignItems: 'center',
    padding: '8px 8px',
    background: '#1F2C34',
    borderBottom: '0.5px solid rgba(255,255,255,0.08)',
    minHeight: 44,
    flexShrink: 0,
  },
  backBtn: { display: 'flex', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', gap: 2 },
  backText: { color: '#0A7CFF', fontSize: 17 },
  headerCenter: { flex: 1, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginLeft: 4 },
  headerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerInfo: { display: 'flex', flexDirection: 'column' },
  headerName: { color: '#fff', fontSize: 16, fontWeight: '600', lineHeight: '20px' },
  headerStatus: { color: '#8e8e93', fontSize: 12, lineHeight: '16px' },
  headerActions: { display: 'flex', gap: 12 },
  headerBtn: { background: 'none', border: 'none', cursor: 'pointer', padding: 4 },
  messagesContainer: { flex: 1, overflowY: 'auto', padding: '8px 10px', WebkitOverflowScrolling: 'touch' },
  loadingText: { color: '#8e8e93', fontSize: 13, textAlign: 'center', padding: '8px 0' },
  encryptionNotice: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: '12px 30px',
    marginBottom: 8,
    background: 'rgba(255,255,255,0.05)',
    borderRadius: 8,
  },
  encryptionText: { color: '#8e8e93', fontSize: 11, textAlign: 'center', lineHeight: '14px' },
  dateSeparator: { display: 'flex', justifyContent: 'center', margin: '8px 0 12px' },
  dateText: {
    background: 'rgba(255,255,255,0.08)',
    color: '#8e8e93',
    fontSize: 12,
    fontWeight: '600',
    padding: '4px 12px',
    borderRadius: 8,
    letterSpacing: 0.5,
  },
  messageRow: { display: 'flex', marginBottom: 3 },
  bubble: { padding: '6px 10px 4px', position: 'relative' },
  senderName: { color: '#34B7F1', fontSize: 13, fontWeight: '600', display: 'block', marginBottom: 2 },
  messageText: { color: '#fff', fontSize: 16, lineHeight: '21px', wordBreak: 'break-word' },
  messageFooter: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 2 },
  messageTime: { color: 'rgba(255,255,255,0.45)', fontSize: 11 },
  messageStatus: { display: 'flex', alignItems: 'center' },
  imagePlaceholder: {
    width: 200,
    height: 150,
    background: 'rgba(255,255,255,0.05)',
    borderRadius: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  mediaImage: { width: '100%', maxWidth: 220, borderRadius: 8, marginBottom: 4, objectFit: 'cover' },
  mediaVideo: { width: '100%', maxWidth: 220, borderRadius: 8, marginBottom: 4 },
  mediaAudio: { width: 220, maxWidth: '100%', marginBottom: 4 },
  pollCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    background: 'rgba(255,255,255,0.08)',
    borderRadius: 8,
    padding: '10px 12px',
    marginBottom: 4,
  },
  pollTitle: { color: '#fff', fontSize: 14, fontWeight: '600' },
  pollMeta: { color: 'rgba(255,255,255,0.55)', fontSize: 12 },
  documentCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    background: 'rgba(255,255,255,0.08)',
    borderRadius: 8,
    padding: '10px 12px',
    marginBottom: 4,
    textDecoration: 'none',
  },
  documentTitle: { color: '#fff', fontSize: 14, fontWeight: '600' },
  documentMeta: { color: 'rgba(255,255,255,0.55)', fontSize: 12 },
  replyBubble: { background: 'rgba(255,255,255,0.08)', borderLeft: '3px solid #0A7CFF', borderRadius: 4, padding: '6px 10px', marginBottom: 4 },
  replyBubbleText: { color: 'rgba(255,255,255,0.6)', fontSize: 13 },
  replyBar: {
    display: 'flex',
    alignItems: 'center',
    padding: '8px 16px',
    background: 'rgba(255,255,255,0.05)',
    borderTop: '0.5px solid rgba(255,255,255,0.1)',
    flexShrink: 0,
  },
  replyContent: { display: 'flex', flex: 1, gap: 8, alignItems: 'center' },
  replyLine: { width: 3, height: 30, background: '#0A7CFF', borderRadius: 2 },
  replyName: { color: '#0A7CFF', fontSize: 13, fontWeight: '600', display: 'block' },
  replyTextPreview: { color: '#8e8e93', fontSize: 14, display: 'block' },
  replyClose: { background: 'none', border: 'none', color: '#8e8e93', fontSize: 18, cursor: 'pointer', padding: '4px 8px' },
  inputContainer: {
    padding: '6px 8px',
    paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
    background: '#1F2C34',
    borderTop: '0.5px solid rgba(255,255,255,0.08)',
    flexShrink: 0,
  },
  inputRow: { display: 'flex', alignItems: 'flex-end', gap: 6 },
  inputBtn: { background: 'none', border: 'none', cursor: 'pointer', padding: '6px 2px', flexShrink: 0 },
  inputWrapper: { flex: 1, display: 'flex', alignItems: 'center', background: '#2A3942', borderRadius: 20, padding: '4px 8px', minHeight: 36 },
  emojiBtn: { background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', flexShrink: 0 },
  input: { flex: 1, background: 'none', border: 'none', outline: 'none', color: '#fff', fontSize: 16, padding: '4px 8px', lineHeight: '20px' },
  cameraBtn: { background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', flexShrink: 0 },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    background: '#0A7CFF',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  micBtn: { background: 'none', border: 'none', cursor: 'pointer', padding: '6px 2px', flexShrink: 0 },
  attachOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.4)',
    zIndex: 100,
    display: 'flex',
    alignItems: 'flex-end',
    animation: 'fadeIn 0.2s ease',
  },
  attachMenu: {
    width: '100%',
    background: '#2A2A2E',
    borderRadius: '16px 16px 0 0',
    padding: '12px 16px',
    paddingBottom: 'max(20px, env(safe-area-inset-bottom))',
    animation: 'slideUp 0.3s ease',
  },
  attachHandle: { width: 36, height: 5, background: 'rgba(255,255,255,0.3)', borderRadius: 3, margin: '0 auto 20px' },
  attachGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 },
  attachItem: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, cursor: 'pointer' },
  attachIcon: { width: 56, height: 56, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  attachLabel: { color: '#8e8e93', fontSize: 12, fontWeight: '500' },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.65)',
    backdropFilter: 'blur(8px)',
    zIndex: 110,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    background: '#1F2C34',
    borderRadius: 24,
    overflow: 'hidden',
    border: '1px solid rgba(255,255,255,0.08)',
    boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
  },
  modalHeaderRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 18px',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
  },
  modalTitle: { color: '#fff', fontSize: 17, fontWeight: '600' },
  modalClose: {
    background: 'none',
    border: 'none',
    color: '#0A7CFF',
    fontSize: 15,
    cursor: 'pointer',
  },
  modalBody: { display: 'grid', gap: 12, padding: 18 },
  modalInput: {
    width: '100%',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 16,
    color: '#fff',
    fontSize: 15,
    padding: '12px 14px',
    outline: 'none',
  },
  modalFooter: {
    display: 'flex',
    justifyContent: 'flex-end',
    padding: '0 18px 18px',
  },
  modalPrimaryBtn: {
    background: '#0A7CFF',
    border: 'none',
    color: '#fff',
    borderRadius: 999,
    padding: '10px 18px',
    fontSize: 14,
    fontWeight: '600',
    cursor: 'pointer',
  },
  contextOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.6)',
    backdropFilter: 'blur(10px)',
    zIndex: 100,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    animation: 'fadeIn 0.2s ease',
  },
  contextMenu: { width: '85%', animation: 'scaleIn 0.2s ease' },
  reactions: { display: 'flex', justifyContent: 'center', gap: 4, marginBottom: 8, background: '#2A2A2E', borderRadius: 30, padding: '8px 12px' },
  reactionBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    background: 'none',
    border: 'none',
    fontSize: 24,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  contextActions: { background: '#2A2A2E', borderRadius: 14, overflow: 'hidden' },
  contextAction: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    padding: '14px 16px',
    background: 'none',
    border: 'none',
    borderBottom: '0.5px solid rgba(255,255,255,0.08)',
    cursor: 'pointer',
  },
};
