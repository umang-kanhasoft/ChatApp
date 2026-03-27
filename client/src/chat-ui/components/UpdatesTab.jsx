import { channels } from '../data/mockData.js';

export default function UpdatesTab({ currentUser, statuses = [], onViewStatus, onAddStatus }) {
  const unviewedStatuses = statuses.filter((status) => !status.viewed);
  const viewedStatuses = statuses.filter((status) => status.viewed);

  return (
    <div style={styles.container} data-testid="updates-tab">
      <div style={styles.header}>
        <div style={styles.headerTop}>
          <span style={styles.privacyBtn}>Privacy</span>
        </div>
        <h1 style={styles.title}>Updates</h1>
      </div>

      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <span style={styles.sectionTitle}>Status</span>
          <button style={styles.seeAllBtn}>See All</button>
        </div>
        <div style={styles.statusItem} data-testid="my-status-button" onClick={() => onAddStatus?.()}>
          <div style={styles.myStatusAvatar}>
            <span style={{ fontSize: 28 }}>{currentUser?.avatar || '😊'}</span>
            <div style={styles.addStatusBtn}>+</div>
          </div>
          <div style={styles.statusInfo}>
            <span style={styles.statusName}>My Status</span>
            <span style={styles.statusTime}>
              {unviewedStatuses.find((status) => status.isMine)?.time || 'Add to my status'}
            </span>
          </div>
        </div>

        {unviewedStatuses.length > 0 ? (
          <>
            <span style={styles.subLabel}>RECENT</span>
            {unviewedStatuses.map((status) => (
              <div
                key={status.id}
                style={styles.statusItem}
                data-testid={`status-item-${status.id}`}
                onClick={() => onViewStatus(status)}
              >
                <div style={styles.statusAvatar}>
                  <div style={styles.statusRing}>
                    <div style={styles.statusAvatarInner}>
                      <span style={{ fontSize: 22 }}>{status.contact.avatar}</span>
                    </div>
                  </div>
                </div>
                <div style={styles.statusInfo}>
                  <span style={styles.statusName}>{status.contact.name}</span>
                  <span style={styles.statusTime}>{status.time}</span>
                </div>
              </div>
            ))}
          </>
        ) : null}

        {viewedStatuses.length > 0 ? (
          <>
            <span style={styles.subLabel}>VIEWED</span>
            {viewedStatuses.map((status) => (
              <div
                key={status.id}
                style={styles.statusItem}
                data-testid={`status-item-${status.id}`}
                onClick={() => onViewStatus(status)}
              >
                <div style={styles.statusAvatar}>
                  <div style={{ ...styles.statusRing, border: '2px solid #8e8e93' }}>
                    <div style={styles.statusAvatarInner}>
                      <span style={{ fontSize: 22 }}>{status.contact.avatar}</span>
                    </div>
                  </div>
                </div>
                <div style={styles.statusInfo}>
                  <span style={{ ...styles.statusName, opacity: 0.7 }}>{status.contact.name}</span>
                  <span style={styles.statusTime}>{status.time}</span>
                </div>
              </div>
            ))}
          </>
        ) : null}
      </div>

      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <span style={styles.sectionTitle}>Channels</span>
          <button style={styles.seeAllBtn}>Explore</button>
        </div>
        {channels.map((channel) => (
          <div key={channel.id} style={styles.channelItem}>
            <div style={styles.channelAvatar}>
              <span style={{ fontSize: 24 }}>{channel.avatar}</span>
            </div>
            <div style={styles.channelInfo}>
              <div style={styles.channelTopRow}>
                <span style={styles.channelName}>{channel.name}</span>
                <span style={styles.channelFollowers}>{channel.followers}</span>
              </div>
              <span style={styles.channelUpdate}>{channel.lastUpdate}</span>
            </div>
          </div>
        ))}
        <button style={styles.findChannelsBtn}>Find Channels</button>
      </div>
    </div>
  );
}

const styles = {
  container: { background: '#000', minHeight: '100%', paddingBottom: 20 },
  header: { padding: '10px 16px 0' },
  headerTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  privacyBtn: { color: '#0A7CFF', fontSize: 17, background: 'none', border: 'none' },
  title: { color: '#fff', fontSize: 34, fontWeight: '700', letterSpacing: -0.5 },
  section: { padding: '16px 0' },
  sectionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 16px 8px' },
  sectionTitle: { color: '#fff', fontSize: 22, fontWeight: '700' },
  seeAllBtn: { color: '#0A7CFF', fontSize: 16, background: 'none', border: 'none', cursor: 'pointer' },
  subLabel: {
    color: '#8e8e93',
    fontSize: 13,
    fontWeight: '600',
    padding: '12px 16px 6px',
    display: 'block',
    letterSpacing: 0.5,
  },
  statusItem: { display: 'flex', alignItems: 'center', padding: '8px 16px', gap: 12, cursor: 'pointer' },
  myStatusAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    background: '#2c2c2e',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  addStatusBtn: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    background: '#0A7CFF',
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '2px solid #000',
  },
  statusAvatar: { width: 52, height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  statusRing: {
    width: 52,
    height: 52,
    borderRadius: 26,
    border: '2px solid #34C759',
    padding: 2,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusAvatarInner: {
    width: 44,
    height: 44,
    borderRadius: 22,
    background: '#2c2c2e',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusInfo: { flex: 1 },
  statusName: { color: '#fff', fontSize: 16, fontWeight: '500', display: 'block' },
  statusTime: { color: '#8e8e93', fontSize: 14, display: 'block', marginTop: 2 },
  channelItem: { display: 'flex', alignItems: 'center', padding: '8px 16px', gap: 12, cursor: 'pointer' },
  channelAvatar: { width: 52, height: 52, borderRadius: 26, background: '#2c2c2e', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  channelInfo: { flex: 1, borderBottom: '0.5px solid rgba(255,255,255,0.08)', paddingBottom: 8 },
  channelTopRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  channelName: { color: '#fff', fontSize: 16, fontWeight: '600' },
  channelFollowers: { color: '#8e8e93', fontSize: 13 },
  channelUpdate: { color: '#8e8e93', fontSize: 14, marginTop: 2, display: 'block' },
  findChannelsBtn: {
    display: 'block',
    margin: '16px auto',
    padding: '10px 24px',
    background: 'none',
    border: '1px solid #0A7CFF',
    borderRadius: 20,
    color: '#0A7CFF',
    fontSize: 16,
    fontWeight: '600',
    cursor: 'pointer',
  },
};
