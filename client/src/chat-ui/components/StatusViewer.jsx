import { useEffect, useState } from 'react';

export default function StatusViewer({ status, onClose, onReply }) {
  const [progress, setProgress] = useState(0);
  const [replyText, setReplyText] = useState('');

  useEffect(() => {
    const timer = setInterval(() => {
      setProgress((previous) => {
        if (previous >= 100) {
          clearInterval(timer);
          setTimeout(onClose, 200);
          return 100;
        }

        return previous + 0.5;
      });
    }, 25);

    return () => clearInterval(timer);
  }, [onClose]);

  return (
    <div style={styles.container} data-testid="status-viewer" onClick={onClose}>
      <div style={styles.viewerContent} onClick={(event) => event.stopPropagation()}>
      <div style={styles.progressContainer}>
        <div style={styles.progressTrack}>
          <div style={{ ...styles.progressFill, width: `${progress}%` }} />
        </div>
      </div>
      <div style={styles.header}>
        <div style={styles.avatar}>
          <span style={{ fontSize: 20 }}>{status.contact.avatar}</span>
        </div>
        <div style={styles.info}>
          <span style={styles.name}>{status.contact.name}</span>
          <span style={styles.time}>{status.time}</span>
        </div>
        <button style={styles.closeBtn} data-testid="status-close-button" onClick={onClose}>
          ✕
        </button>
      </div>
      <div style={styles.content}>
        {status.mediaUrl ? (
          status.mediaType === 'video' ? (
            <video style={styles.statusMedia} src={status.mediaUrl} autoPlay controls playsInline />
          ) : (
            <img style={styles.statusMedia} src={status.mediaUrl} alt={status.text || status.contact.name} />
          )
        ) : (
          <div style={styles.statusEmoji}>
            <span style={{ fontSize: 80 }}>{status.image}</span>
          </div>
        )}
        {status.text ? <span style={styles.statusText}>{status.text}</span> : null}
      </div>
      <div style={styles.replyBar}>
        <div style={styles.replyInput}>
          <input
            type="text"
            placeholder="Reply"
            style={styles.replyField}
            data-testid="status-reply-input"
            value={replyText}
            onChange={(event) => setReplyText(event.target.value)}
          />
        </div>
        <button
          style={styles.sendIcon}
          data-testid="status-reply-send"
          onClick={(event) => {
            event.stopPropagation();
            if (!replyText.trim()) return;
            onReply?.(status, replyText.trim());
            setReplyText('');
            onClose?.();
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
            <path d="M2.01 3 2 8.99l13 1.01-13 1.01L2.01 17 20 10z" />
          </svg>
        </button>
      </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: '#000',
    zIndex: 500,
    display: 'flex',
    flexDirection: 'column',
    animation: 'fadeIn 0.3s ease',
  },
  viewerContent: {
    display: 'flex',
    flex: 1,
    flexDirection: 'column',
  },
  progressContainer: { padding: '12px 8px 0', paddingTop: 'max(12px, env(safe-area-inset-top))' },
  progressTrack: { height: 2, background: 'rgba(255,255,255,0.3)', borderRadius: 1, overflow: 'hidden' },
  progressFill: { height: '100%', background: '#fff', borderRadius: 1, transition: 'width 0.1s linear' },
  header: { display: 'flex', alignItems: 'center', padding: '10px 12px', gap: 10 },
  avatar: { width: 36, height: 36, borderRadius: 18, background: '#2c2c2e', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1 },
  name: { color: '#fff', fontSize: 16, fontWeight: '600', display: 'block' },
  time: { color: 'rgba(255,255,255,0.6)', fontSize: 13, display: 'block' },
  closeBtn: { background: 'none', border: 'none', color: '#fff', fontSize: 20, cursor: 'pointer', padding: 8 },
  content: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20 },
  statusEmoji: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
  statusMedia: { maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain' },
  statusText: { color: '#fff', fontSize: 24, fontWeight: '600', textAlign: 'center', padding: '0 32px' },
  replyBar: { display: 'flex', alignItems: 'center', padding: '8px 12px', paddingBottom: 'max(12px, env(safe-area-inset-bottom))', gap: 10 },
  replyInput: { flex: 1, background: 'rgba(255,255,255,0.15)', borderRadius: 20, padding: '8px 16px' },
  replyField: { background: 'none', border: 'none', outline: 'none', color: '#fff', fontSize: 16, width: '100%' },
  sendIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    background: '#0A7CFF',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
};
