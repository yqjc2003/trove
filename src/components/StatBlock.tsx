export function StatBlock({
  value,
  label,
  alert = false,
}: {
  value: number | string;
  label: string;
  alert?: boolean;
}) {
  return (
    <div className={alert ? 'stat stat-alert' : 'stat'}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

export function EmptyState({
  title,
  text,
  action,
}: {
  title: string;
  text?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <p className="empty-title">{title}</p>
      {text ? <p className="empty-text">{text}</p> : null}
      {action ? <div style={{ marginTop: 16 }}>{action}</div> : null}
    </div>
  );
}
