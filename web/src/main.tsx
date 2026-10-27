import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { Toaster } from 'sonner';
import { ApiError } from './lib/api';
import { ConfirmProvider } from './components/ui';
import App from './App';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 20_000,
      refetchOnWindowFocus: false,
      retry: (n, e) => !(e instanceof ApiError && e.status >= 400 && e.status < 500) && n < 2,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <TooltipPrimitive.Provider>
          <ConfirmProvider>
            <App />
          </ConfirmProvider>
        </TooltipPrimitive.Provider>
      </BrowserRouter>
      <Toaster position="top-right" richColors closeButton toastOptions={{ className: 'font-sans' }} />
    </QueryClientProvider>
  </StrictMode>,
);
