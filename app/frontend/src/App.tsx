import { lazy, Suspense, useEffect, useState } from "react";
import { Link, NavLink, Route, Routes, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import { ModelStatusBar } from "@/components/ModelStatusBar";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { useDocumentTitle } from "@/utils/useDocumentTitle";

const LandingPage = lazy(() => import("@/pages/LandingPage").then((m) => ({ default: m.LandingPage })));
const UploadPage = lazy(() => import("@/pages/UploadPage").then((m) => ({ default: m.UploadPage })));
const GlossaryPage = lazy(() => import("@/pages/GlossaryPage").then((m) => ({ default: m.GlossaryPage })));
const PrivacyPage = lazy(() => import("@/pages/PrivacyPage").then((m) => ({ default: m.PrivacyPage })));
const AboutPage = lazy(() => import("@/pages/AboutPage").then((m) => ({ default: m.AboutPage })));
const NotFoundPage = lazy(() => import("@/pages/NotFoundPage").then((m) => ({ default: m.NotFoundPage })));
const ComparisonPage = lazy(() => import("@/pages/ComparisonPage").then((m) => ({ default: m.ComparisonPage })));
const AnomalyPage = lazy(() => import("@/pages/AnomalyPage").then((m) => ({ default: m.AnomalyPage })));
const CovariatesPage = lazy(() => import("@/pages/CovariatesPage").then((m) => ({ default: m.CovariatesPage })));
const DatasetsPage = lazy(() => import("@/pages/DatasetsPage").then((m) => ({ default: m.DatasetsPage })));
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
}

function SideNavItem({ to, label, icon, isOpen }: SideNavItemProps) {
  return (
    <NavLink
      to={to}
      title={!isOpen ? label : undefined}
      className={({ isActive }) =>
        `group flex items-center px-3 py-2.5 text-sm transition-all duration-300 border-l-2 overflow-hidden whitespace-nowrap ${
          isActive
            ? "border-accent bg-accent/10 text-accent font-medium shadow-[inset_2px_0_10px_rgba(0,240,255,0.1)]"
            : "border-transparent text-text-secondary hover:border-text-muted/30 hover:bg-bg-elevated/50 hover:text-text-primary hover:shadow-sm"
        }`
      }
    >
      <span className={`flex justify-center transition-all duration-300 ${isOpen ? "w-6 min-w-[24px] mr-3 text-base" : "w-10 min-w-[40px] text-lg group-hover:text-accent group-hover:scale-110"}`} aria-hidden>
        {icon}
      </span>
      <span className={`transition-all duration-300 ${isOpen ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-4"}`}>
        {label}
      </span>
    </NavLink>
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
    "/upload": "Upload",
    "/datasets": "Datasets",
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

  // Reset scroll on route change — keeps long analysis pages from leaving users in the middle.
  useEffect(() => {
    const main = document.getElementById("main-content");
    if (main) main.scrollTop = 0;
  }, [location.pathname]);

  return (
    <div className="flex h-full flex-col bg-transparent relative z-10">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:bg-accent focus:text-bg-base focus:px-3 focus:py-1 focus:font-mono focus:text-xs focus:uppercase focus:tracking-widest"
      >
        Skip to content
      </a>
      <DocumentTitleSync />

      {/* Top bar */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border/50 bg-bg-surface/60 backdrop-blur-md px-4 sticky top-0 z-50">
        <div className="flex items-center gap-4">
          {!isLanding && (
            <button
              type="button"
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              aria-label={isSidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
              aria-pressed={isSidebarOpen}
              className="flex h-8 w-8 items-center justify-center text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors"
              title="Toggle sidebar"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="square" strokeLinejoin="miter" strokeWidth={2} d="M4 5h16v14H4z M9 5v14" />
              </svg>
            </button>
          )}

          <Link to="/" className="flex items-center gap-2 group" aria-label="Foresee home">
            <img
              src="/foresee-logo.png"
              alt=""
              aria-hidden="true"
              className="h-8 w-8 object-contain drop-shadow-[0_0_6px_rgba(0,240,255,0.35)] group-hover:drop-shadow-[0_0_10px_rgba(0,240,255,0.55)] transition-all duration-300"
            />
            <span className="font-display text-lg font-semibold bg-gradient-to-r from-text-primary to-text-secondary bg-clip-text text-transparent tracking-wide group-hover:from-white group-hover:to-text-primary transition-all duration-300">
              Foresee
            </span>
          </Link>
        </div>
        {!isLanding && <ModelStatusBar />}
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar — hidden on landing */}
        {!isLanding && (
          <aside className={`flex shrink-0 flex-col border-r border-border/50 bg-bg-surface/40 backdrop-blur-md relative z-40 transition-all duration-300 ease-in-out ${isSidebarOpen ? "w-56 px-2 py-6" : "w-[68px] px-1 py-6"}`}>
            <nav className={`flex flex-col gap-1 transition-all duration-300 ${isSidebarOpen ? "pr-1" : ""}`} aria-label="Primary">
              <SideNavItem to="/upload" label="Upload" icon="↑" isOpen={isSidebarOpen} />
              <SideNavItem to="/datasets" label="Datasets" icon="⊞" isOpen={isSidebarOpen} />
            </nav>

            <div className="mt-6 border-t border-border/30 pt-6">
              <div className={`transition-all duration-300 overflow-hidden ${isSidebarOpen ? "h-6 opacity-100" : "h-0 opacity-0"}`}>
                <p className="px-3 font-mono text-xs text-text-muted uppercase tracking-widest whitespace-nowrap">
                  Analysis
                </p>
              </div>
              <nav className="flex flex-col gap-1" aria-label="Analysis">
                <SideNavItem to="/preflight" label="Data Quality" icon="⚑" isOpen={isSidebarOpen} />
                <SideNavItem to="/compare" label="Forecast" icon="∿" isOpen={isSidebarOpen} />
                <SideNavItem to="/backtest" label="Backtest" icon="◈" isOpen={isSidebarOpen} />
                <SideNavItem to="/diagnostics" label="Diagnostics" icon="◇" isOpen={isSidebarOpen} />
                <SideNavItem to="/anomaly" label="Anomalies" icon="◉" isOpen={isSidebarOpen} />
                <SideNavItem to="/explain" label="Explain" icon="◈" isOpen={isSidebarOpen} />
                <SideNavItem to="/covariates" label="Factors" icon="+" isOpen={isSidebarOpen} />
                <SideNavItem to="/scenarios" label="Scenarios" icon="⇆" isOpen={isSidebarOpen} />
                <SideNavItem to="/segments" label="Segments" icon="⊟" isOpen={isSidebarOpen} />
              </nav>
            </div>

            <div className="mt-6 border-t border-border/30 pt-6">
              <div className={`transition-all duration-300 overflow-hidden ${isSidebarOpen ? "h-6 opacity-100" : "h-0 opacity-0"}`}>
                <p className="px-3 font-mono text-xs text-text-muted uppercase tracking-widest whitespace-nowrap">
                  Manage
                </p>
              </div>
              <nav className="flex flex-col gap-1" aria-label="Manage">
                <SideNavItem to="/ops" label="Operations" icon="⚙" isOpen={isSidebarOpen} />
                <SideNavItem to="/glossary" label="Glossary" icon="𝐀" isOpen={isSidebarOpen} />
                <SideNavItem to="/about" label="About" icon="?" isOpen={isSidebarOpen} />
              </nav>
            </div>

            <div className={`mt-auto pt-6 transition-all duration-300 ${isSidebarOpen ? "opacity-100" : "opacity-0"}`}>
              <div className="border-t border-border/30 px-3 py-3 space-y-1">
                <p className="font-mono text-[9px] uppercase tracking-widest text-text-muted whitespace-nowrap">
                  <span className="inline-block w-1.5 h-1.5 bg-positive mr-1.5" aria-hidden />
                  Data stays on this machine
                </p>
                <Link to="/privacy" className="block font-mono text-[9px] uppercase tracking-widest text-text-muted hover:text-accent whitespace-nowrap">
                  Privacy →
                </Link>
              </div>
            </div>
          </aside>
        )}

        {/* Main content */}
        <main
          id="main-content"
          className={`flex-1 overflow-auto relative z-10 ${isLanding ? "" : "px-8 py-8"}`}
          tabIndex={-1}
        >
          <ErrorBoundary>
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/" element={<LandingPage />} />
                <Route path="/upload" element={<UploadPage />} />
                <Route path="/glossary" element={<GlossaryPage />} />
                <Route path="/privacy" element={<PrivacyPage />} />
                <Route path="/about" element={<AboutPage />} />
                <Route path="/datasets" element={<DatasetsPage />} />
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
        position="top-right"
        toastOptions={{
          style: {
            background: "rgba(15, 23, 42, 0.8)",
            backdropFilter: "blur(12px)",
            border: "1px solid rgba(30, 41, 59, 1)",
            color: "#F8FAFC",
            borderRadius: "0",
            fontFamily: "Outfit, sans-serif",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          },
          className: "shadow-[0_8px_32px_rgba(0,0,0,0.6)] backdrop-blur-xl",
        }}
      />
    </div>
  );
}
