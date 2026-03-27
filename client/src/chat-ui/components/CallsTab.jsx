import { useMemo, useState } from 'react';

export default function CallsTab({ callHistory = [], onOpenChat, onStartCall }) {
  const [editMode, setEditMode] = useState(false);
  const [filter, setFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = useMemo(
    () =>
      (filter === 'Missed' ? callHistory.filter((call) => call.missed) : callHistory).filter((call) =>
        call.contact.name.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
    [callHistory, filter, searchQuery],
  );

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.headerTop}>
          <button style={styles.editBtn} onClick={() => setEditMode(!editMode)}>
            {editMode ? 'Done' : 'Edit'}
          </button>
          <button style={styles.newCallBtn}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="#0A7CFF">
              <path d="M20 15.5c-1.25 0-2.45-.2-3.57-.57-.35-.12-.74-.03-1.02.24l-2.2 2.2c-2.83-1.44-5.15-3.75-6.59-6.59l2.2-2.2c.28-.28.36-.67.25-1.02C8.7 6.45 8.5 5.25 8.5 4c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1 0 9.39 7.61 17 17 17 .55 0 1-.45 1-1v-3.5c0-.55-.45-1-1-1z" />
              <path d="M15 2v3h3.17L13 10.17l1.41 1.41L19.59 6.41V9.5h2V2z" fill="#0A7CFF" />
            </svg>
          </button>
        </div>
        <h1 style={styles.title}>Calls</h1>
      </div>

      <div className="search-bar">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="#8e8e93">
          <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z" />
        </svg>
        <input
          type="text"
          placeholder="Search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
        />
      </div>

      <div className="filter-pills">
        {['All', 'Missed'].map((item) => (
          <button
            key={item}
            className={`filter-pill ${filter === item ? 'active' : ''}`}
            onClick={() => setFilter(item)}
          >
            {item}
          </button>
        ))}
      </div>

      <div style={styles.createLink}>
        <div style={styles.linkIcon}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
            <path d="M3.9 12C3.9 10.29 5.29 8.9 7 8.9h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z" />
          </svg>
        </div>
        <div style={styles.linkInfo}>
          <span style={styles.linkTitle}>Create Call Link</span>
          <span style={styles.linkSubtitle}>Share a link for your WhatsApp call</span>
        </div>
      </div>

      <span style={styles.recentLabel}>RECENT</span>
      {filtered.map((call) => (
        <div key={call.id} style={styles.callItem} onClick={() => onOpenChat?.(call)}>
          {editMode ? (
            <div style={styles.deleteBtn}>
              <div style={styles.deleteBtnInner}>−</div>
            </div>
          ) : null}
          <div style={styles.callAvatar}>
            <span style={{ fontSize: 24 }}>{call.contact.avatar}</span>
          </div>
          <div style={styles.callInfo}>
            <span style={{ ...styles.callName, color: call.missed ? '#FF3B30' : '#fff' }}>{call.contact.name}</span>
            <div style={styles.callDetail}>
              <span style={{ color: call.missed ? '#FF3B30' : '#8e8e93', fontSize: 13, marginRight: 4 }}>
                {call.type === 'outgoing' ? '↗' : '↙'}
              </span>
              <span style={styles.callTime}>{call.time}</span>
            </div>
          </div>
          <button
            style={styles.callTypeBtn}
            onClick={(event) => {
              event.stopPropagation();
              onStartCall?.(call.callType, call);
            }}
          >
            {call.callType === 'video' ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="#0A7CFF">
                <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
              </svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="#0A7CFF">
                <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
              </svg>
            )}
          </button>
        </div>
      ))}
    </div>
  );
}

const styles = {
  container: { background: '#000', minHeight: '100%', paddingBottom: 20 },
  header: { padding: '10px 16px 0' },
  headerTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  editBtn: { background: 'none', border: 'none', color: '#0A7CFF', fontSize: 17, cursor: 'pointer' },
  newCallBtn: { background: 'none', border: 'none', cursor: 'pointer' },
  title: { color: '#fff', fontSize: 34, fontWeight: '700', letterSpacing: -0.5 },
  createLink: { display: 'flex', alignItems: 'center', padding: '12px 16px', gap: 14, cursor: 'pointer' },
  linkIcon: { width: 44, height: 44, borderRadius: 22, background: '#0A7CFF', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  linkInfo: { flex: 1 },
  linkTitle: { color: '#0A7CFF', fontSize: 16, fontWeight: '600', display: 'block' },
  linkSubtitle: { color: '#8e8e93', fontSize: 13, display: 'block', marginTop: 2 },
  recentLabel: {
    color: '#8e8e93',
    fontSize: 13,
    fontWeight: '600',
    padding: '16px 16px 8px',
    display: 'block',
    letterSpacing: 0.5,
  },
  callItem: { display: 'flex', alignItems: 'center', padding: '8px 16px', gap: 12, cursor: 'pointer' },
  deleteBtn: { marginRight: 4 },
  deleteBtnInner: {
    width: 22,
    height: 22,
    borderRadius: 11,
    background: '#FF3B30',
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  callAvatar: { width: 44, height: 44, borderRadius: 22, background: '#2c2c2e', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  callInfo: { flex: 1, borderBottom: '0.5px solid rgba(255,255,255,0.08)', paddingBottom: 8 },
  callName: { fontSize: 16, fontWeight: '500', display: 'block' },
  callDetail: { display: 'flex', alignItems: 'center', marginTop: 2 },
  callTime: { color: '#8e8e93', fontSize: 13 },
  callTypeBtn: { background: 'none', border: 'none', cursor: 'pointer', padding: 4 },
};
