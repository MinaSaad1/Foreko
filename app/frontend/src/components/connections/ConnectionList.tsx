import { useEffect, useState } from"react";
import { api } from"@/api/endpoints";
import { friendlyError } from"@/utils/toast";
import { DIALECT_LABEL, type Connection } from"@/types/connection";

interface ConnectionListProps {
  onSelect: (connection: Connection) => void;
  refreshToken?: number;
}

export function ConnectionList({ onSelect, refreshToken = 0 }: ConnectionListProps) {
  const [connections, setConnections] = useState<Connection[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    api
      .listConnections()
      .then((rows) => {
        if (!cancelled) setConnections(rows);
      })
      .catch((err) => {
        if (!cancelled) setError(friendlyError(err));
      });
    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  const remove = async (id: string) => {
    setDeletingId(id);
    try {
      await api.deleteConnection(id);
      setConnections((prev) => (prev ?? []).filter((c) => c.id !== id));
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setDeletingId(null);
    }
  };

  if (error) {
    return (
      <p className="border border-anomaly/30 bg-anomaly/10 px-3 py-2 text-sm text-anomaly">
        {error}
      </p>
    );
  }

  if (connections === null) {
    return <p className="text-sm text-text-muted">Loading connections...</p>;
  }

  if (connections.length === 0) {
    return (
      <p className="text-sm text-text-muted">
        No saved connections yet. Add one under"Connect database".
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border/60 border border-border/60 bg-bg-surface/30">
      {connections.map((connection) => (
        <li
          key={connection.id}
          className="flex items-center justify-between gap-3 px-4 py-3"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-text-primary">
              {connection.name}
            </p>
            <p className="truncate text-xs text-text-muted">
              {DIALECT_LABEL[connection.dialect]} &middot;{""}
              {connection.dialect ==="sqlite"
                ? connection.database
                : `${connection.host ??"localhost"}${connection.port ? `:${connection.port}` :""} / ${connection.database}`}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onSelect(connection)}
              className="border border-accent/60 bg-accent/20 px-3 py-1.5 text-xs text-accent"
            >
              Connect
            </button>
            <button
              type="button"
              onClick={() => remove(connection.id)}
              disabled={deletingId === connection.id}
              className="border border-border px-3 py-1.5 text-xs text-text-muted disabled:opacity-50"
            >
              {deletingId === connection.id ?"Removing..." :"Remove"}
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
