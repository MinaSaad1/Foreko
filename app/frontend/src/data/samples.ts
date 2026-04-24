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
}

export const SAMPLES: SampleDescriptor[] = [
  {
    id: "daily-sales",
    domain: "Retail sales",
    filename: "daily_sales_demo.csv",
    publicPath: "/samples/daily_sales_demo.csv",
    description: "Three years of daily sales with weekday patterns, promotions, and weather.",
    rowCount: "1,096 rows",
    horizon: "30 to 90 days ahead",
    mapping: { value_col: "sales", date_col: "date", freq: "D" },
  },
  {
    id: "web-traffic",
    domain: "Web analytics",
    filename: "website_traffic_demo.csv",
    publicPath: "/samples/website_traffic_demo.csv",
    description: "Two years of daily sessions with a clear weekday/weekend rhythm.",
    rowCount: "730 rows",
    horizon: "14 to 60 days ahead",
    mapping: { value_col: "sessions", date_col: "date", freq: "D" },
  },
  {
    id: "energy",
    domain: "Energy usage",
    filename: "energy_consumption_demo.csv",
    publicPath: "/samples/energy_consumption_demo.csv",
    description: "Hourly kilowatt-hours for 90 days with daily and weekly cycles.",
    rowCount: "2,160 rows",
    horizon: "24 to 168 hours ahead",
    mapping: { value_col: "kwh", date_col: "timestamp", freq: "H" },
  },
  {
    id: "monthly-revenue",
    domain: "Finance",
    filename: "monthly_revenue_demo.csv",
    publicPath: "/samples/monthly_revenue_demo.csv",
    description: "Six years of monthly revenue with a steady trend and annual seasonality.",
    rowCount: "72 rows",
    horizon: "6 to 18 months ahead",
    mapping: { value_col: "revenue_usd", date_col: "month", freq: "MS" },
  },
];
