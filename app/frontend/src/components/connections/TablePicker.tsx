import { useEffect, useMemo, useState } from"react";
import { api } from"@/api/endpoints";
import { friendlyError } from"@/utils/toast";
import type { Connection, TableInfo } from"@/types/connection";
import type { DatasetPreview } from"@/types/dataset";

interface TablePickerProps {
  connection: Connection;
  onBack: () => void;
  onImported: (preview: DatasetPreview) => void;
}

function defaultSelectSql(table: TableInfo): string {
  const qualified = table.schema_name ? `${table.schema_name}.${table.name}` : table.name;
  return `SELECT * FROM ${qualified}`;
}

export function TablePicker({ connection, onBack, onImported }: TablePickerProps) {
  const [tables, setTables] = useState<TableInfo[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [sql, setSql] = useState<string>("");
  const [preview, setPreview] = useState<DatasetPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setListError(null);
    api
      .listTables(connection.id)
      .then((rows) => {
        if (cancelled) return;
        setTables(rows);
        if (rows.length && !sql) {
          setSql(defaultSelectSql(rows[0]));
        }
      })
      .catch((err) => {
        if (!cancelled) setListError(friendlyError(err));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection.id]);

  const grouped = useMemo(() => {
    if (!tables) return null;
    const out = new Map<string, TableInfo[]>();
    for (const t of tables) {
      const key = t.schema_name ??"default";
      if (!out.has(key)) out.set(key, []);
      out.get(key)!.push(t);
    }
    return out;
  }, [tables]);

  const runPreview = async () => {
    if (!sql.trim()) return;
    setPreviewing(true);
    setPreview(null);
    setPreviewError(null);
    try {
      const p = await api.previewQuery(connection.id, { sql, limit: 100 });
      setPreview(p);
    } catch (err) {
      setPreviewError(friendlyError(err));
    } finally {
      setPreviewing(false);
    }
  };

  const runImport = async () => {
    if (!sql.trim()) return;
    setImporting(true);
    setPreviewError(null);
    try {
      const dataset = await api.ingestQuery(connection.id, { sql });
      onImported(dataset);
    } catch (err) {
      setPreviewError(friendlyError(err));
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-text-muted">Connected to</p>
          <p className="font-medium text-text-primary">{connection.name}</p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="border border-border px-3 py-1.5 text-xs text-text-muted"
        >
          Back
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
        <div className="border border-border/60 bg-bg-surface/30 p-3">
          <p className="mb-2 text-xs uppercase tracking-wide text-text-muted">Tables</p>
          {listError && (
            <p className="border border-anomaly/30 bg-anomaly/10 px-2 py-1.5 text-xs text-anomaly">
              {listError}
            </p>
          )}
          {tables === null && !listError && (
            <p className="text-xs text-text-muted">Loading tables...</p>
          )}
          {grouped &&
            Array.from(grouped.entries()).map(([schema, rows]) => (
              <div key={schema} className="mb-3 last:mb-0">
                <p className="text-xs font-semibold text-text-muted">{schema}</p>
                <ul className="mt-1 space-y-1">
                  {rows.map((t) => (
                    <li key={`${schema}.${t.name}`}>
                      <button
                        type="button"
                        onClick={() => setSql(defaultSelectSql(t))}
                        className="block w-full truncate rounded px-2 py-1 text-left text-xs text-text-primary hover:bg-accent/10"
                      >
                        {t.name}
                        {t.row_estimate != null && (
                          <span className="ml-2 text-text-muted">
                            ~{t.row_estimate.toLocaleString()} rows
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
        </div>

        <div className="space-y-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-text-muted">SQL query</span>
            <textarea
              value={sql}
              onChange={(e) => setSql(e.target.value)}
              rows={8}
              className="border border-border bg-bg-surface/60 px-3 py-2 font-mono text-sm text-text-primary"
              placeholder="SELECT date, value FROM sales ORDER BY date"
            />
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={runPreview}
              disabled={!sql.trim() || previewing}
              className="border border-border px-4 py-2 text-sm text-text-primary disabled:opacity-50"
            >
              {previewing ?"Running..." :"Preview"}
            </button>
            <button
              type="button"
              onClick={runImport}
              disabled={!sql.trim() || importing}
              className="border border-accent/60 bg-accent/20 px-4 py-2 text-sm text-accent disabled:opacity-50"
            >
              {importing ?"Importing..." :"Import"}
            </button>
          </div>
          {previewError && (
            <p className="border border-anomaly/30 bg-anomaly/10 px-3 py-2 text-sm text-anomaly">
              {previewError}
            </p>
          )}
          {preview && (
            <div className="border border-border/60 bg-bg-surface/30 p-3 text-xs text-text-muted">
              <p>
                {preview.row_count} rows &middot; {preview.columns.length} columns
              </p>
              <p className="mt-1 truncate">
                Columns: {preview.columns.map((c) => c.name).join(",")}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
