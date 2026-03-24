type SideNavProps = {
  appId: string;
  clientId: string;
  user: unknown;
  onAppIdChange: (value: string) => void;
  onClientIdChange: (value: string) => void;
  onApply: () => void;
};

export function SideNav({
  appId,
  clientId,
  user,
  onAppIdChange,
  onClientIdChange,
  onApply,
}: SideNavProps) {
  return (
    <aside
      style={{
        width: 260,
        borderRight: '1px solid #e0e0e0',
        padding: 20,
        boxSizing: 'border-box',
        background: '#fafafa',
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
      }}
    >
      <div>
        <h3 style={{ margin: '0 0 12px' }}>Privy Config</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ fontSize: 13 }}>App ID</label>
          <input
            value={appId}
            onChange={(e) => onAppIdChange(e.target.value)}
            placeholder="app-xxxxxxxx"
            style={{ fontSize: 13, padding: '4px 6px' }}
          />
          <label style={{ fontSize: 13 }}>Client ID</label>
          <input
            value={clientId}
            onChange={(e) => onClientIdChange(e.target.value)}
            placeholder="client-xxxxxxxx"
            style={{ fontSize: 13, padding: '4px 6px' }}
          />
          <button
            onClick={onApply}
            disabled={!appId.trim() || !clientId.trim()}
            style={{ marginTop: 4 }}
          >
            Apply
          </button>
        </div>
      </div>

      {user !== null && user !== undefined && (
        <div>
          <h3 style={{ margin: '0 0 12px' }}>User Account</h3>
          <pre
            style={{
              fontSize: 11,
              background: '#f0f0f0',
              padding: 8,
              borderRadius: 4,
              overflowX: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              margin: 0,
            }}
          >
            {JSON.stringify(user, null, 2)}
          </pre>
        </div>
      )}
    </aside>
  );
}
