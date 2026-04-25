import { StrictMode } from"react";
import { createRoot } from"react-dom/client";
import { BrowserRouter } from"react-router-dom";
import { QueryClient, QueryClientProvider } from"@tanstack/react-query";
import App from"./App";
import { LoadingSplash } from"./components/LoadingSplash";
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
        <LoadingSplash />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
