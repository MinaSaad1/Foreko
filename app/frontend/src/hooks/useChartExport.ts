import { useCallback, type RefObject } from "react";
import type ReactECharts from "echarts-for-react";

interface UseChartExportOptions {
  filename: string;
  backgroundColor?: string;
  type?: "png" | "jpeg" | "svg";
  pixelRatio?: number;
}

export interface ChartExportHandle {
  export: () => Promise<void>;
}

export interface ChartHandle {
  getPng: (opts?: { backgroundColor?: string; pixelRatio?: number }) => string | null;
}

export function getChartPng(
  ref: RefObject<ReactECharts | null>,
  opts: { backgroundColor?: string; pixelRatio?: number } = {},
): string | null {
  const inst = ref.current?.getEchartsInstance();
  if (!inst) return null;
  return inst.getDataURL({
    type: "png",
    backgroundColor: opts.backgroundColor ?? "#ffffff",
    pixelRatio: opts.pixelRatio ?? 3,
  });
}

export function useChartExport(
  chartRef: RefObject<ReactECharts | null>,
  {
    filename,
    backgroundColor = "#030712",
    type = "png",
    pixelRatio = 3,
  }: UseChartExportOptions,
): ChartExportHandle {
  const exportChart = useCallback(async () => {
    const inst = chartRef.current?.getEchartsInstance();
    if (!inst) return;

    const dataUrl = inst.getDataURL({ type, backgroundColor, pixelRatio });
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const blobUrl = window.URL.createObjectURL(blob);

    const anchor = document.createElement("a");
    anchor.download = filename.endsWith(`.${type}`) ? filename : `${filename}.${type}`;
    anchor.href = blobUrl;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.URL.revokeObjectURL(blobUrl);
  }, [chartRef, filename, backgroundColor, type, pixelRatio]);

  return { export: exportChart };
}
