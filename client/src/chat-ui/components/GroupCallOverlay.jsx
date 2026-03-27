const getGroupStatusLabel = ({ callState, participantCount, callType }) => {
  if (callState === 'joining') {
    return `Joining ${callType === 'video' ? 'video' : 'voice'} call...`;
  }

  if (participantCount <= 1) {
    return 'Waiting for others to join';
  }

  return `${participantCount} participants`;
};

export default function GroupCallOverlay({
  isOpen = false,
  title = 'Group call',
  callType = 'voice',
  callState = 'idle',
  participantCount = 0,
  localVideoRef,
  localAudioEnabled = true,
  localVideoEnabled = true,
  remoteParticipants = [],
  onToggleAudio,
  onToggleVideo,
  onLeave,
  onEnd,
  canEnd = false,
}) {
  if (!isOpen) return null;

  return (
    <div style={styles.overlay} data-testid="group-call-overlay">
      <div style={styles.card}>
        <div style={styles.header}>
          <span style={styles.title}>{title}</span>
          <span style={styles.status}>{getGroupStatusLabel({ callState, participantCount, callType })}</span>
        </div>

        {callType === 'video' ? (
          <div style={styles.videoLayout}>
            <div style={styles.localPanel}>
              <video ref={localVideoRef} autoPlay muted playsInline style={styles.localVideo} />
              {!localVideoEnabled ? <div style={styles.videoFallback}>Camera Off</div> : null}
            </div>
            <div style={styles.remoteGrid}>
              {remoteParticipants.map((participant) => (
                <div key={participant.id} style={styles.remoteCard}>
                  <video ref={participant.videoRef} autoPlay playsInline style={styles.remoteVideo} />
                  {!participant.videoEnabled ? (
                    <div style={styles.videoFallback}>{participant.label.slice(0, 2).toUpperCase()}</div>
                  ) : null}
                  <div style={styles.remoteFooter}>
                    <span style={styles.remoteLabel}>{participant.label}</span>
                    {!participant.audioEnabled ? <span style={styles.remoteMuted}>Muted</span> : null}
                  </div>
                  <audio ref={participant.audioRef} autoPlay />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={styles.voiceStage}>
            <div style={styles.voiceCircle}>{title.slice(0, 1).toUpperCase()}</div>
            <div style={styles.voiceParticipants}>
              {remoteParticipants.map((participant) => (
                <div key={participant.id} style={styles.voiceParticipant}>
                  <span style={styles.voiceParticipantLabel}>{participant.label}</span>
                  {!participant.audioEnabled ? <span style={styles.remoteMuted}>Muted</span> : null}
                  <audio ref={participant.audioRef} autoPlay />
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={styles.controls}>
          <button style={styles.secondaryBtn} data-testid="group-call-audio-toggle" onClick={onToggleAudio}>
            {localAudioEnabled ? 'Mute Mic' : 'Unmute Mic'}
          </button>
          {callType === 'video' ? (
            <button style={styles.secondaryBtn} data-testid="group-call-video-toggle" onClick={onToggleVideo}>
              {localVideoEnabled ? 'Stop Camera' : 'Start Camera'}
            </button>
          ) : null}
          <button style={styles.leaveBtn} data-testid="group-call-leave-button" onClick={onLeave}>
            Leave
          </button>
          {canEnd ? (
            <button style={styles.endBtn} data-testid="group-call-end-button" onClick={onEnd}>
              End for All
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 810,
    background: 'rgba(0,0,0,0.88)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  card: {
    width: '100%',
    maxWidth: 460,
    maxHeight: '100%',
    borderRadius: 24,
    background: '#101316',
    border: '1px solid rgba(255,255,255,0.08)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 20px 60px rgba(0,0,0,0.45)',
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
    padding: '24px 20px 16px',
  },
  title: { color: '#fff', fontSize: 22, fontWeight: '700' },
  status: { color: 'rgba(255,255,255,0.62)', fontSize: 14 },
  videoLayout: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    padding: '0 16px 16px',
    overflowY: 'auto',
  },
  localPanel: {
    position: 'relative',
    width: '100%',
    aspectRatio: '16 / 9',
    background: '#000',
    borderRadius: 18,
    overflow: 'hidden',
  },
  localVideo: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    background: '#000',
  },
  remoteGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: 12,
  },
  remoteCard: {
    position: 'relative',
    aspectRatio: '4 / 5',
    borderRadius: 16,
    overflow: 'hidden',
    background: '#000',
  },
  remoteVideo: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    background: '#000',
  },
  videoFallback: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
  },
  remoteFooter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 12px',
    background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.72) 100%)',
  },
  remoteLabel: { color: '#fff', fontSize: 13, fontWeight: '600' },
  remoteMuted: { color: 'rgba(255,255,255,0.7)', fontSize: 11 },
  voiceStage: {
    padding: '8px 20px 20px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 18,
  },
  voiceCircle: {
    width: 110,
    height: 110,
    borderRadius: 55,
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontSize: 38,
    fontWeight: '700',
  },
  voiceParticipants: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  voiceParticipant: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 14,
    background: 'rgba(255,255,255,0.06)',
    padding: '12px 14px',
  },
  voiceParticipantLabel: { color: '#fff', fontSize: 14, fontWeight: '600' },
  controls: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
    padding: '8px 16px 20px',
  },
  secondaryBtn: {
    borderRadius: 999,
    border: '1px solid rgba(255,255,255,0.14)',
    background: '#1d2328',
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    padding: '12px 16px',
    cursor: 'pointer',
  },
  leaveBtn: {
    borderRadius: 999,
    border: 'none',
    background: '#FF9500',
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    padding: '12px 18px',
    cursor: 'pointer',
  },
  endBtn: {
    borderRadius: 999,
    border: 'none',
    background: '#FF3B30',
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    padding: '12px 18px',
    cursor: 'pointer',
  },
};
