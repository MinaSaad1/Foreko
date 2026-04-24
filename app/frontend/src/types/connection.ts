export type Dialect = "postgresql" | "mysql" | "sqlite" | "mssql";

export interface ConnectionCreate {
  name: string;
  dialect: Dialect;
  host?: string | null;
  port?: number | null;
  database: string;
  username?: string | null;
  password?: string | null;
  options?: Record<string, unknown>;
}

export interface Connection {
  id: string;
  name: string;
  dialect: Dialect;
  host?: string | null;
  port?: number | null;
  database: string;
  username?: string | null;
  options: Record<string, unknown>;
  created_at: string;
}

export interface ConnectionTestRequest {
  connection_id?: string;
  draft?: ConnectionCreate;
}

export interface ConnectionTestResult {
  ok: boolean;
  server_version?: string | null;
  latency_ms?: number | null;
  error?: string | null;
}

export interface TableInfo {
  schema_name?: string | null;
  name: string;
  row_estimate?: number | null;
}

export interface QueryRequest {
  sql: string;
  limit?: number;
}

export interface IngestRequest {
  sql: string;
  name?: string | null;
}

export interface SecretsBackendInfo {
  available: boolean;
  backend?: string | null;
}

export const DIALECT_DEFAULT_PORT: Record<Dialect, number | null> = {
  postgresql: 5432,
  mysql: 3306,
  mssql: 1433,
  sqlite: null,
};

export const DIALECT_LABEL: Record<Dialect, string> = {
  postgresql: "PostgreSQL",
  mysql: "MySQL / MariaDB",
  mssql: "SQL Server",
  sqlite: "SQLite",
};
