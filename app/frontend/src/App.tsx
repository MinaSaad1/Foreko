import { lazy, Suspense, useEffect, useState } from "react";
import { Link, NavLink, Route, Routes, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { StatusBar } from "@/components/StatusBar";
import { LoadingSplash } from "@/components/LoadingSplash";
import { Tour } from "@/components/Tour";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { useDocumentTitle } from "@/utils/useDocumentTitle";
import { useThemeStore } from "@/stores/themeStore";
import { useDatasetStore } from "@/stores/datasetStore";
import { api } from "@/api/endpoints";

const LandingPage = lazy(() => import("@/pages/LandingPage").then((m) => ({ default: m.LandingPage })));
const DataPage = lazy(() => import("@/pages/DataPage").then((m) => ({ default: m.DataPage })));
const GlossaryPage = lazy(() => import("@/pages/GlossaryPage").then((m) => ({ default: m.GlossaryPage })));
const PrivacyPage = lazy(() => import("@/pages/PrivacyPage").then((m) => ({ default: m.PrivacyPage })));
const AboutPage = lazy(() => import("@/pages/AboutPage").then((m) => ({ default: m.AboutPage })));
const NotFoundPage = lazy(() => import("@/pages/NotFoundPage").then((m) => ({ default: m.NotFoundPage })));
const ComparisonPage = lazy(() => import("@/pages/ComparisonPage").then((m) => ({ default: m.ComparisonPage })));
const AnomalyPage = lazy(() => import("@/pages/AnomalyPage").then((m) => ({ default: m.AnomalyPage })));
const CovariatesPage = lazy(() => import("@/pages/CovariatesPage").then((m) => ({ default: m.CovariatesPage })));
const BacktestPage = lazy(() => import("@/pages/BacktestPage").then((m) => ({ default: m.BacktestPage })));
const DiagnosticsPage = lazy(() => import("@/pages/DiagnosticsPage").then((m) => ({ default: m.DiagnosticsPage })));
const PreflightPage = lazy(() => import("@/pages/PreflightPage").then((m) => ({ default: m.PreflightPage })));
const ExplainPage = lazy(() => import("@/pages/ExplainPage").then((m) => ({ default: m.ExplainPage })));
const ScenariosPage = lazy(() => import("@/pages/ScenariosPage").then((m) => ({ default: m.ScenariosPage })));
const SegmentsPage = lazy(() => import("@/pages/SegmentsPage").then((m) => ({ default: m.SegmentsPage })));
const OperationsPage = lazy(() => import("@/pages/OperationsPage").then((m) => ({ default: m.OperationsPage })));

interface SideNavItemProps {
  to: string;
  label: string;
  icon: string;
  isOpen: boolean;
  /** Extra path prefixes that should also light up this nav entry. */
  alsoActiveOn?: string[];
}

function NavSection({
  label,
  isOpen,
  children,
}: {
  label: string;
  isOpen: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className={`px-3 ${isOpen ? "" : "flex justify-center text-text-muted/40"}`}>
        <p className={`font-mono text-[10px] uppercase tracking-widest text-text-muted ${isOpen ? "" : "sr-only"}`}>
          {label}
        </p>
        {!isOpen && <span aria-hidden>·</span>}
      </div>
      <nav className="flex flex-col gap-1" aria-label={label}>
        {children}
      </nav>
    </div>
  );
}

function SideNavItem({ to, label, icon, isOpen, alsoActiveOn }: SideNavItemProps) {
  const location = useLocation();
  const aliasMatch = alsoActiveOn?.some((p) => location.pathname.startsWith(p)) ?? false;
  return (
    <NavLink
      to={to}
      title={!isOpen ? label : undefined}
      className={({ isActive }) =>
        `group flex items-center px-3 py-2.5 text-sm transition-colors border-l-2 overflow-hidden whitespace-nowrap ${
          isActive || aliasMatch
            ? "border-accent bg-accent/15 text-accent font-medium shadow-[inset_2px_0_10px_rgb(var(--color-accent)/0.15)]"
            : "border-transparent text-text-secondary hover:border-text-muted/30 hover:bg-bg-elevated/50 hover:text-text-primary hover:shadow-sm"
        }`
      }
    >
      <span
        className={`flex justify-center transition-all duration-300 ${
          isOpen ? "w-6 min-w-[24px] mr-3 text-base" : "w-10 min-w-[40px] text-lg group-hover:text-accent group-hover:scale-110"
        }`}
        aria-hidden
      >
        {icon}
      </span>
      <span
        className={`transition-all duration-300 ${
          isOpen ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-4"
        }`}
      >
        {label}
      </span>
    </NavLink>
  );
}

function ActiveDatasetBadge({ isOpen }: { isOpen: boolean }) {
  const activeDatasetId = useDatasetStore((s) => s.activeDatasetId);
  const { data: preview } = useQuery({
    queryKey: ["dataset-preview", activeDatasetId],
    queryFn: () => api.datasetPreview(activeDatasetId!),
    enabled: !!activeDatasetId,
    staleTime: Infinity,
  });
  if (!activeDatasetId || !preview) return null;

  const name = preview.filename.replace(/\.[^.]+$/, "");

  return (
    <Link
      to="/data"
      title={`Active dataset: ${preview.filename}, click to switch`}
      className="flex items-center gap-2 px-3 py-2 border border-accent/30 bg-accent/10 hover:bg-accent/20 hover:border-accent/60 transition-colors overflow-hidden"
    >
      <span className="shrink-0 h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
      <span
        className={`font-mono text-[10px] uppercase tracking-widest text-accent truncate transition-all duration-300 ${
          isOpen ? "opacity-100 max-w-full" : "opacity-0 max-w-0"
        }`}
      >
        {name}
      </span>
    </Link>
  );
}

function RouteFallback() {
  return (
    <div className="flex items-center justify-center py-16" role="status" aria-live="polite">
      <div className="h-8 w-8 border-2 border-border/60 border-t-accent rounded-full animate-spin" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}

function DocumentTitleSync() {
  const location = useLocation();
  const PAGE_TITLES: Record<string, string | undefined> = {
    "/": undefined,
    "/data": "Data",
    "/upload": "Data",
    "/datasets": "Data",
    "/compare": "Forecast",
    "/backtest": "Backtest",
    "/diagnostics": "Diagnostics",
    "/anomaly": "Anomalies",
    "/explain": "Explain",
    "/covariates": "Factors",
    "/scenarios": "Scenarios",
    "/segments": "Segments",
    "/preflight": "Data Quality",
    "/ops": "Operations",
    "/glossary": "Glossary",
    "/privacy": "Privacy",
    "/about": "About",
  };
  const base = "/" + (location.pathname.split("/")[1] ?? "");
  const title = PAGE_TITLES[base];
  useDocumentTitle(title);
  return null;
}

export default function App() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const location = useLocation();
  const isLanding = location.pathname === "/";
  const theme = useThemeStore((s) => s.theme);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.classList.toggle("light", theme === "light");
  }, [theme]);

  useEffect(() => {
    const main = document.getElementById("main-content");
    if (main) main.scrollTop = 0;
  }, [location.pathname]);

  return (
    <div className="flex h-full flex-col bg-transparent relative z-10">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:bg-accent focus:text-on-accent focus:px-3 focus:py-1 focus:font-mono focus:text-xs focus:uppercase focus:tracking-widest"
      >
        Skip to content
      </a>
      <LoadingSplash />
      <Tour />
      <DocumentTitleSync />

      <StatusBar
        showSidebarToggle={!isLanding}
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
      />

      <div className="flex flex-1 overflow-hidden">
        {!isLanding && (
          <aside
            className={`flex shrink-0 flex-col border-r border-border-strong/70 bg-bg-surface relative z-40 overflow-y-auto transition-all duration-300 ease-in-out ${
              isSidebarOpen ? "w-56" : "w-[68px]"
            }`}
          >
            <div className={`flex flex-col gap-4 py-6 ${isSidebarOpen ? "px-2" : "px-1"}`}>
              <ActiveDatasetBadge isOpen={isSidebarOpen} />

              <NavSection label="Data" isOpen={isSidebarOpen}>
                <SideNavItem to="/data" label="Ingest" icon="⊞" isOpen={isSidebarOpen} alsoActiveOn={["/upload", "/datasets"]} />
                <SideNavItem to="/preflight" label="Data Quality" icon="⚑" isOpen={isSidebarOpen} />
              </NavSection>
              <NavSection label="Models" isOpen={isSidebarOpen}>
                <SideNavItem to="/compare" label="Forecast" icon="∿" isOpen={isSidebarOpen} />
                <SideNavItem to="/backtest" label="Backtest" icon="◈" isOpen={isSidebarOpen} />
              </NavSection>
              <NavSection label="Findings" isOpen={isSidebarOpen}>
                <SideNavItem to="/anomaly" label="Anomalies" icon="◉" isOpen={isSidebarOpen} />
                <SideNavItem to="/explain" label="Explain" icon="◈" isOpen={isSidebarOpen} />
                <SideNavItem to="/diagnostics" label="Diagnostics" icon="◇" isOpen={isSidebarOpen} />
              </NavSection>
              <NavSection label="Factors" isOpen={isSidebarOpen}>
                <SideNavItem to="/covariates" label="Factors" icon="+" isOpen={isSidebarOpen} />
                <SideNavItem to="/segments" label="Segments" icon="⊟" isOpen={isSidebarOpen} />
              </NavSection>
              <NavSection label="Scenarios" isOpen={isSidebarOpen}>
                <SideNavItem to="/scenarios" label="What-if" icon="⇆" isOpen={isSidebarOpen} />
              </NavSection>
              <NavSection label="Operations" isOpen={isSidebarOpen}>
                <SideNavItem to="/ops" label="Annotations & Export" icon="⚙" isOpen={isSidebarOpen} />
              </NavSection>

              <div
                className={`mt-2 border-t border-border/30 px-3 pt-4 space-y-1 transition-opacity duration-300 ${
                  isSidebarOpen ? "opacity-100" : "opacity-0 pointer-events-none"
                }`}
              >
                <p className="font-mono text-[9px] uppercase tracking-widest text-text-muted whitespace-nowrap">
                  <span className="inline-block w-1.5 h-1.5 bg-positive mr-1.5" aria-hidden />
                  Data stays on this machine
                </p>
                <Link to="/privacy" className="block font-mono text-[9px] uppercase tracking-widest text-text-muted hover:text-accent whitespace-nowrap">
                  Privacy →
                </Link>
                <Link to="/glossary" className="block font-mono text-[9px] uppercase tracking-widest text-text-muted hover:text-accent whitespace-nowrap">
                  Glossary →
                </Link>
                <Link to="/about" className="block font-mono text-[9px] uppercase tracking-widest text-text-muted hover:text-accent whitespace-nowrap">
                  About →
                </Link>
              </div>
            </div>
          </aside>
        )}

        <main
          id="main-content"
          className={`flex-1 overflow-auto relative z-10 ${isLanding ? "" : "px-8 py-8"}`}
          tabIndex={-1}
        >
          <ErrorBoundary>
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/" element={<LandingPage />} />
                <Route path="/data" element={<DataPage />} />
                <Route path="/upload" element={<DataPage />} />
                <Route path="/datasets" element={<DataPage />} />
                <Route path="/glossary" element={<GlossaryPage />} />
                <Route path="/privacy" element={<PrivacyPage />} />
                <Route path="/about" element={<AboutPage />} />
                <Route path="/compare/:datasetId?" element={<ComparisonPage />} />
                <Route path="/anomaly/:datasetId?" element={<AnomalyPage />} />
                <Route path="/covariates/:datasetId?" element={<CovariatesPage />} />
                <Route path="/backtest/:datasetId?" element={<BacktestPage />} />
                <Route path="/diagnostics/:datasetId?" element={<DiagnosticsPage />} />
                <Route path="/preflight/:datasetId?" element={<PreflightPage />} />
                <Route path="/explain/:datasetId?" element={<ExplainPage />} />
                <Route path="/scenarios/:datasetId?" element={<ScenariosPage />} />
                <Route path="/segments/:datasetId?" element={<SegmentsPage />} />
                <Route path="/ops/:datasetId?" element={<OperationsPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>

      <Toaster
        richColors
        theme={theme}
        position="top-right"
        toastOptions={{
          style: {
            borderRadius: "0",
            fontFamily: "Outfit, sans-serif",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          },
          className: "shadow-[var(--shadow-elev-2)] backdrop-blur-xl",
        }}
      />
    </div>
  );
}
