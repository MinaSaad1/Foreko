import { api } from"@/api/endpoints";
import type { DatasetPreview } from"@/types/dataset";

export async function loadSampleDataset(
 publicPath: string,
 filename: string,
): Promise<DatasetPreview> {
 const res = await fetch(publicPath);
 if (!res.ok) {
 throw new Error(`Failed to fetch sample dataset (${res.status})`);
 }
 const blob = await res.blob();
 const file = new File([blob], filename, { type: "text/csv" });
 return api.uploadDataset(file);
}

const DEMO_PATH = "/samples/daily_sales_demo.csv";
const DEMO_FILENAME = "daily_sales_demo.csv";

export function loadDemoDataset(): Promise<DatasetPreview> {
 return loadSampleDataset(DEMO_PATH, DEMO_FILENAME);
}
