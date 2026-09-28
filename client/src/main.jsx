import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { queryClient } from './lib/queryClient';
import { router } from './app/router';
import { AuthProvider } from './features/auth/AuthContext';
import { CityProvider } from './features/discovery/CityContext';
import './index.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <CityProvider>
          <RouterProvider router={router} />
          <Toaster position="top-center" richColors closeButton />
        </CityProvider>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>
);
