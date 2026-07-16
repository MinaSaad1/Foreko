import { StrictMode } from"react";
import { createRoot } from"react-dom/client";
import { BrowserRouter } from"react-router-dom";
import { QueryClient, QueryClientProvider } from"@tanstack/react-query";
import App from"./App";

// Self-hosted fonts. These replace a Google Fonts stylesheet: the previous link
// made an outbound request on every page load, which contradicted the README's
// claim that the only outbound request is the one-time model download.
import "@fontsource/inter/300.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/outfit/400.css";
import "@fontsource/outfit/500.css";
import "@fontsource/outfit/600.css";
import "@fontsource/outfit/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import"./styles/index.css";

const queryClient = new QueryClient({
 defaultOptions: {
 queries: {
 refetchOnWindowFocus: false,
 retry: 1,
 staleTime: 30_000,
 },
 },
});

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("#root not found");

createRoot(rootEl).render(
 <StrictMode>
 <QueryClientProvider client={queryClient}>
 <BrowserRouter>
 <App />
 </BrowserRouter>
 </QueryClientProvider>
 </StrictMode>,
);
