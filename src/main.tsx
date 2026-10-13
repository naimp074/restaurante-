import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { migrarDatosLocales } from './lib/resetDatos';

migrarDatosLocales();

// Solo en producción: en desarrollo la caché del service worker escondería los cambios.
// Requiere https (o localhost); por http en la red del local el navegador no lo permite.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
