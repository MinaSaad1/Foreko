import { api } from "@/api/endpoints";
import type { DatasetPreview } from "@/types/dataset";

const DEMO_PATH = "/samples/daily_sales_demo.csv";
const DEMO_FILENAME = "daily_sales_demo.csv";

export async function loadDemoDataset(): Promise<DatasetPreview> {
  const res = await fetch(DEMO_PATH);
  if (!res.ok) {
    throw new Error(`Failed to fetch demo dataset (${res.status})`);
  }
  const blob = await res.blob();
  const file = new File([blob], DEMO_FILENAME, { type: "text/csv" });
  return api.uploadDataset(file);
}
