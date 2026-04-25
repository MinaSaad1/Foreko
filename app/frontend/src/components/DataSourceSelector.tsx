import { useEffect, useState } from"react";
import { api } from"@/api/endpoints";
import { CSVUpload } from"@/components/CSVUpload";
import { ConnectionForm } from"@/components/connections/ConnectionForm";
import { ConnectionList } from"@/components/connections/ConnectionList";
import { TablePicker } from"@/components/connections/TablePicker";
import { friendlyError } from"@/utils/toast";
import type { Connection, SecretsBackendInfo } from"@/types/connection";
import type { DatasetPreview } from"@/types/dataset";

type Tab ="upload" |"connect" |"saved";

interface DataSourceSelectorProps {
  onDatasetReady: (preview: DatasetPreview) => void;
}

export function DataSourceSelector({ onDatasetReady }: DataSourceSelectorProps) {
  const [tab, setTab] = useState<Tab>("upload");
  const [selectedConnection, setSelectedConnection] = useState<Connection | null>(null);
  const [savedRefreshToken, setSavedRefreshToken] = useState(0);
  const [secretsInfo, setSecretsInfo] = useState<SecretsBackendInfo | null>(null);
  const [secretsError, setSecretsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .secretsBackend()
      .then((info) => {
        if (!cancelled) setSecretsInfo(info);
      })
      .catch((err) => {
        if (!cancelled) setSecretsError(friendlyError(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const onConnectionSaved = (connection: Connection) => {
    setSelectedConnection(connection);
    setSavedRefreshToken((t) => t + 1);
  };

  const tabs: { id: Tab; label: string }[] = [
    { id:"upload", label:"Upload file" },
    { id:"connect", label:"Connect database" },
    { id:"saved", label:"Saved connections" },
  ];

  const keyringWarning =
    secretsInfo && !secretsInfo.available ? (
      <p className="border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
        Your operating system's keychain is not available. Saved database
        connections are disabled until it is. On Linux, install gnome-keyring
        or libsecret and restart Foresee.
      </p>
    ) : null;

  if (selectedConnection) {
    return (
      <div className="space-y-4">
        <TablePicker
          connection={selectedConnection}
          onBack={() => setSelectedConnection(null)}
          onImported={onDatasetReady}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border border-border/60 bg-bg-surface/30 p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex-1 rounded px-3 py-2 text-sm transition ${
              tab === t.id
                ?"bg-accent/20 text-accent"
                :"text-text-muted hover:text-text-primary"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {secretsError && (
        <p className="border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
          {secretsError}
        </p>
      )}

      {tab ==="upload" && <CSVUpload onUploaded={onDatasetReady} />}

      {tab ==="connect" && (
        <div className="space-y-3">
          {keyringWarning}
          <ConnectionForm onSaved={onConnectionSaved} />
        </div>
      )}

      {tab ==="saved" && (
        <div className="space-y-3">
          {keyringWarning}
          <ConnectionList
            onSelect={setSelectedConnection}
            refreshToken={savedRefreshToken}
          />
        </div>
      )}
    </div>
  );
}
