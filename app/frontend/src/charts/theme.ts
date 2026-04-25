import { useThemeStore, type Theme } from "@/stores/themeStore";

export interface ChartTheme {
  theme: Theme;
  grid: string;
  axisLabel: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  bgSurface: string;
  bgElevated: string;
  accent: string;
  accentDim: string;
  positive: string;
  warning: string;
  anomaly: string;
  neutral: string;
  historical: string;
  winner: string;
  alternative: string;
  band: string;
  holdout: string;
  trend: string;
}

const DARK: ChartTheme = {
  theme: "dark",
  grid: "#1E293B",
  axisLabel: "#64748B",
  textPrimary: "#F8FAFC",
  textSecondary: "#94A3B8",
  textMuted: "#64748B",
  bgSurface: "#0F172A",
  bgElevated: "#1E293B",
  accent: "#00F0FF",
  accentDim: "rgba(0, 240, 255, 0.15)",
  positive: "#10B981",
  warning: "#F59E0B",
  anomaly: "#EF4444",
  neutral: "#3B82F6",
  historical: "#64748B",
  winner: "#00F0FF",
  alternative: "#8A2BE2",
  band: "rgba(0, 240, 255, 0.08)",
  holdout: "rgba(255, 255, 255, 0.03)",
  trend: "#64748B",
};

const LIGHT: ChartTheme = {
  theme: "light",
  grid: "#E2E8F0",
  axisLabel: "#64748B",
  textPrimary: "#0F172A",
  textSecondary: "#475569",
  textMuted: "#64748B",
  bgSurface: "#FFFFFF",
  bgElevated: "#F1F5F9",
  accent: "#0891B2",
  accentDim: "rgba(8, 145, 178, 0.15)",
  positive: "#059669",
  warning: "#D97706",
  anomaly: "#DC2626",
  neutral: "#2563EB",
  historical: "#94A3B8",
  winner: "#0891B2",
  alternative: "#7C3AED",
  band: "rgba(8, 145, 178, 0.1)",
  holdout: "rgba(15, 23, 42, 0.04)",
  trend: "#94A3B8",
};

export function getChartTheme(theme: Theme): ChartTheme {
  return theme === "light" ? LIGHT : DARK;
}

export function useChartTheme(): ChartTheme {
  const theme = useThemeStore((s) => s.theme);
  return getChartTheme(theme);
}
