export default function CommunitiesTab() {
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Communities</h1>
      </div>
      <div style={styles.newCommunity}>
        <div style={styles.newCommunityIcon}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="white">
            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
          </svg>
        </div>
        <div style={styles.newCommunityInfo}>
          <span style={styles.newCommunityTitle}>New Community</span>
          <span style={styles.newCommunitySubtitle}>Bring together a neighbourhood, a school, or more</span>
        </div>
      </div>
      <div style={styles.emptyState}>
        <div style={styles.emptyIcon}>
          <svg width="60" height="60" viewBox="0 0 24 24" fill="#2c2c2e">
            <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
          </svg>
        </div>
        <span style={styles.emptyTitle}>Stay connected with a community</span>
        <span style={styles.emptyText}>
          Communities bring members together in topic-based groups, and make it easy to get admin announcements. Any
          community you&apos;re added to will appear here.
        </span>
        <button style={styles.seeExampleBtn}>See example communities</button>
      </div>
    </div>
  );
}

const styles = {
  container: { background: '#000', minHeight: '100%', paddingBottom: 20 },
  header: { padding: '10px 16px 0' },
  title: { color: '#fff', fontSize: 34, fontWeight: '700', letterSpacing: -0.5 },
  newCommunity: {
    display: 'flex',
    alignItems: 'center',
    padding: 16,
    gap: 14,
    cursor: 'pointer',
    borderBottom: '0.5px solid rgba(255,255,255,0.08)',
  },
  newCommunityIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    background: '#34C759',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  newCommunityInfo: { flex: 1 },
  newCommunityTitle: { color: '#fff', fontSize: 17, fontWeight: '600', display: 'block' },
  newCommunitySubtitle: { color: '#8e8e93', fontSize: 14, display: 'block', marginTop: 2 },
  emptyState: { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 32px', textAlign: 'center' },
  emptyIcon: { width: 80, height: 80, borderRadius: 40, background: '#1c1c1e', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  emptyTitle: { color: '#fff', fontSize: 20, fontWeight: '600', marginBottom: 10 },
  emptyText: { color: '#8e8e93', fontSize: 15, lineHeight: '22px', marginBottom: 20 },
  seeExampleBtn: { color: '#0A7CFF', fontSize: 16, fontWeight: '500', background: 'none', border: 'none', cursor: 'pointer' },
};
