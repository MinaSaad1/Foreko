export type ColumnDType = "datetime" | "numeric" | "categorical" | "string";
export type Frequency = "infer" | "D" | "W" | "MS" | "M" | "H";

export interface ColumnInfo {
  name: string;
  dtype: ColumnDType;
  example_values: string[];
  null_fraction: number;
}

export interface DatasetPreview {
  id: string;
  filename: string;
  columns: ColumnInfo[];
  row_count: number;
  first_rows: Record<string, unknown>[];
}

export interface DateParts {
  year_col: string;
  month_col: string;
  day_col?: string | null;
}

export interface ColumnMapping {
  value_col: string;
  date_col?: string | null;
  date_parts?: DateParts | null;
  series_id_col?: string | null;
  freq?: Frequency;
}

export interface SeriesSummary {
  id: string;
  length: number;
  first_date: string | null;
  last_date: string | null;
  preview: number[];
}

export interface SeriesExtraction {
  dataset_id: string;
  inferred_freq: string | null;
  series: SeriesSummary[];
}

export interface DatasetSummary {
  id: string;
  filename: string;
  row_count: number;
  uploaded_at: string;
  size_bytes: number;
}
