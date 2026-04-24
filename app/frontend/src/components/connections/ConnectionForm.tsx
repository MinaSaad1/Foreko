import { useState } from "react";
import { api } from "@/api/endpoints";
import { friendlyError } from "@/utils/toast";
import {
  DIALECT_DEFAULT_PORT,
  DIALECT_LABEL,
  type Connection,
  type ConnectionCreate,
  type ConnectionTestResult,
  type Dialect,
} from "@/types/connection";

interface ConnectionFormProps {
  onSaved: (connection: Connection) => void;
}

const DIALECTS: Dialect[] = ["postgresql", "mysql", "sqlite", "mssql"];

function emptyForm(dialect: Dialect = "postgresql"): ConnectionCreate {
  return {
    name: "",
    dialect,
    host: "localhost",
    port: DIALECT_DEFAULT_PORT[dialect],
    database: "",
    username: "",
    password: "",
  };
}

export function ConnectionForm({ onSaved }: ConnectionFormProps) {
  const [form, setForm] = useState<ConnectionCreate>(emptyForm());
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<ConnectionTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isSqlite = form.dialect === "sqlite";

  const update = (patch: Partial<ConnectionCreate>) => {
    setForm((prev) => ({ ...prev, ...patch }));
    setResult(null);
    setError(null);
  };

  const onDialectChange = (dialect: Dialect) => {
    update({ dialect, port: DIALECT_DEFAULT_PORT[dialect] });
  };

  const runTest = async () => {
    setTesting(true);
    setError(null);
    try {
      const outcome = await api.testConnection({ draft: form });
      setResult(outcome);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const saved = await api.createConnection(form);
      onSaved(saved);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setSaving(false);
    }
  };

  const canSubmit =
    form.name.trim().length > 0 &&
    form.database.trim().length > 0 &&
    (isSqlite || (form.host ?? "").trim().length > 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-text-muted">Connection name</span>
          <input
            className="rounded-md border border-border bg-bg-surface/60 px-3 py-2 text-text-primary"
            value={form.name}
            onChange={(e) => update({ name: e.target.value })}
            placeholder="Production warehouse"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-text-muted">Database type</span>
          <select
            className="rounded-md border border-border bg-bg-surface/60 px-3 py-2 text-text-primary"
            value={form.dialect}
            onChange={(e) => onDialectChange(e.target.value as Dialect)}
          >
            {DIALECTS.map((d) => (
              <option key={d} value={d}>
                {DIALECT_LABEL[d]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!isSqlite && (
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-text-muted">Host</span>
            <input
              className="rounded-md border border-border bg-bg-surface/60 px-3 py-2 text-text-primary"
              value={form.host ?? ""}
              onChange={(e) => update({ host: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-text-muted">Port</span>
            <input
              type="number"
              className="rounded-md border border-border bg-bg-surface/60 px-3 py-2 text-text-primary"
              value={form.port ?? ""}
              onChange={(e) =>
                update({
                  port: e.target.value === "" ? null : Number(e.target.value),
                })
              }
            />
          </label>
        </div>
      )}

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-text-muted">
          {isSqlite ? "Database file path" : "Database name"}
        </span>
        <input
          className="rounded-md border border-border bg-bg-surface/60 px-3 py-2 text-text-primary"
          value={form.database}
          onChange={(e) => update({ database: e.target.value })}
          placeholder={isSqlite ? "/path/to/local.db" : "warehouse"}
        />
      </label>

      {!isSqlite && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-text-muted">Username</span>
            <input
              className="rounded-md border border-border bg-bg-surface/60 px-3 py-2 text-text-primary"
              value={form.username ?? ""}
              onChange={(e) => update({ username: e.target.value })}
              autoComplete="username"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-text-muted">Password</span>
            <input
              type="password"
              className="rounded-md border border-border bg-bg-surface/60 px-3 py-2 text-text-primary"
              value={form.password ?? ""}
              onChange={(e) => update({ password: e.target.value })}
              autoComplete="new-password"
            />
          </label>
        </div>
      )}

      <p className="text-xs text-text-muted">
        Passwords are stored in your operating system's keychain, not on disk.
      </p>

      {result && result.ok && (
        <div className="rounded-md border border-accent/30 bg-accent/10 px-3 py-2 text-sm text-accent">
          Connected to {result.server_version ?? "the database"} in{" "}
          {result.latency_ms} ms.
        </div>
      )}
      {result && !result.ok && (
        <div className="rounded-md border border-anomaly/30 bg-anomaly/10 px-3 py-2 text-sm text-anomaly">
          {result.error ?? "Could not connect."}
        </div>
      )}
      {error && (
        <div className="rounded-md border border-anomaly/30 bg-anomaly/10 px-3 py-2 text-sm text-anomaly">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={runTest}
          disabled={!canSubmit || testing}
          className="rounded-md border border-border px-4 py-2 text-sm text-text-primary disabled:opacity-50"
        >
          {testing ? "Testing..." : "Test connection"}
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!canSubmit || saving}
          className="rounded-md border border-accent/60 bg-accent/20 px-4 py-2 text-sm text-accent disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save and continue"}
        </button>
      </div>
    </div>
  );
}
