import type { ColumnMapping } from "@/types/dataset";

export interface SampleDescriptor {
  id: string;
  domain: string;
  filename: string;
  publicPath: string;
  description: string;
  rowCount: string;
  horizon: string;
  /** Pre-filled column mapping so the forecast is one click away. */
  mapping: ColumnMapping;
  /** Where to navigate after the sample finishes uploading. Defaults to
   * /compare/<id> via the samples picker. */
  redirectTo?: string;
}

export const SAMPLES: SampleDescriptor[] = [
  {
    id: "daily-sales",
    domain: "Retail sales",
    filename: "daily_sales_demo.csv",
    publicPath: "/samples/daily_sales_demo.csv",
    description: "Three years of daily sales for two stores, with promotions, holidays, and weather.",
    rowCount: "2,192 rows, 2 series",
    horizon: "30 to 90 days ahead",
    mapping: { value_col: "sales", date_col: "date", series_id_col: "series", freq: "D" },
  },
  {
    id: "web-traffic",
    domain: "Web analytics",
    filename: "website_traffic_demo.csv",
    publicPath: "/samples/website_traffic_demo.csv",
    description: "Two years of daily sessions split across desktop and mobile traffic.",
    rowCount: "1,460 rows, 2 series",
    horizon: "14 to 60 days ahead",
    mapping: { value_col: "sessions", date_col: "date", series_id_col: "series", freq: "D" },
  },
  {
    id: "energy",
    domain: "Energy usage",
    filename: "energy_consumption_demo.csv",
    publicPath: "/samples/energy_consumption_demo.csv",
    description: "Hourly kilowatt-hours for two buildings with daily and weekly cycles.",
    rowCount: "4,320 rows, 2 series",
    horizon: "24 to 168 hours ahead",
    mapping: { value_col: "kwh", date_col: "timestamp", series_id_col: "series", freq: "H" },
  },
  {
    id: "monthly-revenue",
    domain: "Finance",
    filename: "monthly_revenue_demo.csv",
    publicPath: "/samples/monthly_revenue_demo.csv",
    description: "Six years of monthly revenue for two regions with a steady trend and annual seasonality.",
    rowCount: "144 rows, 2 series",
    horizon: "6 to 18 months ahead",
    mapping: { value_col: "revenue_usd", date_col: "month", series_id_col: "series", freq: "MS" },
  },
];
