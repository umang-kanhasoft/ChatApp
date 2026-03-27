import { Icons } from '../assets/icons.jsx';

const tabs = [
  { id: 'updates', label: 'Updates', Icon: Icons.Updates },
  { id: 'calls', label: 'Calls', Icon: Icons.Calls },
  { id: 'communities', label: 'Communities', Icon: Icons.Communities },
  { id: 'chats', label: 'Chats', Icon: Icons.Chats, badge: 19 },
  { id: 'settings', label: 'Settings', Icon: Icons.Settings },
];

export default function TabBar({ activeTab, onTabChange, chatsBadge = 0 }) {
  return (
    <div style={styles.container}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        const badgeValue = tab.id === 'chats' ? chatsBadge : tab.badge;

        return (
          <button key={tab.id} onClick={() => onTabChange(tab.id)} style={styles.tab}>
            <div style={styles.iconContainer}>
              <tab.Icon active={isActive} />
              {badgeValue ? (
                <div style={styles.badge}>
                  <span style={styles.badgeText}>{badgeValue > 99 ? '99+' : badgeValue}</span>
                </div>
              ) : null}
            </div>
            <span
              style={{
                ...styles.label,
                color: isActive ? '#0A7CFF' : '#8e8e93',
              }}
            >
              {tab.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    justifyContent: 'space-around',
    alignItems: 'center',
    minHeight: 50,
    paddingTop: 6,
    paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
    background: 'rgba(30,30,30,0.97)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    borderTop: '0.5px solid rgba(255,255,255,0.15)',
    flexShrink: 0,
  },
  tab: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '0 12px',
    gap: 2,
  },
  iconContainer: {
    position: 'relative',
    width: 30,
    height: 28,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -10,
    background: '#FF3B30',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 5px',
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  label: {
    fontSize: 10,
    fontWeight: '500',
    marginTop: 1,
  },
};
