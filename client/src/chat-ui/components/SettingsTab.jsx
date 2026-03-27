export default function SettingsTab({ currentUser, versionLabel = 'WhatsApp Clone v2.25.3' }) {
  const settingsSections = [
    {
      items: [
        { icon: '⭐', label: 'Starred Messages', color: '#FF9500' },
        { icon: '💻', label: 'Linked Devices', color: '#34C759' },
      ],
    },
    {
      items: [
        { icon: '🔑', label: 'Account', color: '#0A7CFF' },
        { icon: '🔒', label: 'Privacy', color: '#34C759' },
        { icon: '💬', label: 'Chats', color: '#34C759' },
        { icon: '🔔', label: 'Notifications', color: '#FF3B30' },
        { icon: '💾', label: 'Storage and Data', color: '#34C759' },
      ],
    },
    {
      items: [
        { icon: '❓', label: 'Help', color: '#0A7CFF' },
        { icon: '📢', label: 'Tell a Friend', color: '#FF2D55' },
      ],
    },
  ];

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Settings</h1>
      </div>
      <div className="search-bar">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="#8e8e93">
          <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z" />
        </svg>
        <input type="text" placeholder="Search" />
      </div>
      <div style={styles.profileCard}>
        <div style={styles.profileAvatar}>
          <span style={{ fontSize: 34 }}>{currentUser?.avatar || '😊'}</span>
        </div>
        <div style={styles.profileInfo}>
          <span style={styles.profileName}>{currentUser?.name || 'Your Name'}</span>
          <span style={styles.profileStatus}>{currentUser?.about || 'Hey there! I am using WhatsApp.'}</span>
        </div>
        <div style={styles.profileQr}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="#0A7CFF">
            <path d="M3 11h8V3H3v8zm2-6h4v4H5V5zm8-2v8h8V3h-8zm6 6h-4V5h4v4zM3 21h8v-8H3v8zm2-6h4v4H5v-4zm13-2h-2v4h2v2h-4v-2h-2v4h2v-2h4v2h2v-4h-2v-4zm0 0h2v2h-2v-2z" />
          </svg>
        </div>
      </div>
      {settingsSections.map((section, sectionIndex) => (
        <div key={sectionIndex} style={styles.section}>
          {section.items.map((item) => (
            <div key={item.label} style={styles.settingsItem}>
              <div style={{ ...styles.settingsIcon, background: item.color }}>
                <span style={{ fontSize: 16 }}>{item.icon}</span>
              </div>
              <div style={styles.settingsInfo}>
                <span style={styles.settingsLabel}>{item.label}</span>
                <svg width="8" height="14" viewBox="0 0 8 14" fill="#8e8e93">
                  <path d="m1 1 6 6-6 6" stroke="#8e8e93" strokeWidth="2" strokeLinecap="round" fill="none" />
                </svg>
              </div>
            </div>
          ))}
        </div>
      ))}
      <div style={styles.version}>
        <span style={styles.versionText}>{versionLabel}</span>
      </div>
    </div>
  );
}

const styles = {
  container: { background: '#000', minHeight: '100%', paddingBottom: 20 },
  header: { padding: '10px 16px 0' },
  title: { color: '#fff', fontSize: 34, fontWeight: '700', letterSpacing: -0.5 },
  profileCard: {
    display: 'flex',
    alignItems: 'center',
    padding: '12px 16px',
    gap: 14,
    cursor: 'pointer',
    borderBottom: '0.5px solid rgba(255,255,255,0.08)',
  },
  profileAvatar: { width: 64, height: 64, borderRadius: 32, background: '#2c2c2e', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  profileInfo: { flex: 1 },
  profileName: { color: '#fff', fontSize: 22, fontWeight: '600', display: 'block' },
  profileStatus: { color: '#8e8e93', fontSize: 14, display: 'block', marginTop: 2 },
  profileQr: { padding: 8 },
  section: { marginTop: 24, background: '#1c1c1e', borderRadius: 12, margin: '24px 16px 0', overflow: 'hidden' },
  settingsItem: { display: 'flex', alignItems: 'center', padding: '11px 16px', gap: 14, cursor: 'pointer' },
  settingsIcon: { width: 30, height: 30, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  settingsInfo: {
    flex: 1,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '0.5px solid rgba(255,255,255,0.08)',
    paddingBottom: 11,
  },
  settingsLabel: { color: '#fff', fontSize: 16 },
  version: { textAlign: 'center', padding: '24px 16px' },
  versionText: { color: '#8e8e93', fontSize: 13 },
};
