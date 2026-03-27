import { Icons } from '../assets/icons.jsx';

export default function ContactInfo({ chat, onBack, onStartCall }) {
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <button style={styles.backBtn} onClick={onBack}>
          <Icons.Back />
          <span style={styles.backText}>Back</span>
        </button>
        <span style={styles.editBtn}>Edit</span>
      </div>
      <div style={styles.scrollContent}>
        <div style={styles.profileSection}>
          <div style={styles.profileAvatar}>
            <span style={{ fontSize: 56 }}>{chat.avatar}</span>
          </div>
          <h2 style={styles.profileName}>{chat.name}</h2>
          <span style={styles.profilePhone}>{chat.phone || (chat.isGroup ? `Group · ${chat.members?.length} members` : '')}</span>
          <div style={styles.actionRow}>
            {[
              { icon: '📞', label: 'audio', action: () => onStartCall?.('voice') },
              { icon: '📹', label: 'video', action: () => onStartCall?.('video') },
              { icon: '🔍', label: 'search' },
              { icon: '🔇', label: 'mute' },
            ].map((action) => (
              <div key={action.label} style={styles.actionBtn} onClick={action.action}>
                <div style={styles.actionIcon}>
                  <span style={{ fontSize: 20 }}>{action.icon}</span>
                </div>
                <span style={styles.actionLabel}>{action.label}</span>
              </div>
            ))}
          </div>
        </div>
        {!chat.isGroup ? (
          <div style={styles.section}>
            <span style={styles.sectionLabel}>About</span>
            <span style={styles.aboutText}>{chat.about}</span>
          </div>
        ) : null}
        <div style={styles.section}>
          <div style={styles.sectionHeaderRow}>
            <span style={styles.sectionLabel}>Media, Links, and Docs</span>
            <div style={styles.mediaCount}>
              <span style={styles.mediaCountText}>47</span>
              <Icons.ChevronRight />
            </div>
          </div>
          <div style={styles.mediaGrid}>
            {['🖼️', '📷', '🎬', '📸'].map((media) => (
              <div key={media} style={styles.mediaItem}>
                <span style={{ fontSize: 28 }}>{media}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={styles.section}>
          <div style={styles.settingRow}>
            <span style={styles.settingLabel}>Notifications</span>
            <Icons.ChevronRight />
          </div>
        </div>
        <div style={styles.section}>
          <div style={styles.settingRow}>
            <span style={styles.settingLabel}>Starred Messages</span>
            <div style={styles.settingRight}>
              <span style={styles.settingCount}>3</span>
              <Icons.ChevronRight />
            </div>
          </div>
        </div>
        <div style={styles.section}>
          <div style={styles.encryptionRow}>
            <Icons.Lock />
            <div style={styles.encryptionInfo}>
              <span style={styles.settingLabel}>Encryption</span>
              <span style={styles.encryptionText}>Messages and calls are end-to-end encrypted. Tap to verify.</span>
            </div>
          </div>
        </div>
        <div style={styles.dangerSection}>
          <button style={styles.dangerBtn}>
            <span style={{ color: '#FF3B30', fontSize: 16 }}>Block {chat.name}</span>
          </button>
          <button style={styles.dangerBtn}>
            <span style={{ color: '#FF3B30', fontSize: 16 }}>Report {chat.name}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: { display: 'flex', flexDirection: 'column', height: '100%', background: '#000' },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 16px',
    borderBottom: '0.5px solid rgba(255,255,255,0.08)',
    flexShrink: 0,
  },
  backBtn: { display: 'flex', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', gap: 2 },
  backText: { color: '#0A7CFF', fontSize: 17 },
  editBtn: { color: '#0A7CFF', fontSize: 17, cursor: 'pointer' },
  scrollContent: { flex: 1, overflowY: 'auto', paddingBottom: 40, WebkitOverflowScrolling: 'touch' },
  profileSection: { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 16px' },
  profileAvatar: { width: 100, height: 100, borderRadius: 50, background: '#2c2c2e', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  profileName: { color: '#fff', fontSize: 24, fontWeight: '600', marginBottom: 4 },
  profilePhone: { color: '#8e8e93', fontSize: 16, marginBottom: 16 },
  actionRow: { display: 'flex', gap: 20, marginTop: 8 },
  actionBtn: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'pointer' },
  actionIcon: { width: 44, height: 44, borderRadius: 10, background: '#1c1c1e', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  actionLabel: { color: '#0A7CFF', fontSize: 12, fontWeight: '500' },
  section: { padding: '12px 16px', borderTop: '6px solid #1c1c1e' },
  sectionLabel: { color: '#8e8e93', fontSize: 14, display: 'block', marginBottom: 6 },
  aboutText: { color: '#fff', fontSize: 16 },
  sectionHeaderRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  mediaCount: { display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' },
  mediaCountText: { color: '#8e8e93', fontSize: 15 },
  mediaGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 },
  mediaItem: { aspectRatio: '1', background: '#1c1c1e', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  settingRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', cursor: 'pointer' },
  settingLabel: { color: '#fff', fontSize: 16 },
  settingRight: { display: 'flex', alignItems: 'center', gap: 6 },
  settingCount: { color: '#8e8e93', fontSize: 15 },
  encryptionRow: { display: 'flex', alignItems: 'flex-start', gap: 12, padding: '4px 0', cursor: 'pointer' },
  encryptionInfo: { flex: 1 },
  encryptionText: { color: '#8e8e93', fontSize: 14, display: 'block', marginTop: 2 },
  dangerSection: { padding: '8px 0', marginTop: 16 },
  dangerBtn: {
    display: 'block',
    width: '100%',
    padding: '14px 16px',
    background: 'none',
    border: 'none',
    borderTop: '0.5px solid rgba(255,255,255,0.08)',
    cursor: 'pointer',
    textAlign: 'left',
  },
};
