const getStatusLabel = (callState, callType) => {
  if (callState === 'incoming') {
    return `${callType === 'video' ? 'Video' : 'Voice'} call incoming`;
  }
  if (callState === 'outgoing') return 'Calling...';
  if (callState === 'connecting') return 'Connecting...';
  if (callState === 'connected') return 'Connected';
  return '';
};

export default function CallOverlay({
  isOpen = false,
  callState = 'idle',
  callType = 'voice',
  partnerLabel = 'Unknown user',
  localVideoRef,
  remoteVideoRef,
  remoteAudioRef,
  onAccept,
  onDecline,
  onEnd,
}) {
  if (!isOpen) {
    return null;
  }

  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        <div style={styles.header}>
          <span style={styles.partnerName}>{partnerLabel}</span>
          <span style={styles.status}>{getStatusLabel(callState, callType)}</span>
        </div>

        {callType === 'video' ? (
          <div style={styles.videoStage}>
            <video ref={remoteVideoRef} autoPlay playsInline style={styles.remoteVideo} />
            <video ref={localVideoRef} autoPlay muted playsInline style={styles.localVideo} />
          </div>
        ) : (
          <div style={styles.voiceStage}>
            <div style={styles.voiceAvatar}>{partnerLabel.slice(0, 1).toUpperCase()}</div>
            <span style={styles.voiceHint}>Voice call active</span>
          </div>
        )}

        <div style={styles.actions}>
          {callState === 'incoming' ? (
            <>
              <button style={{ ...styles.actionBtn, ...styles.acceptBtn }} onClick={onAccept}>
                Accept
              </button>
              <button style={{ ...styles.actionBtn, ...styles.declineBtn }} onClick={onDecline}>
                Decline
              </button>
            </>
          ) : (
            <button style={{ ...styles.actionBtn, ...styles.endBtn }} onClick={onEnd}>
              End Call
            </button>
          )}
        </div>

        <audio ref={remoteAudioRef} autoPlay />
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 800,
    background: 'rgba(0,0,0,0.84)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 24,
    background: '#101316',
    border: '1px solid rgba(255,255,255,0.08)',
    overflow: 'hidden',
    boxShadow: '0 20px 60px rgba(0,0,0,0.45)',
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
    padding: '24px 20px 16px',
  },
  partnerName: { color: '#fff', fontSize: 24, fontWeight: '700' },
  status: { color: 'rgba(255,255,255,0.62)', fontSize: 14 },
  videoStage: {
    position: 'relative',
    aspectRatio: '9 / 16',
    background: '#000',
    overflow: 'hidden',
  },
  remoteVideo: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    background: '#000',
  },
  localVideo: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    width: 108,
    height: 160,
    objectFit: 'cover',
    borderRadius: 16,
    background: '#111',
    border: '1px solid rgba(255,255,255,0.2)',
  },
  voiceStage: {
    padding: '28px 20px 36px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 16,
  },
  voiceAvatar: {
    width: 110,
    height: 110,
    borderRadius: 55,
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontSize: 42,
    fontWeight: '700',
  },
  voiceHint: { color: 'rgba(255,255,255,0.68)', fontSize: 14 },
  actions: {
    display: 'flex',
    gap: 12,
    justifyContent: 'center',
    padding: '20px 20px 24px',
  },
  actionBtn: {
    minWidth: 132,
    borderRadius: 999,
    border: 'none',
    padding: '14px 20px',
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    cursor: 'pointer',
  },
  acceptBtn: { background: '#34C759' },
  declineBtn: { background: '#FF3B30' },
  endBtn: { background: '#FF3B30' },
};
